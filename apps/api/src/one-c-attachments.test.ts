import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachmentFileName, resolveOneCAttachmentPath } from "./one-c-attachments.js";

describe("1C production order attachments", () => {
  it("builds a safe file name from the attachment description", () => {
    expect(attachmentFileName("Чертёж корпуса", "pdf", "file-id")).toBe("Чертёж корпуса.pdf");
    expect(attachmentFileName("../../эскиз.dwg", "dwg", "file-id")).toBe("эскиз.dwg");
    expect(attachmentFileName("", "xlsx", "file-id")).toBe("file-id.xlsx");
  });

  it("resolves a relative 1C path inside the configured volume", () => {
    const root = path.win32.normalize("\\\\fsrv\\1c\\");
    expect(resolveOneCAttachmentPath(root, "ЗаказНаПроизводство\\20250523\\drawing.pdf"))
      .toBe(path.win32.join(root, "ЗаказНаПроизводство\\20250523\\drawing.pdf"));
  });

  it("rejects attachment paths escaping the 1C volume", () => {
    expect(() => resolveOneCAttachmentPath("\\\\fsrv\\1c\\", "..\\secret.pdf"))
      .toThrow("за пределами тома");
    expect(() => resolveOneCAttachmentPath("\\\\fsrv\\1c\\", "C:\\secret.pdf"))
      .toThrow("за пределами тома");
  });
});

