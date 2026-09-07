"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemTotal = itemTotal;
exports.orderTotal = orderTotal;
exports.completedValue = completedValue;
function itemTotal(item) {
    return item.quantity * item.unitPrice;
}
function orderTotal(items) {
    return items.reduce((sum, item) => sum + itemTotal(item), 0);
}
function completedValue(items) {
    return items.reduce((sum, item) => sum + Math.min(item.quantity, item.completedQuantity ?? 0) * item.unitPrice, 0);
}
