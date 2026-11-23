import type { OrderStatus, Organization } from "@prisma/client";

export type VersionedOneCOrder = { Ref_Key: string; DataVersion: string };

type OneCCustomerOrderNumber = {
  Number?: unknown;
  НомерПоДаннымКлиента?: unknown;
  НомерЗаказаКлиента?: unknown;
  НомерЗаказаПокупателя?: unknown;
};

export function customerOrderNumberFromOneC(order: OneCCustomerOrderNumber): string | null {
  const values = [order.НомерПоДаннымКлиента, order.НомерЗаказаКлиента, order.НомерЗаказаПокупателя, order.Number];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function mapOneCOrganization(value: string): Organization {
  const normalized = value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  if (normalized.includes("эконитрид")) return "ECONTRID";
  if (normalized.includes("ветров")) return "IP_VETROV";
  return "LATUNING";
}

export function mapOneCStatus(value: string): OrderStatus {
  const normalized = value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  if (normalized.includes("заверш")) return "COMPLETED";
  if (normalized.includes("закуп") || normalized.includes("обеспеч")) return "PROCUREMENT";
  if (normalized.includes("гп частично")) return "PARTIALLY_READY";
  if (normalized === "гп" || normalized.includes("готов")) return "READY_FOR_LAUNCH";
  return "IN_PRODUCTION";
}

export function selectChangedOrders<T extends VersionedOneCOrder>(rows: T[], knownVersions: Map<string, string | null>): T[] {
  const unique = new Map(rows.map(row => [row.Ref_Key, row]));
  return [...unique.values()].filter(row => knownVersions.get(row.Ref_Key) !== row.DataVersion);
}

export function businessDays(startValue: string, finishValue: string): number {
  const start = new Date(startValue.slice(0, 10) + "T00:00:00Z");
  const finish = new Date(finishValue.slice(0, 10) + "T00:00:00Z");
  let count = 0;
  for (const day = new Date(start); day < finish; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return Math.max(1, count);
}
