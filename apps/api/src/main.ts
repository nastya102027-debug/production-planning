import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { PrismaClient, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { addWorkingDays, isDateOnly, parseDateOnly } from "./working-days.js";

import { productionRouter } from "./production.js";
import { ProductionError } from "./production-rules.js";

const prisma = new PrismaClient();
const app = express();
const configuredSecret = process.env.SESSION_SECRET;
if (!configuredSecret || configuredSecret.length < 32) throw new Error("SESSION_SECRET должен содержать минимум 32 символа");
const secret: string = configuredSecret;

type Session = { sub: string; role: UserRole };
declare global { namespace Express { interface Request { session?: Session } } }

app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

async function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = jwt.verify(req.cookies.session ?? "", secret) as unknown as Session;
    const user = await prisma.user.findFirst({ where: { id: token.sub, active: true }, select: { id: true, role: true } });
    if (!user) return res.status(401).json({ message: "Требуется вход" });
    req.session = { sub: user.id, role: user.role }; next();
  } catch { res.status(401).json({ message: "Требуется вход" }); }
}
function planner(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role !== "PLANNER") return res.status(403).json({ message: "Недостаточно прав" });
  next();
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/auth/login", async (req, res) => {
  const data=z.object({login:z.string().min(1),password:z.string().min(7)}).safeParse(req.body);
  if(!data.success) return res.status(400).json({message:"Проверьте логин и пароль"});
  const user=await prisma.user.findUnique({where:{login:data.data.login}});
  if(!user?.active || !(await argon2.verify(user.passwordHash,data.data.password))) return res.status(401).json({message:"Неверный логин или пароль"});
  const token=jwt.sign({sub:user.id,role:user.role},secret,{expiresIn:"12h"});
  res.cookie("session",token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",maxAge:12*60*60*1000});
  res.json({id:user.id,firstName:user.firstName,lastName:user.lastName,role:user.role});
});
app.post("/api/auth/logout", (_req,res)=>{res.clearCookie("session");res.status(204).end();});
app.get("/api/me",auth,async(req,res)=>{
  const user=await prisma.user.findUnique({where:{id:req.session!.sub},select:{id:true,firstName:true,lastName:true,role:true,workCenters:{select:{workCenter:{select:{id:true,name:true}}}}}});
  if(!user)return res.status(401).json({message:"Пользователь не найден"});res.json(user);
});
app.get("/api/work-centers",auth,async(req,res)=>{
  if(req.session!.role==="PLANNER")return res.json(await prisma.workCenter.findMany({where:{active:true},orderBy:{name:"asc"}}));
  const links=await prisma.userWorkCenter.findMany({where:{userId:req.session!.sub},select:{workCenter:true}});res.json(links.map(x=>x.workCenter));
});
app.use("/api", auth, productionRouter(prisma));
app.get("/api/planner/summary",auth,planner,async(_req,res)=>{
  const [orders,inProcurement,operations,stopped]=await Promise.all([
    prisma.order.count({where:{archivedAt:null}}),prisma.procurement.count({where:{status:{not:"READY"}}}),
    prisma.operation.count({where:{status:{in:["QUEUED","IN_PROGRESS","PAUSED"]}}}),prisma.operation.count({where:{status:"PAUSED"}})
  ]);res.json({orders,inProcurement,operations,stopped});
});

const orderItemInput = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  comment: z.string().trim().max(1000).optional()
});
const createOrderInput = z.object({
  productionOrderNumber: z.string().trim().min(1).max(80),
  customerOrderNumber: z.string().trim().min(1).max(80).optional(),
  organization: z.enum(["IP_VETROV", "LATUNING", "ECONTRID"]),
  drawingApprovalDate: z.string().refine(isDateOnly, "Укажите корректную дату согласования чертежей"),
  productionLeadDays: z.number().int().positive().max(3650),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  comment: z.string().trim().max(2000).optional(),
  items: z.array(orderItemInput).min(1).max(200)
});

function presentOrder(order: any) {
  const items = order.items.map((item: any) => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    total: Number(item.unitPrice) * item.quantity,
    completedTotal: Number(item.unitPrice) * item.completedQuantity
  }));
  return {
    ...order,
    items,
    total: items.reduce((sum: number, item: any) => sum + item.total, 0),
    completedTotal: items.reduce((sum: number, item: any) => sum + item.completedTotal, 0)
  };
}

