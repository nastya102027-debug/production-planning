export type AccessActor = { role: "PLANNER" | "EMPLOYEE"; workCenterIds: readonly string[] };

export function canAccessWorkCenter(actor: AccessActor, workCenterId: string): boolean {
  return actor.role === "PLANNER" || actor.workCenterIds.includes(workCenterId);
}
