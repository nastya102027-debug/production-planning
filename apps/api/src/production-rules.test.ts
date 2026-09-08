import { describe, it, expect } from "vitest";
import { nextStatus, validateSteps, elapsedSeconds, downtimeSeconds } from "./production-rules";
describe("production workflow", () => {
  it("blocks dependent stages and empty pause reasons", () => {
    expect(() => nextStatus("QUEUED", "start", true)).toThrow("предыдущие");
    expect(() => nextStatus("IN_PROGRESS", "pause", false, "  ")).toThrow("причину");
    expect(nextStatus("QUEUED", "start", false)).toBe("IN_PROGRESS");
    expect(nextStatus("IN_PROGRESS", "pause", false, "Нет материала")).toBe("PAUSED");
    expect(nextStatus("PAUSED", "resume", false)).toBe("IN_PROGRESS");
    expect(nextStatus("IN_PROGRESS", "complete", false)).toBe("COMPLETED");
    expect(() => nextStatus("COMPLETED", "start", false)).toThrow();
  });
  it("accepts a fork and join but rejects duplicate, future and self dependencies", () => {
    expect(() => validateSteps([{ predecessorIndexes: [] }, { predecessorIndexes: [0] }, { predecessorIndexes: [0] }, { predecessorIndexes: [1, 2] }])).not.toThrow();
    for (const indexes of [[0], [1], [0, 0]]) expect(() => validateSteps([{ predecessorIndexes: indexes }])).toThrow();
  });
  it("counts work and repeated pauses without counting paused comments twice", () => {
    const at = (seconds: number) => new Date(seconds * 1000);
    expect(elapsedSeconds([{ startedAt: at(0), finishedAt: at(10) }, { startedAt: at(30), finishedAt: null }], at(40))).toBe(20);
    expect(downtimeSeconds([{ toStatus: "IN_PROGRESS", changedAt: at(0) }, { toStatus: "PAUSED", changedAt: at(10) }, { toStatus: "PAUSED", changedAt: at(15) }, { toStatus: "IN_PROGRESS", changedAt: at(30) }, { toStatus: "PAUSED", changedAt: at(35) }], at(40))).toBe(25);
  });
});
