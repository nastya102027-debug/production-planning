"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const working_days_js_1 = require("./working-days.js");
(0, vitest_1.describe)("расчет срока производства", () => {
    (0, vitest_1.it)("считает только дни с понедельника по пятницу", () => {
        const friday = (0, working_days_js_1.parseDateOnly)("2026-09-04");
        (0, vitest_1.expect)((0, working_days_js_1.addWorkingDays)(friday, 1).toISOString().slice(0, 10)).toBe("2026-09-07");
        (0, vitest_1.expect)((0, working_days_js_1.addWorkingDays)(friday, 5).toISOString().slice(0, 10)).toBe("2026-09-11");
    });
    (0, vitest_1.it)("не засчитывает выходные в длинном сроке", () => {
        const thursday = (0, working_days_js_1.parseDateOnly)("2026-09-03");
        (0, vitest_1.expect)((0, working_days_js_1.addWorkingDays)(thursday, 10).toISOString().slice(0, 10)).toBe("2026-09-17");
    });
    (0, vitest_1.it)("отклоняет несуществующую календарную дату", () => {
        (0, vitest_1.expect)((0, working_days_js_1.isDateOnly)("2026-02-30")).toBe(false);
        (0, vitest_1.expect)((0, working_days_js_1.isDateOnly)("2026-09-07")).toBe(true);
    });
});
