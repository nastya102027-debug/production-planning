import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

describe("light order theme", () => {
  it("keeps an order card light on hover", () => {
    expect(css).toMatch(/:root\[data-theme="light"\] \.orders-page \.order-row:not\(\.heading\):hover\{[^}]*background:#f8faf9!important/);
  });
});

