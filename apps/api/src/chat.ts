import express, { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { seesEverything } from "./access.js";
import type { EventHub } from "./event-hub.js";
import { orderAccessWhere } from "./order-access.js";
import { ProductionError } from "./production-rules.js";
import { MAX_CHAT_FILE_BYTES, MAX_CHAT_FILES_PER_MESSAGE, MAX_CHAT_TEXT, chatFileExtension, chatFileMime, contentDisposition, extractMentions, safeFileName } from "./chat-rules.js";

const orderId = z.string().uuid();
const messageInput = z.object({ text: z.string().trim().max(MAX_CHAT_TEXT, "Сообщение длиннее 2000 знаков").default(""), fileIds: z.array(z.string().uuid()).max(MAX_CHAT_FILES_PER_MESSAGE).default([]) });
const authorSelect = { id: true, firstName: true, lastName: true } as const;
const fileSelect = { id: true, name: true, mime: true, size: true } as const;
const orderSelect = { id: true, productionOrderNumber: true, customerOrderNumber: true, customer: true, archivedAt: true } as const;

// Чат заказа. Переписку видит тот, кто видит заказ: Планер и директор — все, сотрудник — заказы, где есть задачи его участков.
export function chatRouter(prisma: PrismaClient, hub: EventHub) {
  const router = Router();
  const chatDir = path.resolve(process.env.CHAT_DIR ?? path.join(process.cwd(), "data/chat"));

  const orderAccess = (req: Request) => orderAccessWhere(prisma, req.session!);
  async function requireOrder(req: Request, id: string) {
    const order = await prisma.order.findFirst({ where: { AND: [{ id: orderId.parse(id) }, await orderAccess(req)] }, select: orderSelect });
    if (!order) throw new ProductionError(404, "Заказ не найден");
    return order;
  }
  async function orderCenters(id: string) {
    const rows = await prisma.operation.findMany({ where: { launchItem: { launch: { orderId: id } } }, select: { workCenterId: true }, distinct: ["workCenterId"] });
    return rows.map(row => row.workCenterId);
  }
  // null — без ограничений; пустой список — переписок нет
  async function visibleOrderIds(req: Request): Promise<string[] | null> {
    if (seesEverything(req.session!.role)) return null;
    return (await prisma.order.findMany({ where: await orderAccess(req), select: { id: true } })).map(order => order.id);
  }
  const onlyOrders = (ids: string[] | null) => ids ? Prisma.sql`WHERE m."orderId" IN (${Prisma.join(ids)})` : Prisma.empty;

  router.get("/unread", async (req, res) => {
    const me = req.session!.sub, ids = await visibleOrderIds(req);
    if (ids && !ids.length) return res.json({ unread: 0, mentions: 0 });
    const [row] = await prisma.$queryRaw<{ unread: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(CASE WHEN m."seq" > COALESCE(r."lastSeq", 0) AND m."authorId" <> ${me} THEN 1 ELSE 0 END), 0)::int AS "unread"
      FROM "ChatMessage" m LEFT JOIN "ChatRead" r ON r."orderId" = m."orderId" AND r."userId" = ${me} ${onlyOrders(ids)}`);
    res.json({ unread: row?.unread ?? 0, mentions: await prisma.chatMention.count({ where: { userId: me, seenAt: null } }) });
  });

  router.get("/threads", async (req, res) => {
    const me = req.session!.sub, ids = await visibleOrderIds(req);
    if (ids && !ids.length) return res.json({ threads: [] });
    const rows = await prisma.$queryRaw<{ orderId: string; lastSeq: number; total: number; unread: number }[]>(Prisma.sql`
      SELECT m."orderId", MAX(m."seq")::int AS "lastSeq", COUNT(*)::int AS "total",
             SUM(CASE WHEN m."seq" > COALESCE(r."lastSeq", 0) AND m."authorId" <> ${me} THEN 1 ELSE 0 END)::int AS "unread"
      FROM "ChatMessage" m LEFT JOIN "ChatRead" r ON r."orderId" = m."orderId" AND r."userId" = ${me} ${onlyOrders(ids)}
      GROUP BY m."orderId" ORDER BY "lastSeq" DESC LIMIT 100`);
    const last = await prisma.chatMessage.findMany({ where: { seq: { in: rows.map(row => row.lastSeq) } }, include: { author: { select: authorSelect }, order: { select: orderSelect }, _count: { select: { files: true } } } });
    const mentions = await prisma.chatMention.findMany({ where: { userId: me, seenAt: null }, select: { message: { select: { orderId: true } } } });
    const mentioned = new Set(mentions.map(mention => mention.message.orderId));
    res.json({ threads: rows.flatMap(row => {
      const message = last.find(item => item.seq === row.lastSeq);
      return message ? [{ order: message.order, total: row.total, unread: row.unread, mentioned: mentioned.has(row.orderId), last: { text: message.text, files: message._count.files, createdAt: message.createdAt, author: message.author } }] : [];
    }) });
  });

  // заказы, по которым можно начать переписку
  router.get("/orders", async (req, res) => {
    const query = z.string().trim().max(100).parse(req.query.query ?? "");
    const search: Prisma.OrderWhereInput = query ? { OR: [{ productionOrderNumber: { contains: query, mode: "insensitive" } }, { customerOrderNumber: { contains: query, mode: "insensitive" } }, { customer: { contains: query, mode: "insensitive" } }] } : {};
    res.json(await prisma.order.findMany({ where: { AND: [{ archivedAt: null }, search, await orderAccess(req)] }, select: orderSelect, orderBy: { updatedAt: "desc" }, take: 20 }));
  });

  router.get("/threads/:orderId", async (req, res) => {
    const order = await requireOrder(req, String(req.params.orderId));
    const [messages, people, reads] = await Promise.all([
      prisma.chatMessage.findMany({ where: { orderId: order.id }, orderBy: { seq: "desc" }, take: 300, select: { id: true, seq: true, text: true, createdAt: true, author: { select: authorSelect }, files: { select: fileSelect, orderBy: { createdAt: "asc" } } } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, login: true, firstName: true, lastName: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
      prisma.chatRead.findMany({ where: { orderId: order.id, userId: { not: req.session!.sub }, user: { active: true } }, select: { lastSeq: true, user: { select: authorSelect } } })
    ]);
    res.json({ order, messages: messages.reverse(), people, reads, me: req.session!.sub });
  });

  // человек открыл переписку — она дочитана до последнего сообщения, пинги сняты
  router.post("/threads/:orderId/read", async (req, res) => {
    const order = await requireOrder(req, String(req.params.orderId)), me = req.session!.sub;
    const lastSeq = (await prisma.chatMessage.aggregate({ where: { orderId: order.id }, _max: { seq: true } }))._max.seq ?? 0;
    const before = await prisma.chatRead.findUnique({ where: { userId_orderId: { userId: me, orderId: order.id } } });
    await prisma.chatRead.upsert({ where: { userId_orderId: { userId: me, orderId: order.id } }, create: { userId: me, orderId: order.id, lastSeq }, update: { lastSeq } });
    await prisma.chatMention.updateMany({ where: { userId: me, seenAt: null, message: { orderId: order.id } }, data: { seenAt: new Date() } });
    // сигнал только когда отметка сдвинулась: иначе вкладки перечитывали бы друг друга по кругу
    if ((before?.lastSeq ?? 0) < lastSeq) hub.publishChat(order.id, await orderCenters(order.id));
    res.status(204).end();
  });

  router.post("/threads/:orderId/messages", async (req, res) => {
    const order = await requireOrder(req, String(req.params.orderId)), me = req.session!.sub;
    const input = messageInput.parse(req.body), fileIds = [...new Set(input.fileIds)];
    if (!input.text && !fileIds.length) throw new ProductionError(400, "Пустое сообщение");
    const centers = await orderCenters(order.id);
    const logins = extractMentions(input.text);
    const mentioned = logins.length ? (await prisma.user.findMany({ where: { login: { in: logins }, active: true, id: { not: me } }, select: { id: true, role: true, workCenters: { select: { workCenterId: true } } } }))
      .filter(user => seesEverything(user.role) || user.workCenters.some(link => centers.includes(link.workCenterId))) : [];
    const message = await prisma.$transaction(async tx => {
      const created = await tx.chatMessage.create({ data: { orderId: order.id, authorId: me, text: input.text } });
      if (fileIds.length) {
        const attached = await tx.chatFile.updateMany({ where: { id: { in: fileIds }, uploaderId: me, messageId: null }, data: { messageId: created.id } });
        if (attached.count !== fileIds.length) throw new ProductionError(400, "Файл не найден — прикрепите его заново");
      }
      if (mentioned.length) await tx.chatMention.createMany({ data: mentioned.map(user => ({ messageId: created.id, userId: user.id })) });
      await tx.chatRead.upsert({ where: { userId_orderId: { userId: me, orderId: order.id } }, create: { userId: me, orderId: order.id, lastSeq: created.seq }, update: { lastSeq: created.seq } });
      return tx.chatMessage.findUniqueOrThrow({ where: { id: created.id }, select: { id: true, seq: true, text: true, createdAt: true, author: { select: authorSelect }, files: { select: fileSelect } } });
    });
    hub.publishChat(order.id, centers);
    res.status(201).json(message);
  });

  // Файл приходит телом запроса (имя — в адресе), потом прикрепляется к сообщению по id.
  const rawBody = express.raw({ type: () => true, limit: MAX_CHAT_FILE_BYTES });
  const readFile = (req: Request, res: Response, next: NextFunction) => rawBody(req, res, (error?: unknown) => {
    if (!error) return next();
    next(new ProductionError(400, (error as { type?: string }).type === "entity.too.large" ? "Файл больше 10 МБ" : "Файл не удалось принять"));
  });
  const uploadLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.session!.sub, message: { message: "Слишком много файлов подряд — подождите несколько минут" } });
  router.post("/files", uploadLimit, readFile, async (req, res) => {
    const name = safeFileName(req.query.name), mime = chatFileMime(name);
    if (!mime) throw new ProductionError(400, "Такой тип файла не принимаем — фото, PDF, Word, Excel, архив или чертёж");
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ProductionError(400, "Файл не пришёл");
    // имя на диске придумываем сами: из запроса в путь не попадает ничего
    const stored = `${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString("hex")}${chatFileExtension(name)}`;
    await fs.mkdir(chatDir, { recursive: true });
    await fs.writeFile(path.join(chatDir, stored), req.body, { flag: "wx", mode: 0o640 });
    try {
      res.status(201).json(await prisma.chatFile.create({ data: { uploaderId: req.session!.sub, stored, name, mime, size: req.body.length }, select: fileSelect }));
    } catch (error) { await fs.rm(path.join(chatDir, stored), { force: true }); throw error; }
  });

  router.get("/files/:id", async (req, res) => {
    const file = await prisma.chatFile.findUnique({ where: { id: z.string().uuid().parse(req.params.id) }, include: { message: { select: { orderId: true } } } });
    if (!file) throw new ProductionError(404, "Файла нет");
    if (file.message) await requireOrder(req, file.message.orderId); else if (file.uploaderId !== req.session!.sub) throw new ProductionError(404, "Файла нет");
    const location = path.join(chatDir, path.basename(file.stored));
    if (!await fs.stat(location).then(stat => stat.isFile(), () => false)) throw new ProductionError(404, "Файл потерялся на диске");
    res.setHeader("Content-Type", file.mime); res.setHeader("Content-Disposition", contentDisposition(file.name, file.mime));
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "private, max-age=604800, immutable");
    res.sendFile(location);
  });

  // загруженное, но так и не отправленное — убираем через сутки
  async function sweep() {
    const stale = await prisma.chatFile.findMany({ where: { messageId: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true, stored: true } });
    for (const file of stale) { await fs.rm(path.join(chatDir, path.basename(file.stored)), { force: true }); await prisma.chatFile.delete({ where: { id: file.id } }); }
  }
  const sweepQuietly = () => { void sweep().catch(() => console.error("Chat sweep failed")); };
  sweepQuietly(); setInterval(sweepQuietly, 6 * 60 * 60 * 1000).unref();

  return router;
}
