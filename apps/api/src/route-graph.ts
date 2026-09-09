import { z } from "zod";
import { ProductionError } from "./production-rules.js";
const text = z.string().trim().max(500);
export const routeDetails = {
  material: text.nullable().optional(), quantity: z.number().finite().positive().max(1e9).nullable().optional(), unit: z.string().trim().max(40).nullable().optional(), comment: z.string().trim().max(2000).nullable().optional(),
  canvasX: z.number().finite().min(-1e6).max(1e6).nullable().optional(), canvasY: z.number().finite().min(-1e6).max(1e6).nullable().optional(),
  components: z.array(z.object({ name: text.min(1), material: text, quantity: z.number().finite().positive().max(1e9), unit: z.string().trim().min(1).max(40) }).strict()).max(100).default([])
};
const node = z.object({ id: z.string().min(1).max(100), workCenterId: z.string().uuid(), title: text, ...routeDetails }).strict();
const graph = z.object({ name: z.string().trim().min(1).max(200), nodes: z.array(node).min(1).max(100), edges: z.array(z.object({ source: z.string(), target: z.string() }).strict()).max(500) }).strict();
export function parseGraph(body: unknown) {
  const input = graph.parse(body), byId = new Map(input.nodes.map(n => [n.id, n]));
  if (byId.size !== input.nodes.length) throw new ProductionError(400, "Идентификаторы блоков должны быть уникальны");
  const incoming = new Map(input.nodes.map(n => [n.id, [] as string[]]));
  for (const edge of input.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target || incoming.get(edge.target)!.includes(edge.source)) throw new ProductionError(400, "Некорректная или повторная связь");
    incoming.get(edge.target)!.push(edge.source);
  }
  const ordered: typeof input.nodes = [], visited = new Set<string>();
  while (ordered.length < input.nodes.length) {
    const next = input.nodes.find(n => !visited.has(n.id) && incoming.get(n.id)!.every(id => visited.has(id)));
    if (!next) throw new ProductionError(400, "Маршрут содержит цикл. Удалите обратную связь");
    ordered.push(next); visited.add(next.id);
  }
  return { name: input.name, steps: ordered.map(({id,...data}) => ({...data,predecessorIndexes:incoming.get(id)!.map(source=>ordered.findIndex(n=>n.id===source))})) };
}
