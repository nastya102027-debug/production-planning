import {productionAnalytics} from "./analytics.js";
import {isDateOnly,parseDateOnly,subtractWorkingDays} from "./working-days.js";
import {remainingPlanInput} from "./remaining-plan.js";
import {calculateOrderForecast,forecastOrderInclude,forecastOperationsInclude} from "./order-forecast-service.js";
import {forecastAttention} from "./forecast-attention.js";
import {calendarInput} from "./work-calendar.js";
import {capacityForecast,relatedTasks} from "./capacity-forecast.js";
import { parseGraph, routeDetails } from "./route-graph.js";
import { Router, type Response } from "express";
import { Prisma, type PrismaClient, type OperationStatus } from "@prisma/client";
import { z } from "zod";
import { ProductionError, validateSteps, nextStatus, elapsedSeconds, downtimeSeconds } from "./production-rules.js";

const routeInput = z.object({ name: z.string().trim().min(1).max(200), steps: z.array(z.object({
  ...routeDetails, title: z.string().trim().min(1).max(200), workCenterId: z.string().uuid(), predecessorIndexes: z.array(z.number().int().nonnegative()).default([])
})).min(1).max(100) });
const launchInput = z.object({
  number: z.string().trim().min(1).max(80).optional(), orderId: z.string().uuid(), priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  plannedStart: z.string().datetime().optional(), plannedFinish: z.string().datetime().optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), routeId: z.string().uuid(), quantity: z.number().int().positive() })).min(1).max(200)
});
const routeInclude = { steps: { include: { workCenter: true, predecessors: true }, orderBy: { position: "asc" as const } } };
const launchInclude = { order: true, items: { include: { orderItem: true, route: { include: routeInclude }, operations: { include: { workCenter: true, predecessors: { include: { predecessor: { select: { id: true, status: true } } } } } } } } };
const operationInclude = {
  assignee: { select: { id: true, firstName: true, lastName: true, active: true } },
  workCenter: true, predecessors: { include: { predecessor: { select: { id: true, status: true, title: true } } } },
  launchItem: { include: { launch: { select: { number: true, plannedStart: true } }, route: { include: routeInclude }, orderItem: { select: { id: true, name: true, quantity: true, comment: true, order: { select: { id: true, productionOrderNumber: true } } } } } },
  timeEntries: true, statusHistory: { orderBy: { changedAt: "asc" as const }, include: { changedBy: { select: { firstName: true, lastName: true } } } }
};

