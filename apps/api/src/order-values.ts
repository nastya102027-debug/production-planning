export type PricedItem = { quantity: number; unitPrice: number; completedQuantity?: number };

export function itemTotal(item: PricedItem): number {
  return item.quantity * item.unitPrice;
}

export function orderTotal(items: readonly PricedItem[]): number {
  return items.reduce((sum, item) => sum + itemTotal(item), 0);
}

export function completedValue(items: readonly PricedItem[]): number {
  return items.reduce((sum, item) => sum + Math.min(item.quantity, item.completedQuantity ?? 0) * item.unitPrice, 0);
}
