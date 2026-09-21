import { describe, expect, it } from "vitest";
import { canAccessWorkCenter, isReadOnlyViolation, seesEverything } from "./access.js";

describe("доступ к производственным участкам", () => {
  it("Планер видит любой участок", () => {
    expect(canAccessWorkCenter({ role: "PLANNER", workCenterIds: [] }, "welding")).toBe(true);
  });

  it("сотрудник видит только назначенный участок", () => {
    const employee = { role: "EMPLOYEE" as const, workCenterIds: ["bending"] };
    expect(canAccessWorkCenter(employee, "bending")).toBe(true);
    expect(canAccessWorkCenter(employee, "welding")).toBe(false);
  });

  it("директор видит любой участок, как Планер", () => {
    expect(canAccessWorkCenter({ role: "DIRECTOR", workCenterIds: [] }, "welding")).toBe(true);
    expect(seesEverything("DIRECTOR")).toBe(true);
    expect(seesEverything("EMPLOYEE")).toBe(false);
  });
});

describe("директор — только просмотр", () => {
  it("читать можно всё", () => {
    expect(isReadOnlyViolation("DIRECTOR", "GET", "/api/orders")).toBe(false);
  });

  it("любое изменение запрещено", () => {
    for (const [method, path] of [["POST", "/api/orders"], ["PUT", "/api/orders/1"], ["PATCH", "/api/operations/1/plan"], ["DELETE", "/api/route-templates/1"], ["POST", "/api/operations/1/actions"], ["POST", "/api/staff"]] as const)
      expect(isReadOnlyViolation("DIRECTOR", method, path)).toBe(true);
  });

  it("исключение одно — отметить своё уведомление прочитанным", () => {
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/notifications/abc/read")).toBe(false);
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/notifications/abc/read/../../orders")).toBe(true);
  });
  it("директору можно переписываться в чате заказов, но не больше", () => {
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/chat/threads/abc/messages")).toBe(false);
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/chat/threads/abc/read")).toBe(false);
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/chat/files")).toBe(false);
    expect(isReadOnlyViolation("DIRECTOR", "DELETE", "/api/chat/files")).toBe(true);
    expect(isReadOnlyViolation("DIRECTOR", "POST", "/api/chat/threads/abc/messages/../../../orders")).toBe(true);
  });

  it("Планера и сотрудника правило не касается", () => {
    expect(isReadOnlyViolation("PLANNER", "POST", "/api/orders")).toBe(false);
    expect(isReadOnlyViolation("EMPLOYEE", "POST", "/api/operations/1/actions")).toBe(false);
  });
});
