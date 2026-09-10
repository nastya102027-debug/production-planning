export const orderCsvHeaders = ["Производство №", "Заказ клиента №", "Организация", "Статус", "Срок", "Позиция", "Количество", "Цена за единицу", "Сумма"] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some(value => value.trim())) rows.push(row); }
  return rows;
}

export function previewOrderCsv(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length || rows[0].join("\u0000") !== orderCsvHeaders.join("\u0000")) return { rows: 0, errors: ["Неизвестный формат CSV. Используйте файл, выгруженный из раздела заказов."] };
  const errors: string[] = [];
  for (const [index, row] of rows.slice(1).entries()) {
    const line = index + 2;
    if (row.length !== orderCsvHeaders.length) { errors.push(`Строка ${line}: ожидалось 9 столбцов`); continue; }
    if (!row[0].trim() || !row[5].trim()) errors.push(`Строка ${line}: не заполнен номер производства или позиция`);
    const quantity = Number(row[6]), price = Number(row[7]);
    if (!Number.isInteger(quantity) || quantity <= 0) errors.push(`Строка ${line}: количество должно быть положительным целым`);
    if (!Number.isFinite(price) || price < 0) errors.push(`Строка ${line}: цена должна быть неотрицательным числом`);
    if (row[4] && !/^\d{4}-\d{2}-\d{2}$/.test(row[4])) errors.push(`Строка ${line}: неверный срок`);
  }
  return { rows: Math.max(0, rows.length - 1), errors: errors.slice(0, 50) };
}
