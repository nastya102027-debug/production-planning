export type DraftStep = { key: string; workCenterId: string; title: string; predecessorKeys: string[] };

export function reorderSteps(steps: DraftStep[], from: number, to: number): DraftStep[] {
  if (from < 0 || to < 0 || from >= steps.length || to >= steps.length || from === to) return steps;
  const sequential = steps.every((step, index) => index === 0 ? step.predecessorKeys.length === 0 : step.predecessorKeys.length === 1 && step.predecessorKeys[0] === steps[index - 1].key);
  const result = [...steps]; const [moved] = result.splice(from, 1); result.splice(to, 0, moved);
  if (sequential) return result.map((step, index) => ({ ...step, predecessorKeys: index ? [result[index - 1].key] : [] }));
  const positions = new Map(result.map((step, index) => [step.key, index]));
  if (result.some((step, index) => step.predecessorKeys.some(key => (positions.get(key) ?? Infinity) >= index))) throw new Error("Этот порядок противоречит зависимостям. Сначала измените связи этапов");
  return result;
}

export function removeRouteStep(steps: DraftStep[], key: string): DraftStep[] {
  const removed = steps.find(step => step.key === key);
  return steps.filter(step => step.key !== key).map(step => ({ ...step, predecessorKeys: [...new Set(step.predecessorKeys.flatMap(predecessor => predecessor === key ? removed?.predecessorKeys ?? [] : [predecessor]))] }));
}
