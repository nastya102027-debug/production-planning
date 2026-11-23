import { describe, expect, it } from "vitest";
import { isOrderFileKey, orderFileKeys } from "./order-file-rules.js";

describe("1C order file keys", () => {
  it("accepts production and customer order numbers without path characters", () => {
    expect(isOrderFileKey("00ФР-32728")).toBe(true);
    expect(isOrderFileKey("ЛТФР-001174")).toBe(true);
    expect(isOrderFileKey("../../file")).toBe(false);
  });

  it("links files by full 1C number and by legacy numeric deal number", () => {
    expect(orderFileKeys("00ФР-32728", "ЛТФР-001174")).toEqual(["00ФР-32728", "ЛТФР-001174", "32728", "001174"]);
  });
});
