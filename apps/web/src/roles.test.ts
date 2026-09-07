import { describe, expect, it } from "vitest";
import { roleLabel } from "./roles";

describe("названия ролей", () => {
  it("показывает управляющую роль как Планер", () => {
    expect(roleLabel("PLANNER")).toBe("Планер");
  });

  it("отличает сотрудника участка", () => {
    expect(roleLabel("EMPLOYEE")).toBe("Сотрудник участка");
  });
});
