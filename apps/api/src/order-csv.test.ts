import { describe, expect, it } from "vitest";
import { parseCsv, previewOrderCsv } from "./order-csv.js";

const header = "Производство №,Заказ клиента №,Организация,Статус,Срок,Позиция,Количество,Цена за единицу,Сумма";
describe("order CSV", () => {
  it("parses quoted commas and validates exported rows", () => {
    const csv = `${header}\n\"P-1\",\"C-1\",LATUNING,DRAFT,2026-09-10,\"Рама, латунь\",2,10.00,20.00`;
    expect(parseCsv(csv)[1][5]).toBe("Рама, латунь");
    expect(previewOrderCsv(csv)).toEqual({ rows: 1, errors: [] });
  });
  it("reports malformed rows without writing data", () => {
    expect(previewOrderCsv(`${header}\nP-1,,,,,Рама,0,-1,0`).errors.length).toBe(2);
  });
  it("rejects conflicting order metadata", () => {
    const csv = `${header}\nP-1,C-1,LATUNING,DRAFT,2026-09-10,Рама,1,10,10\nP-1,C-2,LATUNING,DRAFT,2026-09-10,Лист,1,20,20`;
    expect(previewOrderCsv(csv).errors).toContain("Строка 3: реквизиты заказа отличаются от предыдущих строк");
  });
});
