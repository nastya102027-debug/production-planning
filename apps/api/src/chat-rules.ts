import path from "node:path";

export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_TEXT = 2000;
export const MAX_CHAT_FILES_PER_MESSAGE = 10;

// Что разрешаем прикреплять. Всё остальное отсекаем по расширению: так в папку
// не попадут .html/.svg/.js, которые браузер мог бы выполнить с нашего домена.
const CHAT_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".pdf": "application/pdf", ".txt": "text/plain",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv", ".dwg": "application/acad", ".dxf": "application/dxf",
  ".zip": "application/zip", ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".mp4": "video/mp4", ".mov": "video/quicktime"
};
// Показываем прямо в браузере только то, что он точно не выполнит как страницу.
const INLINE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

// Имя для показа человеку: без путей, переводов строк и хвостов в километр.
export function safeFileName(raw: unknown): string {
  const base = String(raw ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const name = base.replace(/[\r\n\t\0]/g, "").trim() || "файл";
  if (name.length <= 120) return name;
  const extension = path.extname(name).slice(0, 10);
  return name.slice(0, 120 - extension.length) + extension;
}

export function chatFileExtension(name: string): string { return path.extname(name).toLowerCase(); }
export function chatFileMime(name: string): string | null { return CHAT_EXTENSIONS[chatFileExtension(name)] ?? null; }
export function isInlineMime(mime: string): boolean { return INLINE_MIME.has(mime); }

export function contentDisposition(name: string, mime: string): string {
  return `${isInlineMime(mime) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// @логин в тексте → список логинов без повторов
export function extractMentions(text: string): string[] {
  return [...new Set([...text.matchAll(/(?:^|[^\p{L}\p{N}_.@-])@([\p{L}\p{N}_.-]+)/gu)].map(match => match[1].replace(/[.-]+$/, "")).filter(Boolean))];
}
