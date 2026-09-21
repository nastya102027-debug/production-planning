import { describe, expect, it } from "vitest";
import { chatFileMime, contentDisposition, extractMentions, safeFileName } from "./chat-rules.js";

describe("вложения чата", () => {
  it("принимает фото, документы, чертежи и архивы", () => {
    expect(chatFileMime("Фото со смены.JPG")).toBe("image/jpeg");
    expect(chatFileMime("чертёж.dwg")).toBe("application/acad");
    expect(chatFileMime("накладная.pdf")).toBe("application/pdf");
  });
  it("не принимает то, что браузер может выполнить с нашего домена", () => {
    for (const name of ["page.html", "logo.svg", "run.js", "a.pdf.exe", "без расширения"]) expect(chatFileMime(name)).toBeNull();
  });
  it("очищает имя файла от путей и служебных знаков", () => {
    expect(safeFileName("..\\..\\etc/passwd")).toBe("passwd");
    expect(safeFileName("от\r\nчёт.pdf")).toBe("отчёт.pdf");
    expect(safeFileName("")).toBe("файл");
    const long = safeFileName(`${"я".repeat(300)}.pdf`);
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
  it("в браузере открывает только картинки и PDF, остальное — на скачивание", () => {
    expect(contentDisposition("фото 1.png", "image/png")).toBe("inline; filename*=UTF-8''%D1%84%D0%BE%D1%82%D0%BE%201.png");
    expect(contentDisposition("a.txt", "text/plain").startsWith("attachment;")).toBe(true);
    expect(contentDisposition("a.heic", "image/heic").startsWith("attachment;")).toBe(true);
  });
});

describe("упоминания", () => {
  it("находит @логин, в том числе русский, без повторов", () => {
    expect(extractMentions("@planer посмотри, и @Иванов тоже. @planer!")).toEqual(["planer", "Иванов"]);
  });
  it("не считает упоминанием адрес почты", () => {
    expect(extractMentions("пишите на info@latuning.ru")).toEqual([]);
  });
});
