export class ProductionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function validateSteps(steps: { predecessorIndexes: number[] }[]) {
  if (!steps.length) throw new ProductionError(400, "Добавьте хотя бы один этап");
  steps.forEach((step, index) => {
    if (new Set(step.predecessorIndexes).size !== step.predecessorIndexes.length || step.predecessorIndexes.some(value => value < 0 || value >= index)) {
      throw new ProductionError(400, "Зависимости должны указывать на разные предыдущие этапы");
    }
  });
}

export function nextStatus(status: string, action: string, blocked: boolean, reason?: string) {
  if (action === "pause" && !reason?.trim()) throw new ProductionError(400, "Укажите причину остановки");
  const transitions: Record<string, Record<string, string>> = {
    QUEUED: { start: "IN_PROGRESS" }, IN_PROGRESS: { pause: "PAUSED", complete: "COMPLETED" }, PAUSED: { resume: "IN_PROGRESS" }
  };
  const next = transitions[status]?.[action];
  if (!next) throw new ProductionError(409, "Статус задачи уже изменился. Обновите карточку");
  if (blocked && (action === "start" || action === "resume")) throw new ProductionError(409, "Сначала завершите предыдущие этапы маршрута");
  return next;
}

export function elapsedSeconds(intervals: { startedAt: Date; finishedAt: Date | null }[], now: Date) {
  return Math.floor(intervals.reduce((sum, entry) => sum + Math.max(0, (entry.finishedAt ?? now).getTime() - entry.startedAt.getTime()), 0) / 1000);
}

export function downtimeSeconds(history: { toStatus: string; changedAt: Date }[], now: Date) {
  let pausedAt: Date | null = null, milliseconds = 0;
  for (const event of history) {
    if (event.toStatus === "PAUSED" && !pausedAt) pausedAt = event.changedAt;
    else if (event.toStatus !== "PAUSED" && pausedAt) { milliseconds += Math.max(0, event.changedAt.getTime() - pausedAt.getTime()); pausedAt = null; }
  }
  if (pausedAt) milliseconds += Math.max(0, now.getTime() - pausedAt.getTime());
  return Math.floor(milliseconds / 1000);
}
