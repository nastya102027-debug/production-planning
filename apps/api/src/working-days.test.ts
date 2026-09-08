import { describe, expect, it } from "vitest";
import { addWorkingDays, isDateOnly, parseDateOnly } from "./working-days.js";

describe("расчет срока производства", () => {
  it("считает только дни с понедельника по пятницу", () => {
    const friday = parseDateOnly("2026-09-04");
    expect(addWorkingDays(friday, 1).toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(addWorkingDays(friday, 5).toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("не засчитывает выходные в длинном сроке", () => {
    const thursday = parseDateOnly("2026-09-03");
    expect(addWorkingDays(thursday, 10).toISOString().slice(0, 10)).toBe("2026-09-17");
  });

  it("отклоняет несуществующую календарную дату", () => {
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-09-07")).toBe(true);
  });
});
