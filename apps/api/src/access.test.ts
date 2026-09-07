import { describe, expect, it } from "vitest";
import { canAccessWorkCenter } from "./access.js";

describe("доступ к производственным участкам", () => {
  it("Планер видит любой участок", () => {
    expect(canAccessWorkCenter({ role: "PLANNER", workCenterIds: [] }, "welding")).toBe(true);
  });

  it("сотрудник видит только назначенный участок", () => {
    const employee = { role: "EMPLOYEE" as const, workCenterIds: ["bending"] };
    expect(canAccessWorkCenter(employee, "bending")).toBe(true);
    expect(canAccessWorkCenter(employee, "welding")).toBe(false);
  });
});
