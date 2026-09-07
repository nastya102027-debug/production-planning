"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const access_js_1 = require("./access.js");
(0, vitest_1.describe)("доступ к производственным участкам", () => {
    (0, vitest_1.it)("Планер видит любой участок", () => {
        (0, vitest_1.expect)((0, access_js_1.canAccessWorkCenter)({ role: "PLANNER", workCenterIds: [] }, "welding")).toBe(true);
    });
    (0, vitest_1.it)("сотрудник видит только назначенный участок", () => {
        const employee = { role: "EMPLOYEE", workCenterIds: ["bending"] };
        (0, vitest_1.expect)((0, access_js_1.canAccessWorkCenter)(employee, "bending")).toBe(true);
        (0, vitest_1.expect)((0, access_js_1.canAccessWorkCenter)(employee, "welding")).toBe(false);
    });
});
