import { describe, expect, it } from "vitest";
import { CALCULATOR_FILES, dealNumbers, isCalculatorFileKind, isDealNumber, sameSecret } from "./order-file-rules.js";

describe("файлы заказа", () => {
  it("находит номер сделки в любом из номеров заказа", () => {
    expect(dealNumbers("118047", null)).toEqual(["118047"]);
    expect(dealNumbers("ПР-15", "№ 118047-2")).toEqual(["118047"]);
    expect(dealNumbers("118047", "118047")).toEqual(["118047"]);
    expect(dealNumbers("117235", "заказ 118047")).toEqual(["117235", "118047"]);
  });
  it("не принимает за номер сделки короткие и слишком длинные числа", () => {
    expect(dealNumbers("ПР-15", "12345678901")).toEqual([]);
    expect(dealNumbers(undefined, "")).toEqual([]);
  });
  it("номер сделки от 1С — только цифры", () => {
    expect(isDealNumber("118047")).toBe(true);
    for (const bad of ["", "12", "118047/../x", "11 8047", "１１８０４７", 118047]) expect(isDealNumber(bad)).toBe(false);
  });
  it("имена файлов калькулятора собираются только по белому списку", () => {
    expect(CALCULATOR_FILES.drawings.pattern("118047")).toBe("Чертежи_118047_Latuning.pdf");
    expect(CALCULATOR_FILES.tz.pattern("118047")).toBe("ТЗ-производство_118047_Latuning.pdf");
    expect(isCalculatorFileKind("drawings")).toBe(true);
    expect(isCalculatorFileKind("constructor")).toBe(false);
    expect(isCalculatorFileKind("../etc")).toBe(false);
  });
  it("ключ приёмника сравнивается целиком", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("", "abc")).toBe(false);
    expect(sameSecret("abcd", "abc")).toBe(false);
  });
});
