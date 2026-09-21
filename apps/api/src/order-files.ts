import express, { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { chatFileExtension, chatFileMime, contentDisposition, safeFileName } from "./chat-rules.js";
import { orderAccessWhere } from "./order-access.js";
import { CALCULATOR_FILES, dealNumbers, isCalculatorFileKind, isDealNumber, sameSecret } from "./order-file-rules.js";
import { ProductionError } from "./production-rules.js";

const MAX_INTAKE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RKD_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RKD_FILES_PER_ORDER = 50;
const orderFilesDir = () => path.resolve(process.env.ORDER_FILES_DIR ?? path.join(process.cwd(), "data/order-files"));
const isFile = (location: string) => fs.stat(location).then(stat => stat.isFile() ? stat : null, () => null);

function sendStored(res: Response, location: string, name: string, mime: string) {
  res.setHeader("Content-Type", mime); res.setHeader("Content-Disposition", contentDisposition(name, mime));
  res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "private, no-cache");
  res.sendFile(location);
}

// Файлы заказа: PDF из калькулятора (общая папка, по номеру сделки), присланное из 1С и вложения чата этого заказа.
// Видит тот, кто видит заказ.
export function orderFilesRouter(prisma: PrismaClient) {
  const router = Router();
  const drawingsDir = process.env.DRAWINGS_DIR ? path.resolve(process.env.DRAWINGS_DIR) : null;
  const rawRkd = express.raw({ type: () => true, limit: MAX_RKD_FILE_BYTES });
  const readRkd = (req: Request, res: Response, next: NextFunction) => rawRkd(req, res, (error?: unknown) => {
    if (!error) return next();
    next(new ProductionError(400, (error as { type?: string }).type === "entity.too.large" ? "Файл РКД больше 25 МБ" : "Файл РКД не удалось загрузить"));
  });

  async function requireOrder(req: Request) {
    const order = await prisma.order.findFirst({ where: { AND: [{ id: z.string().uuid().parse(req.params.id) }, await orderAccessWhere(prisma, req.session!)] }, select: { id: true, productionOrderNumber: true, customerOrderNumber: true } });
    if (!order) throw new ProductionError(404, "Заказ не найден");
    return { ...order, deals: dealNumbers(order.productionOrderNumber, order.customerOrderNumber) };
  }

  router.get("/orders/:id/files", async (req, res) => {
    const order = await requireOrder(req), base = `/api/orders/${order.id}/files`;
    const files: { id: string; source: "rkd" | "calculator" | "1c" | "chat"; title: string; name: string; mime: string; size: number; url: string; createdAt: string }[] = [];
    for (const file of await prisma.rkdFile.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "desc" }, take: MAX_RKD_FILES_PER_ORDER }))
      files.push({ id: file.id, source: "rkd", title: file.name, name: file.name, mime: file.mime, size: file.size, url: `${base}/rkd/${file.id}`, createdAt: file.createdAt.toISOString() });
    if (drawingsDir) for (const deal of order.deals) for (const [kind, rule] of Object.entries(CALCULATOR_FILES)) {
      const name = rule.pattern(deal), stat = await isFile(path.join(drawingsDir, name));
      if (stat) files.push({ id: `calculator-${deal}-${kind}`, source: "calculator", title: order.deals.length > 1 ? `${rule.title} · ${deal}` : rule.title, name, mime: "application/pdf", size: stat.size, url: `${base}/calculator/${deal}/${kind}`, createdAt: stat.mtime.toISOString() });
    }
    if (order.deals.length) for (const file of await prisma.orderFile.findMany({ where: { dealNumber: { in: order.deals } }, orderBy: { createdAt: "desc" }, take: 100 }))
      files.push({ id: file.id, source: "1c", title: file.name, name: file.name, mime: file.mime, size: file.size, url: `${base}/1c/${file.id}`, createdAt: file.createdAt.toISOString() });
    for (const file of await prisma.chatFile.findMany({ where: { message: { orderId: order.id } }, orderBy: { createdAt: "desc" }, take: 100 }))
      files.push({ id: file.id, source: "chat", title: file.name, name: file.name, mime: file.mime, size: file.size, url: `/api/chat/files/${file.id}`, createdAt: file.createdAt.toISOString() });
    res.json({ files, canUploadRkd: req.session?.role === "PLANNER" });
  });

  // РКД сохраняется в PostgreSQL: в Render она не пропадёт при новом развёртывании.
  router.post("/orders/:id/rkd", readRkd, async (req, res) => {
    if (req.session?.role !== "PLANNER") throw new ProductionError(403, "Загружать РКД может только Планер");
    const order = await requireOrder(req), name = safeFileName(req.query.name), mime = chatFileMime(name);
    if (!mime) throw new ProductionError(400, "Поддерживаются PDF, Excel, CAD-файлы, документы и архивы");
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ProductionError(400, "Выберите файл для загрузки");
    const count = await prisma.rkdFile.count({ where: { orderId: order.id } });
    if (count >= MAX_RKD_FILES_PER_ORDER) throw new ProductionError(400, "В заказ можно загрузить не более 50 файлов РКД");
    const sha256 = createHash("sha256").update(req.body).digest("hex");
    const duplicate = await prisma.rkdFile.findUnique({ where: { orderId_sha256: { orderId: order.id, sha256 } }, select: { id: true } });
    if (duplicate) return res.json({ id: duplicate.id, duplicate: true });
    const file = await prisma.rkdFile.create({ data: { orderId: order.id, uploaderId: req.session.sub, name, mime, size: req.body.length, sha256, data: req.body } });
    res.status(201).json({ id: file.id, name: file.name });
  });

  router.get("/orders/:id/files/rkd/:fileId", async (req, res) => {
    const order = await requireOrder(req);
    const file = await prisma.rkdFile.findFirst({ where: { id: z.string().uuid().parse(req.params.fileId), orderId: order.id } });
    if (!file) throw new ProductionError(404, "Файл РКД по этому заказу не найден");
    res.setHeader("Content-Type", file.mime); res.setHeader("Content-Disposition", contentDisposition(file.name, file.mime));
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "private, no-cache");
    res.send(file.data);
  });

  router.delete("/orders/:id/rkd/:fileId", async (req, res) => {
    if (req.session?.role !== "PLANNER") throw new ProductionError(403, "Удалять РКД может только Планер");
    const order = await requireOrder(req);
    const file = await prisma.rkdFile.findFirst({ where: { id: z.string().uuid().parse(req.params.fileId), orderId: order.id }, select: { id: true } });
    if (!file) throw new ProductionError(404, "Файл РКД по этому заказу не найден");
    await prisma.rkdFile.delete({ where: { id: file.id } });
    res.status(204).end();
  });

  router.get("/orders/:id/files/calculator/:deal/:kind", async (req, res) => {
    const order = await requireOrder(req), deal = String(req.params.deal), kind = String(req.params.kind);
    if (!drawingsDir || !isCalculatorFileKind(kind) || !order.deals.includes(deal)) throw new ProductionError(404, "Файла по этому заказу нет");
    const name = CALCULATOR_FILES[kind].pattern(deal), location = path.join(drawingsDir, name);
    if (!await isFile(location)) throw new ProductionError(404, "Файла по этому заказу нет");
    sendStored(res, location, name, "application/pdf");
  });

  router.get("/orders/:id/files/1c/:fileId", async (req, res) => {
    const order = await requireOrder(req);
    const file = await prisma.orderFile.findUnique({ where: { id: z.string().uuid().parse(req.params.fileId) } });
    if (!file || !order.deals.includes(file.dealNumber)) throw new ProductionError(404, "Файла по этому заказу нет");
    const location = path.join(orderFilesDir(), path.basename(file.stored));
    if (!await isFile(location)) throw new ProductionError(404, "Файл потерялся на диске");
    sendStored(res, location, file.name, file.mime);
  });

  return router;
}

