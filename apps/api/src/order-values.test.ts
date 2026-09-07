import { describe, expect, it } from "vitest";
import { completedValue, itemTotal, orderTotal } from "./order-values.js";

describe("стоимость заказа", () => {
  it("считает стоимость позиции как количество × цену", () => {
    expect(itemTotal({ quantity: 10, unitPrice: 15_000 })).toBe(150_000);
  });

  it("суммирует позиции заказа", () => {
    expect(orderTotal([{ quantity: 10, unitPrice: 15_000 }, { quantity: 3, unitPrice: 40_000 }])).toBe(270_000);
  });

  it("учитывает только фактически готовое количество", () => {
    expect(completedValue([{ quantity: 10, completedQuantity: 7, unitPrice: 15_000 }])).toBe(105_000);
  });
});
