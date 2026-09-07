"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const order_values_js_1 = require("./order-values.js");
(0, vitest_1.describe)("стоимость заказа", () => {
    (0, vitest_1.it)("считает стоимость позиции как количество × цену", () => {
        (0, vitest_1.expect)((0, order_values_js_1.itemTotal)({ quantity: 10, unitPrice: 15_000 })).toBe(150_000);
    });
    (0, vitest_1.it)("суммирует позиции заказа", () => {
        (0, vitest_1.expect)((0, order_values_js_1.orderTotal)([{ quantity: 10, unitPrice: 15_000 }, { quantity: 3, unitPrice: 40_000 }])).toBe(270_000);
    });
    (0, vitest_1.it)("учитывает только фактически готовое количество", () => {
        (0, vitest_1.expect)((0, order_values_js_1.completedValue)([{ quantity: 10, completedQuantity: 7, unitPrice: 15_000 }])).toBe(105_000);
    });
});