// Приёмник файлов из 1С: POST /api/1c/files?order=118047&name=Чертёж.pdf, тело запроса — сам файл.
// Вместо входа — общий ключ в заголовке X-Api-Key (INTAKE_TOKEN в .env; пусто — приёмник выключен).
export function intakeRouter(prisma: PrismaClient) {
  const router = Router();
  const rawBody = express.raw({ type: () => true, limit: MAX_INTAKE_FILE_BYTES });
  const readFile = (req: Request, res: Response, next: NextFunction) => rawBody(req, res, (error?: unknown) => {
    if (!error) return next();
    next(new ProductionError(400, (error as { type?: string }).type === "entity.too.large" ? "Файл больше 25 МБ" : "Файл не удалось принять"));
  });
  const limit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Слишком много запросов" } });
  const checkKey = (req: Request, _res: Response, next: NextFunction) => {
    const token = process.env.INTAKE_TOKEN ?? "";
    if (token.length < 16) return next(new ProductionError(404, "Приёмник выключен"));
    if (!sameSecret(req.get("x-api-key") ?? "", token)) return next(new ProductionError(401, "Неверный ключ"));
    next();
  };

  router.post("/files", limit, checkKey, readFile, async (req, res) => {
    const deal = typeof req.query.order === "string" ? req.query.order.trim() : "";
    if (!isDealNumber(deal)) throw new ProductionError(400, "Номер заказа — только цифры");
    const name = safeFileName(req.query.name), mime = chatFileMime(name);
    if (!mime) throw new ProductionError(400, "Такой тип файла не принимаем");
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ProductionError(400, "Файл не пришёл");
    const sha256 = createHash("sha256").update(req.body).digest("hex");
    // тот же файл по тому же заказу второй раз не складываем: 1С может повторять отправку
    const known = await prisma.orderFile.findUnique({ where: { dealNumber_sha256: { dealNumber: deal, sha256 } }, select: { id: true, name: true } });
    if (known) return res.json({ ok: true, duplicate: true, file: known });
    const dir = orderFilesDir(), stored = `${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString("hex")}${chatFileExtension(name)}`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, stored), req.body, { flag: "wx", mode: 0o640 });
    try {
      const file = await prisma.orderFile.create({ data: { dealNumber: deal, stored, name, mime, size: req.body.length, sha256 }, select: { id: true, name: true } });
      console.log(`Файл из 1С к заказу ${deal}: ${name} (${req.body.length} байт)`);
      res.status(201).json({ ok: true, file });
    } catch (error) { await fs.rm(path.join(dir, stored), { force: true }); throw error; }
  });

  return router;
}
