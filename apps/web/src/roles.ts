export type UiRole = "PLANNER" | "EMPLOYEE";

export function roleLabel(role: UiRole): string {
  return role === "PLANNER" ? "Планер" : "Сотрудник участка";
}
