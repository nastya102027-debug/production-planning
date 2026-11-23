import { timingSafeEqual } from "node:crypto";

// PDF, которые калькулятор кладёт в общую папку под номером сделки. Читаем только по этому белому списку имён.
export const CALCULATOR_FILES = {
  drawings: { pattern: (deal: string) => `Чертежи_${deal}_Latuning.pdf`, title: "Чертежи" },
  tz: { pattern: (deal: string) => `ТЗ-производство_${deal}_Latuning.pdf`, title: "ТЗ на производство" }
} as const;
export type CalculatorFileKind = keyof typeof CALCULATOR_FILES;
export const isCalculatorFileKind = (kind: string): kind is CalculatorFileKind => Object.hasOwn(CALCULATOR_FILES, kind);

const DEAL_NUMBER = /^\d{4,10}$/;
export const isDealNumber = (value: unknown): value is string => typeof value === "string" && DEAL_NUMBER.test(value);

const ORDER_FILE_KEY = /^[0-9A-Za-zА-Яа-яЁё_-]{4,80}$/u;
export const isOrderFileKey = (value: unknown): value is string => typeof value === "string" && ORDER_FILE_KEY.test(value);

// Номер сделки могут вписать в любой из двух номеров заказа, в том числе с хвостом («118047-2», «№ 118047»).
// Берём отдельно стоящие группы из 4–10 цифр, без повторов.
export function dealNumbers(...fields: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const field of fields) for (const match of (field ?? "").matchAll(/(?<!\d)\d{4,10}(?!\d)/g)) found.add(match[0]);
  return [...found];
}

export function orderFileKeys(...fields: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const field of fields) {
    const value = field?.trim();
    if (isOrderFileKey(value)) keys.add(value);
  }
  for (const value of dealNumbers(...fields)) keys.add(value);
  return [...keys];
}

export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
