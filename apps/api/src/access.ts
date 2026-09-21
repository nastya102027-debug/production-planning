export type Role = "PLANNER" | "EMPLOYEE" | "DIRECTOR";
export type AccessActor = { role: Role; workCenterIds: readonly string[] };

// Планер и директор видят всё производство; сотрудник — только свои участки.
export function seesEverything(role: Role | undefined): boolean {
  return role === "PLANNER" || role === "DIRECTOR";
}

// Директор — только просмотр: любые изменения запрещены, кроме отметки своих уведомлений прочитанными
// и переписки в чате заказов (сообщения, файлы, отметка «прочитано») — это общение, а не данные производства.
export function isReadOnlyViolation(role: Role | undefined, method: string, path: string): boolean {
  if (role !== "DIRECTOR" || ["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (method !== "POST") return true;
  return !(/^\/api\/notifications\/[^/]+\/read\/?$/.test(path) || /^\/api\/chat\/(files|threads\/[^/]+\/(read|messages))\/?$/.test(path));
}

export function canAccessWorkCenter(actor: AccessActor, workCenterId: string): boolean {
  return seesEverything(actor.role) || actor.workCenterIds.includes(workCenterId);
}
