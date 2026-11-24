import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { chatFileExtension, chatFileMime, safeFileName } from "./chat-rules.js";
import { OneCClient } from "./one-c-client.js";

const ENTITY = "Catalog_ЗаказНаПроизводствоПрисоединенныеФайлы";
const VOLUMES = "Catalog_ТомаХраненияФайлов";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

type OrderHeader = { Ref_Key: string; Number: string };
type Attachment = {
  Ref_Key: string; DataVersion: string; Description: string; ВладелецФайла_Key: string;
  Том_Key: string; ПутьКФайлу: string; Размер: number | string; Расширение: string;
  ТипХраненияФайла: string; DeletionMark: boolean;
};
type Volume = { Ref_Key: string; ПолныйПутьWindows: string; ПолныйПутьLinux: string };

const guidFilter = (field: string, ids: string[]) => ids.map(id => `${field} eq guid'${id}'`).join(" or ");

async function byRefs<T>(client: OneCClient, entity: string, field: string, ids: string[], select: string): Promise<T[]> {
  const rows: T[] = [];
  // IIS у опубликованной 1С ограничивает длину URL; кириллический $select
  // занимает много байт, поэтому запрашиваем небольшими пакетами.
  for (let index = 0; index < ids.length; index += 4) {
    const chunk = ids.slice(index, index + 4);
    rows.push(...await client.list<T>(entity, { $filter: guidFilter(field, chunk), $select: select }));
  }
  return rows;
}

export function attachmentFileName(description: string, extension: string, fallback: string): string {
  const cleanExtension = String(extension || "").replace(/^\.+/, "").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 10).toLowerCase();
  const base = safeFileName(description || fallback);
  if (!cleanExtension || chatFileExtension(base)) return base;
  return `${base}.${cleanExtension}`;
}

export function resolveOneCAttachmentPath(root: string, relative: string): string {
  const platformPath = /^([a-z]:|\\\\)/i.test(root) ? path.win32 : path.posix;
  if (platformPath.isAbsolute(relative) || relative.split(/[\\/]+/).includes("..")) throw new Error("Путь вложения находится за пределами тома 1С");
  const normalizedRoot = platformPath.resolve(root);
  const resolved = platformPath.resolve(normalizedRoot, relative);
  const prefix = normalizedRoot.endsWith(platformPath.sep) ? normalizedRoot : `${normalizedRoot}${platformPath.sep}`;
  if (!resolved.toLowerCase().startsWith(prefix.toLowerCase())) throw new Error("Путь вложения находится за пределами тома 1С");
  return resolved;
}

export async function syncOneCAttachments(prisma: PrismaClient, client: OneCClient, headers: OrderHeader[]) {
  const ownerToOrder = new Map(headers.map(row => [row.Ref_Key, row.Number]));
  if (!headers.length) return { scanned: 0, pulled: 0, unchanged: 0, skipped: 0 };
  const rows = await byRefs<Attachment>(client, ENTITY, "ВладелецФайла_Key", [...ownerToOrder.keys()],
    "Ref_Key,DataVersion,Description,ВладелецФайла_Key,Том_Key,ПутьКФайлу,Размер,Расширение,ТипХраненияФайла,DeletionMark");
  const active = rows.filter(row => !row.DeletionMark && ownerToOrder.has(row.ВладелецФайла_Key));
  const known = await prisma.orderFile.findMany({ where: { externalId: { in: active.map(row => row.Ref_Key) } }, select: { externalId: true, externalVersion: true } });
  const versions = new Map(known.map(row => [row.externalId, row.externalVersion]));
  const changed = active.filter(row => versions.get(row.Ref_Key) !== row.DataVersion);
  const eligible = changed.filter(row => {
    const size = Number(row.Размер) || 0;
    return row.ТипХраненияФайла === "ВТомахНаДиске" && Boolean(chatFileMime(attachmentFileName(row.Description, row.Расширение, row.Ref_Key))) && size > 0 && size <= MAX_FILE_BYTES;
  });
  const pending = eligible.slice(0, 250);
  const volumeIds = [...new Set(pending.map(row => row.Том_Key).filter(id => id && id !== ZERO_GUID))];
  const volumes = await byRefs<Volume>(client, VOLUMES, "Ref_Key", volumeIds, "Ref_Key,ПолныйПутьWindows,ПолныйПутьLinux");
  const volumeMap = new Map(volumes.map(row => [row.Ref_Key, process.platform === "win32" ? row.ПолныйПутьWindows : row.ПолныйПутьLinux]));
  let pulled = 0, skipped = changed.length - eligible.length, duplicates = 0;

  for (const row of pending) {
    const dealNumber = ownerToOrder.get(row.ВладелецФайла_Key)!;
    const name = attachmentFileName(row.Description, row.Расширение, row.Ref_Key);
    const mime = chatFileMime(name), declaredSize = Number(row.Размер) || 0, root = volumeMap.get(row.Том_Key);
    if (!root || !mime || declaredSize > MAX_FILE_BYTES) { skipped += 1; continue; }
    try {
      const data = await fs.readFile(resolveOneCAttachmentPath(root, row.ПутьКФайлу));
      if (!data.length || data.length > MAX_FILE_BYTES) { skipped += 1; continue; }
      const sha256 = createHash("sha256").update(data).digest("hex");
      const duplicate = await prisma.orderFile.findUnique({ where: { dealNumber_sha256: { dealNumber, sha256 } } });
      const fileData = { dealNumber, name, mime, size: data.length, sha256, data, source: "1C", externalId: row.Ref_Key, externalVersion: row.DataVersion };
      if (duplicate?.externalId && duplicate.externalId !== row.Ref_Key) { duplicates += 1; continue; }
      if (duplicate) await prisma.orderFile.update({ where: { id: duplicate.id }, data: fileData });
      else await prisma.orderFile.upsert({ where: { externalId: row.Ref_Key }, create: { ...fileData, stored: `1c-${row.Ref_Key}${chatFileExtension(name)}` }, update: fileData });
      pulled += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`Не удалось забрать вложение 1С ${row.Ref_Key}:`, error instanceof Error ? error.message : error);
    }
  }
  return { scanned: active.length, pulled, unchanged: active.length - changed.length, skipped, duplicates, queued: eligible.length - pending.length };
}

