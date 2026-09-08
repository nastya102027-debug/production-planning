import { it, expect } from "vitest";
import { reorderSteps, removeRouteStep, type DraftStep } from "./route-draft";
const step = (key: string, predecessors: string[] = []): DraftStep => ({ key, title: key, workCenterId: "same-center", predecessorKeys: predecessors });
it("reordering a chain preserves sequential execution including repeated centers", () => {
  const result = reorderSteps([step("a"), step("b", ["a"]), step("c", ["b"])], 0, 2);
  expect(result.map(value => [value.key, value.predecessorKeys])).toEqual([["b", []], ["c", ["b"]], ["a", ["c"]]]);
});
it("preserves parallel links and refuses reorder that would discard a dependency", () => {
  const graph = [step("a"), step("b"), step("c", ["a", "b"])];
  expect(reorderSteps(graph, 0, 1)[2].predecessorKeys).toEqual(["a", "b"]);
  expect(() => reorderSteps(graph, 2, 0)).toThrow();
});
it("removing a middle stage reconnects downstream stages", () => {
  expect(removeRouteStep([step("a"), step("b", ["a"]), step("c", ["b"])], "b")[1].predecessorKeys).toEqual(["a"]);
});
