"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateOnly = parseDateOnly;
exports.isDateOnly = isDateOnly;
exports.addWorkingDays = addWorkingDays;
function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        throw new Error("Некорректная дата");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error("Некорректная дата");
    }
    return date;
}
function isDateOnly(value) {
    try {
        parseDateOnly(value);
        return true;
    }
    catch {
        return false;
    }
}
function addWorkingDays(start, workingDays) {
    if (!Number.isInteger(workingDays) || workingDays < 0)
        throw new Error("Некорректный срок производства");
    const result = new Date(start);
    let remaining = workingDays;
    while (remaining > 0) {
        result.setUTCDate(result.getUTCDate() + 1);
        const weekday = result.getUTCDay();
        if (weekday !== 0 && weekday !== 6)
            remaining -= 1;
    }
    return result;
}