app.get("/api/orders", auth, planner, async (req, res) => {
  const query = z.object({ search: z.string().trim().max(100).optional() }).parse(req.query);
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
  if (!order) return res.status(404).json({ message: "Заказ не найден" });
  res.json(presentOrder(order));
});

app.post("/api/orders", auth, planner, async (req, res) => {
  const parsed = createOrderInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Проверьте поля заказа", fields: parsed.error.flatten() });
  const input = parsed.data;
  const drawingApprovalDate = parseDateOnly(input.drawingApprovalDate);
  const dueDate = addWorkingDays(drawingApprovalDate, input.productionLeadDays);
  const exists = await prisma.order.findUnique({ where: { productionOrderNumber: input.productionOrderNumber } });
  if (exists) return res.status(409).json({ message: "Заказ с таким номером уже существует" });
  const order = await prisma.$transaction(async tx => {
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
    await tx.auditLog.create({ data: { actorId: req.session!.sub, action: "ORDER_CREATED", entityType: "Order", entityId: created.id, after: { productionOrderNumber: created.productionOrderNumber, customerOrderNumber: created.customerOrderNumber, itemCount: created.items.length } } });
    return created;
  });
  res.status(201).json(presentOrder(order));
});

const procurementInput = z.object({
  startedAt: z.string().datetime().optional(),
  expectedAt: z.string().datetime().optional(),
  responsibleId: z.string().uuid().optional(),
  status: z.enum(["NOT_REQUIRED", "WAITING", "ORDERED", "PARTIALLY_RECEIVED", "READY"]).default("WAITING"),
  comment: z.string().trim().max(2000).optional()
});

function presentProcurement(record: any) {
  const now = Date.now();
  const expected = record.expectedAt ? new Date(record.expectedAt).getTime() : null;
  const due = record.order.dueDate ? new Date(record.order.dueDate).getTime() : null;
  let deadlineState = "UNKNOWN";
  if (record.status === "READY") deadlineState = "READY";
  else if (expected && expected < now) deadlineState = "OVERDUE";
  else if (expected && due && expected > due) deadlineState = "LATE_FOR_ORDER";
  else if (expected) deadlineState = "SCHEDULED";
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
  if (!parsed.success) return res.status(400).json({ message: "Проверьте данные закупки", fields: parsed.error.flatten() });
  const orderId = String(req.params.id);
  const order = await prisma.order.findFirst({ where: { id: orderId, archivedAt: null } });
  if (!order) return res.status(404).json({ message: "Заказ не найден" });
  const record = await prisma.$transaction(async tx => {
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
    await tx.order.updateMany({ where: { id: orderId, status: { in: ["DRAFT", "PROCUREMENT", "READY_FOR_LAUNCH"] } }, data: { status: parsed.data.status === "READY" ? "READY_FOR_LAUNCH" : "PROCUREMENT" } });
    await tx.auditLog.create({ data: { actorId: req.session!.sub, action: "PROCUREMENT_UPDATED", entityType: "Procurement", entityId: procurement.id, after: { orderId, status: procurement.status, expectedAt: procurement.expectedAt } } });
    return procurement;
  });
  res.status(201).json(presentProcurement(record));
});

app.patch("/api/procurement/:id", auth, planner, async (req, res) => {
  const parsed = procurementInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Проверьте данные закупки", fields: parsed.error.flatten() });
  const current = await prisma.procurement.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ message: "Закупка не найдена" });
  const data = parsed.data;
  const record = await prisma.$transaction(async tx => {
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
    if (data.status) await tx.order.updateMany({ where: { id: current.orderId, status: { in: ["DRAFT", "PROCUREMENT", "READY_FOR_LAUNCH"] } }, data: { status: data.status === "READY" ? "READY_FOR_LAUNCH" : "PROCUREMENT" } });
    await tx.auditLog.create({ data: { actorId: req.session!.sub, action: "PROCUREMENT_UPDATED", entityType: "Procurement", entityId: current.id, after: data } });
    return updated;
  });
  res.json(presentProcurement(record));
});

app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if (error instanceof ProductionError) return res.status(error.status).json({ message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ message: "Проверьте заполненные поля", fields: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return res.status(409).json({ message: "Данные уже изменены или номер занят. Обновите страницу и повторите действие" });
  console.error(error); res.status(500).json({message:"Внутренняя ошибка сервера"});
});
app.listen(Number(process.env.API_PORT??3000),()=>console.log(`API: http://localhost:${process.env.API_PORT??3000}`));