export function productionRouter(prisma: PrismaClient) {
  const router = Router();
  const streams = new Set<{ res: Response; planner: boolean; centers: string[] }>();
  function publish(centers: string[] = []) {
    for (const stream of streams) if (stream.planner || stream.centers.some(id => centers.includes(id))) stream.res.write('event: changed\ndata: {}\n\n');
  }
  router.get("/events", async (req, res) => {
    const links = await prisma.userWorkCenter.findMany({ where: { userId: req.session!.sub } });
    res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
    const stream = { res, planner: req.session!.role === "PLANNER", centers: links.map(link => link.workCenterId) };
    streams.add(stream); res.write('event: changed\ndata: {}\n\n');
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    req.on("close", () => { clearInterval(heartbeat); streams.delete(stream); });
  });
  const plannerOnly = (req: any, _res: any, next: any) => { if (req.session.role !== "PLANNER") throw new ProductionError(403, "Недостаточно прав"); next(); };

  router.get("/order-items/:id/routes", plannerOnly, async (req, res) => {
    res.json(await prisma.route.findMany({ where: { orderItemId: String(req.params.id), active: true, orderItem: { archivedAt: null, order: { archivedAt: null } } }, include: routeInclude, orderBy: { version: "desc" } }));
  });
  router.post("/order-items/:id/routes", plannerOnly, async (req, res) => {
    const input = req.body && "nodes" in req.body ? parseGraph(req.body) : routeInput.parse(req.body); validateSteps(input.steps);
    const orderItemId = String(req.params.id);
    const route = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${orderItemId} FOR UPDATE`;
      const item = await tx.orderItem.findFirst({ where: { id: orderItemId, archivedAt: null, order: { archivedAt: null } } });
      if (!item) throw new ProductionError(404, "Позиция не найдена");
      const ids = [...new Set(input.steps.map(step => step.workCenterId))];
      if (await tx.workCenter.count({ where: { id: { in: ids }, active: true } }) !== ids.length) throw new ProductionError(400, "Участок не найден или отключён");
      const version = (await tx.route.aggregate({ where: { orderItemId }, _max: { version: true } }))._max.version ?? 0;
      const created = await tx.route.create({ data: { orderItemId, name: input.name, version: version + 1 } });
      const steps = [];
      for (const [index, step] of input.steps.entries()) steps.push(await tx.routeStep.create({ data: { routeId: created.id, title: step.title, workCenterId: step.workCenterId, position: index + 1, canvasX: step.canvasX, canvasY: step.canvasY, material: step.material, quantity: step.quantity, unit: step.unit, comment: step.comment, components: step.components } }));
      for (const [index, step] of input.steps.entries()) for (const predecessor of step.predecessorIndexes) await tx.routeStepDependency.create({ data: { predecessorId: steps[predecessor].id, successorId: steps[index].id } });
      await tx.auditLog.create({ data: { actorId: req.session!.sub, action: "ROUTE_CREATED", entityType: "Route", entityId: created.id, after: input } });
      return tx.route.findUniqueOrThrow({ where: { id: created.id }, include: routeInclude });
    });
    res.status(201).json(route);
  });
  router.get("/planning/orders", plannerOnly, async (req, res) => {
    const query = z.object({ search: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const where: Prisma.OrderWhereInput = { archivedAt: null, ...(query.search ? { OR: [{ productionOrderNumber: { contains: query.search, mode: "insensitive" } }, { items: { some: { name: { contains: query.search, mode: "insensitive" } } } }] } : {}) };
    const [items, total] = await prisma.$transaction([prisma.order.findMany({ where, include: { items: { include: { launchItems: { select: { quantity: true } } } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * 30, take: 30 }), prisma.order.count({ where })]);
    res.json({ items: items.map(order => ({ ...order, items: order.items.map(item => ({ ...item, unitPrice: Number(item.unitPrice), launchedQuantity: item.launchItems.reduce((sum, launch) => sum + launch.quantity, 0), launchItems: undefined })) })), total });
  });
  router.get("/launches", plannerOnly, async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    res.json(await prisma.productionLaunch.findMany({ include: launchInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }));
  });
  router.post("/launches", plannerOnly, async (req, res) => {
    const input = launchInput.parse(req.body);
    if (new Set(input.items.map(item => item.orderItemId)).size !== input.items.length) throw new ProductionError(400, "Позиции запуска не должны повторяться");
    if (input.plannedStart && input.plannedFinish && new Date(input.plannedFinish) < new Date(input.plannedStart)) throw new ProductionError(400, "Завершение не может быть раньше начала");
    const launch = await prisma.$transaction(async tx => {
      // All launches of one order serialize before reading the remaining quantity.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: input.orderId, archivedAt: null }, include: { items: { where: { archivedAt: null }, include: { launchItems: true, routes: { where: { active: true }, include: routeInclude } } } } });
      if (!order) throw new ProductionError(404, "Заказ не найден");
      const plannedFinish = order.dueDate ? subtractWorkingDays(order.dueDate, 3) : null;
      if (input.plannedStart && plannedFinish && plannedFinish < new Date(input.plannedStart)) throw new ProductionError(400, "Плановое начало не может быть позже окончания производства");
      const launchNumber = `${order.productionOrderNumber}-${(await tx.productionLaunch.count({ where: { orderId: order.id } })) + 1}`;
      for (const requested of input.items) {
        const item = order.items.find(item => item.id === requested.orderItemId);
        if (!item) throw new ProductionError(400, "Позиция не принадлежит заказу");
        const route = item.routes.find(route => route.id === requested.routeId);
        if (!route?.steps.length) throw new ProductionError(400, `Выберите маршрут позиции «${item.name}»`);
        const remaining = item.quantity - item.launchItems.reduce((sum, launch) => sum + launch.quantity, 0);
        if (requested.quantity > remaining) throw new ProductionError(409, `Для позиции «${item.name}» доступно: ${remaining}`);
      }
      const created = await tx.productionLaunch.create({ data: { orderId: input.orderId, number: launchNumber, priority: input.priority, plannedStart: input.plannedStart ? new Date(input.plannedStart) : null, plannedFinish } });
      for (const requested of input.items) {
        const item = order.items.find(item => item.id === requested.orderItemId)!;
        const route = item.routes.find(route => route.id === requested.routeId)!;
        const launchItem = await tx.productionLaunchItem.create({ data: { launchId: created.id, ...requested } });
        const operationByStep = new Map<string, string>();
        const savedPlan=remainingPlanInput.safeParse(item.remainingPlan);
        for (const step of route.steps) {
          const operation = await tx.operation.create({ data: { launchItemId: launchItem.id, normHours:savedPlan.success&&savedPlan.data.routeId===route.id?(savedPlan.data.steps.find(s=>s.stepId===step.id)?.hoursPerUnit??0)*requested.quantity||null:null, workCenterId: step.workCenterId, title: step.title || step.workCenter.name, quantity: requested.quantity, priority: input.priority, dueDate: input.plannedFinish ? new Date(input.plannedFinish) : order.dueDate, comment: item.comment,
            statusHistory: { create: { changedById: req.session!.sub, toStatus: "QUEUED" } } } });
          operationByStep.set(step.id, operation.id);
        }
        for (const step of route.steps) for (const dependency of step.predecessors) await tx.operationDependency.create({ data: { predecessorId: operationByStep.get(dependency.predecessorId)!, successorId: operationByStep.get(step.id)! } });
        await tx.orderItem.update({ where: { id: item.id }, data: { status: item.completedQuantity ? "PARTIALLY_READY" : "IN_PRODUCTION" } });
      }
      await tx.order.update({ where: { id: order.id }, data: { status: order.items.some(item => item.completedQuantity) ? "PARTIALLY_READY" : "IN_PRODUCTION" } });
      await tx.auditLog.create({ data: { actorId: req.session!.sub, action: "PRODUCTION_LAUNCH_CREATED", entityType: "ProductionLaunch", entityId: created.id, after: input } });
      return tx.productionLaunch.findUniqueOrThrow({ where: { id: created.id }, include: launchInclude });
    }, { timeout: 20000 });
    publish(launch.items.flatMap(item => item.operations.map(operation => operation.workCenterId)));
    res.status(201).json(launch);
  });

  function presentOperation(operation: Prisma.OperationGetPayload<{ include: typeof operationInclude }>) {
    const now = new Date();
    const actualStart=operation.timeEntries.reduce<Date|undefined>((first,entry)=>!first||entry.startedAt<first?entry.startedAt:first,undefined);
    const actualFinish=[...operation.statusHistory].reverse().find(event=>event.toStatus==="COMPLETED")?.changedAt;
    return { normHours: operation.normHours, riskHours: operation.riskHours, id: operation.id, title: operation.title, quantity: operation.quantity, status: operation.status, priority: operation.priority,
      comment: operation.comment, stopReason: operation.stopReason, assignee: operation.assignee, workCenter: { id: operation.workCenter.id, name: operation.workCenter.name },
      orderNumber: operation.launchItem.orderItem.order.productionOrderNumber, itemId: operation.launchItem.orderItem.id, itemQuantity: operation.launchItem.orderItem.quantity, itemName: operation.launchItem.orderItem.name, launchNumber: operation.launchItem.launch.number,
      route: { id: operation.launchItem.route.id, name: operation.launchItem.route.name, steps: operation.launchItem.route.steps.map(step => ({ id: step.id, title: step.title, workCenter: step.workCenter.name, material: step.material, quantity: step.quantity, unit: step.unit, components: step.components })) },
      plannedStart: operation.plannedStart ?? operation.launchItem.launch.plannedStart, stagePlannedStart: operation.plannedStart, plannedFinish: operation.plannedFinish, queueOrder: operation.queueOrder, planVersion: operation.planVersion, dueDate: operation.plannedFinish ?? operation.dueDate, predecessors: operation.predecessors.map(link => link.predecessor),
      actualStart, actualFinish, workSeconds: elapsedSeconds(operation.timeEntries, now), downtimeSeconds: downtimeSeconds(operation.statusHistory, now), serverNow: now.toISOString(),
      history: operation.statusHistory.map(event => ({ id: event.id, status: event.toStatus, reason: event.reason, at: event.changedAt, actor: `${event.changedBy.lastName} ${event.changedBy.firstName}` })) };
  }
  router.get("/operations", async (req, res) => {
    const query = z.object({ workCenterId: z.string().uuid().optional(), assigneeId: z.string().uuid().optional(), unassigned: z.enum(["true"]).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(), deadline: z.enum(["TODAY", "OVERDUE"]).optional(), status: z.enum(["QUEUED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"]).optional(), search: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);const dayEnd=new Date(dayStart);dayEnd.setUTCDate(dayEnd.getUTCDate()+1);
    const deadlineWhere:Prisma.OperationWhereInput=query.deadline==="TODAY"?{OR:[{plannedFinish:{gte:dayStart,lt:dayEnd}},{plannedFinish:null,dueDate:{gte:dayStart,lt:dayEnd}}]}:query.deadline==="OVERDUE"?{OR:[{plannedFinish:{lt:dayStart}},{plannedFinish:null,dueDate:{lt:dayStart}}]}:{};
    const searchWhere:Prisma.OperationWhereInput[]=query.search?[{OR:[{launchItem:{orderItem:{name:{contains:query.search,mode:"insensitive"}}}},{launchItem:{orderItem:{order:{productionOrderNumber:{contains:query.search,mode:"insensitive"}}}}},{launchItem:{launch:{number:{contains:query.search,mode:"insensitive"}}}}]}]:[];
    const where: Prisma.OperationWhereInput = {
      ...(req.session!.role === "PLANNER" ? {} : { workCenter: { users: { some: { userId: req.session!.sub } } } }),
      ...(query.workCenterId ? { workCenterId: query.workCenterId } : {}), ...(query.assigneeId ? { assigneeId: query.assigneeId } : query.unassigned ? { assigneeId: null } : {}), ...(query.priority ? { priority: query.priority } : {}), ...(query.status ? { status: query.status } : { status: { not: "CANCELLED" } }),
      AND:[deadlineWhere,...searchWhere]
    };
    const [items, total, groups] = await prisma.$transaction([prisma.operation.findMany({ where, include: operationInclude, orderBy: [{ queueOrder: "asc" }, { priority: "desc" }, { dueDate: "asc" }, { id: "asc" }], skip: (query.page - 1) * 40, take: 40 }), prisma.operation.count({ where }), prisma.operation.groupBy({ by: ["status"], where, orderBy: { status: "asc" }, _count: true })]);
    res.json({ items: items.map(presentOperation), total, counts: Object.fromEntries(groups.map(group => [group.status, group._count])) });
  });
  router.get("/operations/summary", async (req,res) => {
    const workCenterId=z.object({workCenterId:z.string().uuid().optional()}).parse(req.query).workCenterId;
    const where:Prisma.OperationWhereInput={...(req.session!.role==="PLANNER"?{}:{workCenter:{users:{some:{userId:req.session!.sub}}}}),...(workCenterId?{workCenterId}:{})};
    const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
    const [groups,completedToday]=await prisma.$transaction([
      prisma.operation.groupBy({by:["status"],where,orderBy:{status:"asc"},_count:true}),
      prisma.operationStatusHistory.count({where:{toStatus:"COMPLETED",changedAt:{gte:dayStart},operation:where}})
    ]);
    res.json({counts:Object.fromEntries(groups.map(group=>[group.status,group._count])),completedToday});
  });
  router.get("/operations/:id", async (req, res) => {
    const operation = await prisma.operation.findFirst({ where: { id: String(req.params.id), ...(req.session!.role === "PLANNER" ? {} : { workCenter: { users: { some: { userId: req.session!.sub } } } }) }, include: operationInclude });
    if (!operation) throw new ProductionError(404, "Задача не найдена");
    res.json(presentOperation(operation));
  });
  router.get("/work-centers/:id/calendar",plannerOnly,async(req,res)=>{
    const center=await prisma.workCenter.findUnique({where:{id:z.string().uuid().parse(req.params.id)},select:{id:true,name:true,calendar:true,calendarVersion:true,parallelSlots:true}});
    if(!center)throw new ProductionError(404,"Участок не найден");res.json(center);
  });
  router.put("/work-centers/:id/calendar",plannerOnly,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const input=z.object({calendar:calendarInput.nullable(),calendarVersion:z.number().int().nonnegative(),parallelSlots:z.number().int().min(1).max(100).nullable().optional()}).strict().parse(req.body);
    const center=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "WorkCenter" WHERE id = ${id} FOR UPDATE`;
      const before=await tx.workCenter.findUnique({where:{id}});
      if(!before)throw new ProductionError(404,"Участок не найден");
      if(before.calendarVersion!==input.calendarVersion)throw new ProductionError(409,"Календарь уже изменён. Откройте настройки заново");
      const after=await tx.workCenter.update({where:{id},data:{...(input.parallelSlots!==undefined?{parallelSlots:input.parallelSlots}:{}),calendar:input.calendar??Prisma.DbNull,calendarVersion:{increment:1}},select:{id:true,name:true,calendar:true,calendarVersion:true,parallelSlots:true}});
      await tx.auditLog.create({data:{actorId:req.session!.sub,action:"WORK_CALENDAR_UPDATED",entityType:"WorkCenter",entityId:id,before:{calendar:before.calendar,parallelSlots:before.parallelSlots},after:input}});
      return after;
    });publish([id]);res.json(center);
  });
  router.get("/order-items/:id/remaining-plan",plannerOnly,async(req,res)=>{
    const item=await prisma.orderItem.findFirst({where:{id:z.string().uuid().parse(req.params.id),archivedAt:null,order:{archivedAt:null}},include:{launchItems:{select:{quantity:true}},routes:{where:{active:true},include:routeInclude,orderBy:{version:'desc'}}}});
    if(!item)throw new ProductionError(404,"Позиция не найдена");
    res.json({plan:item.remainingPlan,version:item.remainingPlanVersion,remaining:Math.max(0,item.quantity-item.launchItems.reduce((sum,l)=>sum+l.quantity,0)),routes:item.routes});
  });
  router.put("/order-items/:id/remaining-plan",plannerOnly,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),input=z.object({version:z.number().int().nonnegative(),plan:remainingPlanInput.nullable()}).strict().parse(req.body);
    await prisma.$transaction(async tx=>{
      const owner=await tx.orderItem.findUnique({where:{id},select:{orderId:true}});
      if(!owner)throw new ProductionError(404,"Позиция не найдена");
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${owner.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${id} FOR UPDATE`;
      const item=await tx.orderItem.findFirst({where:{id,archivedAt:null,order:{archivedAt:null}},include:{launchItems:{select:{quantity:true}}}});
      if(!item)throw new ProductionError(404,"Позиция не найдена");
      if(item.remainingPlanVersion!==input.version)throw new ProductionError(409,"План изменён. Откройте форму заново");
      if(input.plan){
        const remaining=item.quantity-item.launchItems.reduce((sum,l)=>sum+l.quantity,0);
        if(remaining<=0)throw new ProductionError(409,"Вся позиция уже запущена");
        const route=await tx.route.findFirst({where:{id:input.plan.routeId,orderItemId:id,active:true},include:{steps:true}});
        if(!route||new Set(input.plan.steps.map(s=>s.stepId)).size!==route.steps.length||input.plan.steps.length!==route.steps.length||route.steps.some(s=>!input.plan!.steps.some(n=>n.stepId===s.id)))throw new ProductionError(400,"Выберите маршрут этой позиции и заполните все нормативы");
        if(input.plan.steps.some(step=>step.hoursPerUnit*remaining>100000))throw new ProductionError(400,"Норматив этапа на весь остаток не должен превышать 100000 часов");
      }
      await tx.orderItem.update({where:{id},data:{remainingPlan:input.plan??Prisma.DbNull,remainingPlanVersion:{increment:1}}});
      await tx.auditLog.create({data:{actorId:req.session!.sub,action:"REMAINING_PLAN_UPDATED",entityType:"OrderItem",entityId:id,before:{plan:item.remainingPlan},after:input}});
    });publish();res.sendStatus(204);
  });
  router.patch("/orders/:id/forecast-settings",plannerOnly,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const input=z.object({riskHours:z.number().finite().min(0).max(100000).nullable(),updatedAt:z.string().datetime()}).strict().parse(req.body);
    await prisma.$transaction(async tx=>{
      const updated=await tx.order.updateMany({where:{id,archivedAt:null,updatedAt:new Date(input.updatedAt)},data:{forecastRiskHours:input.riskHours}});
      if(!updated.count)throw new ProductionError(409,"Заказ изменён или недоступен. Обновите прогноз");
      await tx.auditLog.create({data:{actorId:req.session!.sub,action:"ORDER_FORECAST_SETTINGS",entityType:"Order",entityId:id,after:input}});
    });publish();res.sendStatus(204);
  });
  router.get("/orders/:id/forecast",plannerOnly,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),now=new Date();
    const [order,rows]=await prisma.$transaction([
      prisma.order.findFirst({where:{id,archivedAt:null},include:forecastOrderInclude}),
      prisma.operation.findMany({where:{status:{in:['QUEUED','IN_PROGRESS','PAUSED']}},include:forecastOperationsInclude})
    ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    if(!order)throw new ProductionError(404,"Заказ не найден");
    res.json(calculateOrderForecast(order,rows,now));
  });
  router.get("/planner/analytics",plannerOnly,async(req,res)=>{
    const query=z.object({from:z.string().refine(isDateOnly),to:z.string().refine(isDateOnly),workCenterId:z.string().uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query);
    const from=parseDateOnly(query.from),to=new Date(parseDateOnly(query.to).getTime()+86400000),now=new Date();
    if(to<=from||to.getTime()-from.getTime()>366*86400000)throw new ProductionError(400,"Выберите период от 1 до 366 дней");
    const [operations,centers]=await prisma.$transaction([
      prisma.operation.findMany({
        where: query.workCenterId ? { workCenterId: query.workCenterId } : {},
        select: {
            id: true, title: true, normHours: true,
          workCenter: { select: { id: true, name: true } },
          launchItem: { select: { orderItem: { select: { order: { select: { productionOrderNumber: true } } } } } },
          timeEntries: { where: { startedAt: { lt: to }, OR: [{ finishedAt: null }, { finishedAt: { gt: from } }] }, select: { startedAt: true, finishedAt: true, user: { select: { id: true, firstName: true, lastName: true } } } },
          statusHistory: { where: { changedAt: { lt: to } }, select: { id: true, fromStatus: true, toStatus: true, changedAt: true, reason: true } }
        }
      }),
      prisma.workCenter.findMany({select:{id:true,name:true},orderBy:{name:'asc'}})
    ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    const report=productionAnalytics(operations.map(op=>({...op,orderNumber:op.launchItem.orderItem.order.productionOrderNumber})),from,to,now);
    res.json({...report,stops:report.stops.slice((query.page-1)*30,query.page*30),stopTotal:report.stops.length,page:query.page,availableCenters:centers,asOf:now});
  });
  router.get("/planner/forecast-attention",plannerOnly,async(req,res)=>{
    const query=z.object({filter:z.enum(['RISK','LATE','DATA']).default('RISK'),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query);
    const now=new Date();
    const [orders,rows]=await prisma.$transaction([
      prisma.order.findMany({where:{archivedAt:null},include:forecastOrderInclude}),
      prisma.operation.findMany({where:{status:{in:['QUEUED','IN_PROGRESS','PAUSED']}},include:forecastOperationsInclude})
    ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    const report=forecastAttention(orders.map(order=>({id:order.id,number:order.productionOrderNumber,dueDate:order.dueDate,items:order.items,forecast:calculateOrderForecast(order,rows,now)})));
    const selected=report[query.filter];
    res.json({counts:Object.fromEntries(Object.entries(report).map(([key,value])=>[key,{count:value.length,amount:value.reduce((sum,row)=>sum+row.amountCents,0)/100}])),items:selected.slice((query.page-1)*30,query.page*30).map(({amountCents,...row})=>({...row,amount:amountCents/100})),total:selected.length,page:query.page,asOf:now});
  });
  router.get("/operations/:id/forecast", plannerOnly, async (req,res)=>{
    const operation=await prisma.operation.findUnique({where:{id:z.string().uuid().parse(req.params.id)}});
    if(!operation) throw new ProductionError(404,"Задача не найдена");
    const rows=await prisma.operation.findMany({where:{OR:[{id:operation.id},{status:{in:["QUEUED","IN_PROGRESS","PAUSED"]}}]},include:{workCenter:true,timeEntries:true,predecessors:{include:{predecessor:{select:{status:true}}}},launchItem:{select:{launch:{select:{plannedStart:true}}}}}});
    const now=new Date();
    const tasks=relatedTasks(rows.map(row=>({workCenterId:row.workCenterId,parallelSlots:row.workCenter.parallelSlots,queueOrder:row.queueOrder,priority:row.priority,calendar:row.workCenter.calendar?calendarInput.parse(row.workCenter.calendar):null,id:row.id,title:row.title,status:row.status,normHours:row.normHours,riskHours:row.riskHours,workHours:elapsedSeconds(row.timeEntries,now)/3600,start:row.plannedStart??row.launchItem.launch.plannedStart,due:row.plannedFinish??row.dueDate,predecessors:row.predecessors.filter(p=>p.predecessor.status!=="COMPLETED").map(p=>p.predecessorId)})),operation.id);
    const result=capacityForecast(tasks,now);
    res.json({stage:result[operation.id],stages:result,asOf:now,unlimitedCenters:[...new Set(rows.filter(row=>tasks.some(t=>t.id===row.id)&&!row.workCenter.parallelSlots).map(row=>row.workCenter.name))],continuousCenters:[...new Set(rows.filter(row=>tasks.some(t=>t.id===row.id)&&row.status!=="COMPLETED"&&!row.workCenter.calendar).map(row=>row.workCenter.name))]});
  });
  router.get("/operations/:id/assignees", plannerOnly, async (req, res) => {
    const operation = await prisma.operation.findUnique({ where: { id: z.string().uuid().parse(req.params.id) }, select: { workCenterId: true } });
    if (!operation) throw new ProductionError(404, "Задача не найдена");
    res.json(await prisma.user.findMany({ where: { role: "EMPLOYEE", active: true, workCenters: { some: { workCenterId: operation.workCenterId } } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }));
  });
  router.patch("/operations/:id/plan", plannerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = z.object({ priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]), queueOrder: z.number().int().min(-1000000).max(1000000), plannedStart: z.string().datetime().nullable(), plannedFinish: z.string().datetime().nullable(), planVersion: z.number().int().nonnegative(), normHours: z.number().finite().positive().max(100000).nullable().optional(), riskHours: z.number().finite().nonnegative().max(100000).nullable().optional(), assigneeId: z.string().uuid().nullable().optional() }).strict().parse(req.body);
    const operation = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.operation.findUnique({ where: { id }, include: operationInclude });
      if (!before) throw new ProductionError(404, "Задача не найдена");
      if (["COMPLETED", "CANCELLED"].includes(before.status)) throw new ProductionError(409, "Планирование завершённой задачи недоступно");
      if (before.planVersion !== input.planVersion) throw new ProductionError(409, "План уже изменён. Закройте форму и откройте задачу заново");
      if (input.assigneeId && !await tx.user.findFirst({ where: { id: input.assigneeId, role: "EMPLOYEE", active: true, workCenters: { some: { workCenterId: before.workCenterId } } } })) throw new ProductionError(400, "Выберите действующего сотрудника этого участка");
      const start = input.plannedStart ? new Date(input.plannedStart) : before.launchItem.launch.plannedStart;
      const finish = input.plannedFinish ? new Date(input.plannedFinish) : before.dueDate;
      if (start && finish && start > finish) throw new ProductionError(400, "Плановое завершение не может быть раньше начала");
      const updated = await tx.operation.update({ where: { id }, data: { ...(input.normHours !== undefined ? {normHours:input.normHours}:{}), ...(input.riskHours !== undefined ? {riskHours:input.riskHours}:{}), ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}), priority: input.priority, queueOrder: input.queueOrder, plannedStart: input.plannedStart, plannedFinish: input.plannedFinish, planVersion: { increment: 1 } }, include: operationInclude });
      await tx.auditLog.create({ data: { actorId: req.session!.sub, entityType: "Operation", entityId: id, action: "OPERATION_PLAN_UPDATED", before: { normHours:before.normHours, riskHours:before.riskHours, assigneeId: before.assigneeId, priority: before.priority, queueOrder: before.queueOrder, plannedStart: before.plannedStart?.toISOString() ?? null, plannedFinish: before.plannedFinish?.toISOString() ?? null }, after: input } });
      return updated;
    });
    publish([operation.workCenterId]);
    res.json(presentOperation(operation));
  });
  router.get("/planning/centers", plannerOnly, async (_req, res) => {
    const [centers, counts] = await prisma.$transaction([prisma.workCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }), prisma.operation.groupBy({ by: ["workCenterId", "status"], orderBy: { workCenterId: "asc" }, _count: true })]);
    res.json(centers.map(center => ({ ...center, counts: Object.fromEntries(counts.filter(row => row.workCenterId === center.id).map(row => [row.status, row._count])) })));
  });
  router.post("/operations/:id/actions", async (req, res) => {
    const input = z.object({ action: z.enum(["start", "pause", "resume", "complete", "cancel", "comment", "problem"]), reason: z.string().trim().max(1000).optional(), comment: z.string().trim().max(2000).optional() }).parse(req.body);
    const operationId = String(req.params.id), userId = req.session!.sub;
    const operation = await prisma.$transaction(async tx => {
      const initial = await tx.operation.findUnique({ where: { id: operationId }, select: { launchItem: { select: { orderItem: { select: { orderId: true } } } } } });
      if (!initial) throw new ProductionError(404, "Задача не найдена");
      // Share the order lock with launch creation and completion rollups.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initial.launchItem.orderItem.orderId} FOR UPDATE`;
      const current = await tx.operation.findFirst({ where: { id: operationId, ...(req.session!.role === "PLANNER" ? {} : { workCenter: { users: { some: { userId } } } }) }, include: operationInclude });
      if (!current) throw new ProductionError(404, "Задача не найдена");
      if (input.action === "cancel" && req.session!.role !== "PLANNER") throw new ProductionError(403, "Отменять операции может только Планер");
      const now = new Date();
      const note = [input.reason, input.comment].filter(Boolean).join("\n");
      if (["comment", "problem"].includes(input.action)) {
        if (!note) throw new ProductionError(400, "Введите комментарий");
        await tx.operationStatusHistory.create({ data: { operationId, changedById: userId, fromStatus: current.status, toStatus: current.status, reason: `${input.action === "problem" ? "Проблема" : "Комментарий"}: ${note}`, changedAt: now } });
      } else {
        const status = nextStatus(current.status, input.action, current.predecessors.some(link => link.predecessor.status !== "COMPLETED"), input.reason) as OperationStatus;
        await tx.operationTimeEntry.updateMany({ where: { operationId, finishedAt: null }, data: { finishedAt: now } });
        if (status === "IN_PROGRESS") await tx.operationTimeEntry.create({ data: { operationId, userId, startedAt: now } });
        await tx.operation.update({ where: { id: operationId }, data: { status, stopReason: status === "PAUSED" ? note : null, ...(status === "COMPLETED" ? { completedQuantity: current.quantity } : {}) } });
        await tx.operationStatusHistory.create({ data: { operationId, changedById: userId, fromStatus: current.status, toStatus: status, reason: note || null, changedAt: now } });
        if (status === "COMPLETED") {
          const itemId = current.launchItem.orderItem.id;
          const item = await tx.orderItem.findUniqueOrThrow({ where: { id: itemId }, include: { launchItems: { include: { operations: true } } } });
          const completedQuantity = item.launchItems.filter(launch => launch.operations.length && launch.operations.every(task => task.status === "COMPLETED")).reduce((sum, launch) => sum + launch.quantity, 0);
          await tx.orderItem.update({ where: { id: itemId }, data: { completedQuantity, status: completedQuantity === item.quantity ? "COMPLETED" : completedQuantity > 0 ? "PARTIALLY_READY" : "IN_PRODUCTION" } });
          const items = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
          await tx.order.update({ where: { id: item.orderId }, data: { status: items.every(item => item.completedQuantity === item.quantity) ? "COMPLETED" : items.some(item => item.completedQuantity > 0) ? "PARTIALLY_READY" : "IN_PRODUCTION" } });
        }
      }
      if (input.action === "pause" || input.action === "problem") {
        const planners = await tx.user.findMany({ where: { role: "PLANNER", active: true }, select: { id: true } });
        await tx.notification.create({ data: { type: input.action === "pause" ? "OPERATION_PAUSED" : "PROBLEM", title: `${current.workCenter.name} · заказ № ${current.launchItem.orderItem.order.productionOrderNumber}`, message: `${current.launchItem.orderItem.name}\n${note}`, entityType: "Operation", entityId: operationId, recipients: { create: planners.map(user => ({ userId: user.id })) } } });
      }
      await tx.auditLog.create({ data: { actorId: userId, action: `OPERATION_${input.action.toUpperCase()}`, entityType: "Operation", entityId: operationId, before: { status: current.status }, after: input } });
      return tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
    }, { timeout: 20000 });
    const related = await prisma.operation.findMany({ where: { launchItemId: operation.launchItemId }, select: { workCenterId: true } });
    publish(related.map(item => item.workCenterId)); res.json(presentOperation(operation));
  });
  router.get("/notifications", plannerOnly, async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const where = { userId: req.session!.sub };
    const [items, unread, total] = await prisma.$transaction([prisma.notificationRecipient.findMany({ where, include: { notification: true }, orderBy: { notification: { createdAt: "desc" } }, skip: (page - 1) * 30, take: 30 }), prisma.notificationRecipient.count({ where: { ...where, readAt: null } }), prisma.notificationRecipient.count({ where })]);
    res.json({ items, unread, total });
  });
  router.post("/notifications/:id/read", plannerOnly, async (req, res) => {
    await prisma.notificationRecipient.updateMany({ where: { userId: req.session!.sub, notificationId: String(req.params.id), readAt: null }, data: { readAt: new Date() } });
    publish(); res.sendStatus(204);
  });
  return router;
}
