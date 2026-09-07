"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessWorkCenter = canAccessWorkCenter;
function canAccessWorkCenter(actor, workCenterId) {
    return actor.role === "PLANNER" || actor.workCenterIds.includes(workCenterId);
}
