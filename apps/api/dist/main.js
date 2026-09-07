"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const argon2_1 = __importDefault(require("argon2"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const working_days_js_1 = require("./working-days.js");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const configuredSecret = process.env.SESSION_SECRET;
if (!configuredSecret || configuredSecret.length < 32)
    throw new Error("SESSION_SECRET должен содержать минимум 32 символа");
const secret = configuredSecret;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express_1.default.json({ limit: "1mb" }));
app.use((0, cookie_parser_1.default)());
function auth(req, res, next) {
    try {
        req.session = jsonwebtoken_1.default.verify(req.cookies.session ?? "", secret);
        next();
    }
    catch {
        res.status(401).json({ message: "Требуется вход" });
    }
}
function planner(req, res, next) {
    if (req.session?.role !== "PLANNER")
        return res.status(403).json({ message: "Недостаточно прав" });
    next();
}
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/auth/login", async (req, res) => {
    const data = zod_1.z.object({ login: zod_1.z.string().min(1), password: zod_1.z.string().min(7) }).safeParse(req.body);
    if (!data.success)
        return res.status(400).json({ message: "Проверьте логин и пароль" });
    const user = await prisma.user.findUnique({ where: { login: data.data.login } });
    if (!user?.active || !(await argon2_1.default.verify(user.passwordHash, data.data.password)))
        return res.status(401).json({ message: "Неверный логин или пароль" });
    const token = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role }, secret, { expiresIn: "12h" });
    res.cookie("session", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 12 * 60 * 60 * 1000 });
    res.json({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });
});
app.post("/api/auth/logout", (_req, res) => { res.clearCookie("session"); res.status(204).end(); });
app.get("/api/me", auth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.session.sub }, select: { id: true, firstName: true, lastName: true, role: true, workCenters: { select: { workCenter: { select: { id: true, name: true } } } } } });
    if (!user)
        return res.status(401).json({ message: "Пользователь не найден" });
    res.json(user);
});
app.get("/api/work-centers", auth, async (req, res) => {
    if (req.session.role === "PLANNER")
        return res.json(await prisma.workCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }));
    const links = await prisma.userWorkCenter.findMany({ where: { userId: req.session.sub }, select: { workCenter: true } });
    res.json(links.map(x => x.workCenter));
});
app.get("/api/operations", auth, async (req, res) => {
    const where = req.session.role === "PLANNER" ? {} : { workCenter: { users: { some: { userId: req.session.sub } } } };
    res.json(await prisma.operation.findMany({ where, include: { workCenter: true, launchItem: { include: { orderItem: { include: { order: true } } } } }, orderBy: [{ priority: "desc" }, { dueDate: "asc" }], take: 100 }));
});
app.get("/api/planner/summary", auth, planner, async (_req, res) => {
    const [orders, inProcurement, operations, stopped] = await Promise.all([
        prisma.order.count({ where: { archivedAt: null } }), prisma.procurement.count({ where: { status: { not: "READY" } } }),
        prisma.operation.count({ where: { status: { in: ["QUEUED", "IN_PROGRESS", "PAUSED"] } } }), prisma.operation.count({ where: { status: "PAUSED" } })
    ]);
    res.json({ orders, inProcurement, operations, stopped });
});
const orderItemInput = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(200),
    quantity: zod_1.z.number().int().positive(),
    unitPrice: zod_1.z.number().nonnegative(),
    comment: zod_1.z.string().trim().max(1000).optional()
});
const createOrderInput = zod_1.z.object({
    productionOrderNumber: zod_1.z.string().trim().min(1).max(80),
    customerOrderNumber: zod_1.z.string().trim().min(1).max(80).optional(),
    organization: zod_1.z.enum(["IP_VETROV", "LATUNING", "ECONTRID"]),
    drawingApprovalDate: zod_1.z.string().refine(working_days_js_1.isDateOnly, "Укажите корректную дату согласования чертежей"),
    productionLeadDays: zod_1.z.number().int().positive().max(3650),
    priority: zod_1.z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    comment: zod_1.z.string().trim().max(2000).optional(),
    items: zod_1.z.array(orderItemInput).min(1).max(200)
});
function presentOrder(order) {
    const items = order.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        total: Number(item.unitPrice) * item.quantity,
        completedTotal: Number(item.unitPrice) * item.completedQuantity
    }));
    return {
        ...order,
        items,
        total: items.reduce((sum, item) => sum + item.total, 0),
        completedTotal: items.reduce((sum, item) => sum + item.completedTotal, 0)
    };
}
app.get("/api/orders", auth, planner, async (req, res) => {
    const query = zod_1.z.object({ search: zod_1.z.string().trim().max(100).optional() }).parse(req.query);
    const orders = await prisma.order.findMany({
        where: {
            archivedAt: null,
            ...(query.search ? { OR: [
                    { productionOrderNumber: { contains: query.search, mode: "insensitive" } },
                    { customerOrderNumber: { contains: query.search, mode: "insensitive" } },
                    { customer: { contains: query.search, mode: "insensitive" } }
                ] } : {})
        },
        include: { items: true, procurement: true },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 100
    });
    res.json(orders.map(presentOrder));
});
app.get("/api/orders/:id", auth, planner, async (req, res) => {
    const order = await prisma.order.findFirst({ where: { id: String(req.params.id), archivedAt: null }, include: { items: true, procurement: true, launches: true } });
    if (!order)
        return res.status(404).json({ message: "Заказ не найден" });
    res.json(presentOrder(order));
});
app.post("/api/orders", auth, planner, async (req, res) => {
    const parsed = createOrderInput.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Проверьте поля заказа", fields: parsed.error.flatten() });
    const input = parsed.data;
    const drawingApprovalDate = (0, working_days_js_1.parseDateOnly)(input.drawingApprovalDate);
    const dueDate = (0, working_days_js_1.addWorkingDays)(drawingApprovalDate, input.productionLeadDays);
    const exists = await prisma.order.findUnique({ where: { productionOrderNumber: input.productionOrderNumber } });
    if (exists)
        return res.status(409).json({ message: "Заказ с таким номером уже существует" });
    const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
            data: {
                productionOrderNumber: input.productionOrderNumber,
                customerOrderNumber: input.customerOrderNumber || null,
                organization: input.organization,
                drawingApprovalDate,
                productionLeadDays: input.productionLeadDays,
                dueDate,
                priority: input.priority,
                comment: input.comment || null,
                items: { create: input.items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        comment: item.comment || null
                    })) }
            },
            include: { items: true, procurement: true }
        });
        await tx.auditLog.create({ data: { actorId: req.session.sub, action: "ORDER_CREATED", entityType: "Order", entityId: created.id, after: { productionOrderNumber: created.productionOrderNumber, customerOrderNumber: created.customerOrderNumber, itemCount: created.items.length } } });
        return created;
    });
    res.status(201).json(presentOrder(order));
});
const procurementInput = zod_1.z.object({
    startedAt: zod_1.z.string().datetime().optional(),
    expectedAt: zod_1.z.string().datetime().optional(),
    responsibleId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(["NOT_REQUIRED", "WAITING", "ORDERED", "PARTIALLY_RECEIVED", "READY"]).default("WAITING"),
    comment: zod_1.z.string().trim().max(2000).optional()
});
function presentProcurement(record) {
    const now = Date.now();
    const expected = record.expectedAt ? new Date(record.expectedAt).getTime() : null;
    const due = record.order.dueDate ? new Date(record.order.dueDate).getTime() : null;
    let deadlineState = "UNKNOWN";
    if (record.status === "READY")
        deadlineState = "READY";
    else if (expected && expected < now)
        deadlineState = "OVERDUE";
    else if (expected && due && expected > due)
        deadlineState = "LATE_FOR_ORDER";
    else if (expected)
        deadlineState = "SCHEDULED";
    return { ...record, order: presentOrder(record.order), deadlineState };
}
app.get("/api/users", auth, planner, async (_req, res) => {
    res.json(await prisma.user.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }));
});
app.get("/api/procurement", auth, planner, async (_req, res) => {
    const records = await prisma.procurement.findMany({
        include: { responsible: { select: { id: true, firstName: true, lastName: true } }, order: { include: { items: true } } },
        orderBy: [{ expectedAt: "asc" }, { startedAt: "asc" }],
        take: 100
    });
    res.json(records.map(presentProcurement));
});
app.post("/api/orders/:id/procurement", auth, planner, async (req, res) => {
    const parsed = procurementInput.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Проверьте данные закупки", fields: parsed.error.flatten() });
    const orderId = String(req.params.id);
    const order = await prisma.order.findFirst({ where: { id: orderId, archivedAt: null } });
    if (!order)
        return res.status(404).json({ message: "Заказ не найден" });
    const record = await prisma.$transaction(async (tx) => {
        const procurement = await tx.procurement.upsert({
            where: { orderId },
            update: {
                startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : undefined,
                expectedAt: parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null,
                responsibleId: parsed.data.responsibleId || null,
                status: parsed.data.status,
                comment: parsed.data.comment || null,
                readyAt: parsed.data.status === "READY" ? new Date() : null
            },
            create: {
                orderId,
                startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
                expectedAt: parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null,
                responsibleId: parsed.data.responsibleId || null,
                status: parsed.data.status,
                comment: parsed.data.comment || null,
                readyAt: parsed.data.status === "READY" ? new Date() : null
            },
            include: { responsible: true, order: { include: { items: true } } }
        });
        await tx.order.update({ where: { id: orderId }, data: { status: parsed.data.status === "READY" ? "READY_FOR_LAUNCH" : "PROCUREMENT" } });
        await tx.auditLog.create({ data: { actorId: req.session.sub, action: "PROCUREMENT_UPDATED", entityType: "Procurement", entityId: procurement.id, after: { orderId, status: procurement.status, expectedAt: procurement.expectedAt } } });
        return procurement;
    });
    res.status(201).json(presentProcurement(record));
});
app.patch("/api/procurement/:id", auth, planner, async (req, res) => {
    const parsed = procurementInput.partial().safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Проверьте данные закупки", fields: parsed.error.flatten() });
    const current = await prisma.procurement.findUnique({ where: { id: String(req.params.id) } });
    if (!current)
        return res.status(404).json({ message: "Закупка не найдена" });
    const data = parsed.data;
    const record = await prisma.$transaction(async (tx) => {
        const updated = await tx.procurement.update({
            where: { id: current.id },
            data: {
                startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
                expectedAt: data.expectedAt ? new Date(data.expectedAt) : undefined,
                responsibleId: data.responsibleId,
                status: data.status,
                comment: data.comment,
                ...(data.status ? { readyAt: data.status === "READY" ? new Date() : null } : {})
            },
            include: { responsible: true, order: { include: { items: true } } }
        });
        if (data.status)
            await tx.order.update({ where: { id: current.orderId }, data: { status: data.status === "READY" ? "READY_FOR_LAUNCH" : "PROCUREMENT" } });
        await tx.auditLog.create({ data: { actorId: req.session.sub, action: "PROCUREMENT_UPDATED", entityType: "Procurement", entityId: current.id, after: data } });
        return updated;
    });
    res.json(presentProcurement(record));
});
const routeInput = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(200),
    steps: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string().trim().min(1).max(200),
        workCenterId: zod_1.z.string().uuid(),
        predecessorIndexes: zod_1.z.array(zod_1.z.number().int().nonnegative()).default([])
    })).min(1).max(100)
});
app.get("/api/order-items/:id/routes", auth, planner, async (req, res) => {
    res.json(await prisma.route.findMany({
        where: { orderItemId: String(req.params.id), active: true },
        include: { steps: { include: { workCenter: true, predecessors: true }, orderBy: { position: "asc" } } },
        orderBy: { version: "desc" }
    }));
});
app.post("/api/order-items/:id/routes", auth, planner, async (req, res) => {
    const parsed = routeInput.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Проверьте маршрут", fields: parsed.error.flatten() });
    const orderItemId = String(req.params.id);
    const item = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item)
        return res.status(404).json({ message: "Позиция заказа не найдена" });
    const invalidDependency = parsed.data.steps.some((step, index) => step.predecessorIndexes.some(predecessor => predecessor >= index));
    if (invalidDependency)
        return res.status(400).json({ message: "Шаг может зависеть только от предыдущих шагов маршрута" });
    const centers = await prisma.workCenter.count({ where: { id: { in: [...new Set(parsed.data.steps.map(step => step.workCenterId))] }, active: true } });
    if (centers !== new Set(parsed.data.steps.map(step => step.workCenterId)).size)
        return res.status(400).json({ message: "Один из участков не найден или отключён" });
    const route = await prisma.$transaction(async (tx) => {
        const version = (await tx.route.aggregate({ where: { orderItemId }, _max: { version: true } }))._max.version ?? 0;
        const created = await tx.route.create({ data: { orderItemId, name: parsed.data.name, version: version + 1 } });
        const steps = [];
        for (let index = 0; index < parsed.data.steps.length; index++) {
            const input = parsed.data.steps[index];
            steps.push(await tx.routeStep.create({ data: { routeId: created.id, title: input.title, workCenterId: input.workCenterId, position: index + 1 } }));
        }
        for (let index = 0; index < parsed.data.steps.length; index++) {
            for (const predecessorIndex of parsed.data.steps[index].predecessorIndexes) {
                await tx.routeStepDependency.create({ data: { predecessorId: steps[predecessorIndex].id, successorId: steps[index].id } });
            }
        }
        await tx.auditLog.create({ data: { actorId: req.session.sub, action: "ROUTE_CREATED", entityType: "Route", entityId: created.id, after: { orderItemId, name: created.name, stepCount: steps.length } } });
        return tx.route.findUniqueOrThrow({ where: { id: created.id }, include: { steps: { include: { workCenter: true, predecessors: true }, orderBy: { position: "asc" } } } });
    });
    res.status(201).json(route);
});
const launchInput = zod_1.z.object({
    number: zod_1.z.string().trim().min(1).max(80),
    orderId: zod_1.z.string().uuid(),
    priority: zod_1.z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    plannedStart: zod_1.z.string().datetime().optional(),
    plannedFinish: zod_1.z.string().datetime().optional(),
    items: zod_1.z.array(zod_1.z.object({ orderItemId: zod_1.z.string().uuid(), routeId: zod_1.z.string().uuid(), quantity: zod_1.z.number().int().positive() })).min(1).max(200)
});
app.get("/api/launches", auth, planner, async (_req, res) => {
    res.json(await prisma.productionLaunch.findMany({
        include: { order: true, items: { include: { orderItem: true, route: true, operations: { include: { workCenter: true } } } } },
        orderBy: [{ plannedStart: "asc" }, { createdAt: "desc" }],
        take: 100
    }));
});
app.post("/api/launches", auth, planner, async (req, res) => {
    const parsed = launchInput.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Проверьте данные запуска", fields: parsed.error.flatten() });
    const input = parsed.data;
    const duplicate = await prisma.productionLaunch.findUnique({ where: { number: input.number } });
    if (duplicate)
        return res.status(409).json({ message: "Запуск с таким номером уже существует" });
    const order = await prisma.order.findFirst({ where: { id: input.orderId, archivedAt: null }, include: { items: { include: { launchItems: true, routes: { where: { active: true }, include: { steps: { orderBy: { position: "asc" } } } } } } } });
    if (!order)
        return res.status(404).json({ message: "Заказ не найден" });
    for (const requested of input.items) {
        const item = order.items.find(current => current.id === requested.orderItemId);
        if (!item)
            return res.status(400).json({ message: "Позиция не принадлежит выбранному заказу" });
        const route = item.routes.find(current => current.id === requested.routeId);
        if (!route)
            return res.status(400).json({ message: `Для позиции «${item.name}» выбран недоступный маршрут` });
        const launched = item.launchItems.reduce((sum, current) => sum + current.quantity, 0);
        if (launched + requested.quantity > item.quantity)
            return res.status(409).json({ message: `Для позиции «${item.name}» доступно к запуску: ${item.quantity - launched}` });
    }
    const launch = await prisma.$transaction(async (tx) => {
        const created = await tx.productionLaunch.create({ data: { orderId: input.orderId, number: input.number, priority: input.priority, plannedStart: input.plannedStart ? new Date(input.plannedStart) : null, plannedFinish: input.plannedFinish ? new Date(input.plannedFinish) : null } });
        for (const requested of input.items) {
            const route = order.items.flatMap(item => item.routes).find(current => current.id === requested.routeId);
            const launchItem = await tx.productionLaunchItem.create({ data: { launchId: created.id, orderItemId: requested.orderItemId, routeId: requested.routeId, quantity: requested.quantity } });
            for (const step of route.steps) {
                await tx.operation.create({ data: { launchItemId: launchItem.id, workCenterId: step.workCenterId, title: step.title, quantity: requested.quantity, priority: input.priority, dueDate: input.plannedFinish ? new Date(input.plannedFinish) : null } });
            }
        }
        await tx.order.update({ where: { id: input.orderId }, data: { status: "IN_PRODUCTION" } });
        await tx.auditLog.create({ data: { actorId: req.session.sub, action: "PRODUCTION_LAUNCH_CREATED", entityType: "ProductionLaunch", entityId: created.id, after: { orderId: input.orderId, number: created.number, itemCount: input.items.length } } });
        return tx.productionLaunch.findUniqueOrThrow({ where: { id: created.id }, include: { order: true, items: { include: { orderItem: true, route: true, operations: { include: { workCenter: true } } } } } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(launch);
});
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: "Внутренняя ошибка сервера" }); });
app.listen(Number(process.env.API_PORT ?? 3000), () => console.log(`API: http://localhost:${process.env.API_PORT ?? 3000}`));
