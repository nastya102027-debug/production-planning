export type UiRole = "PLANNER" | "EMPLOYEE" | "DIRECTOR";

export function roleLabel(role: UiRole): string {
  return role === "PLANNER" ? "Планер" : role === "DIRECTOR" ? "Директор" : "Сотрудник участка";
}
