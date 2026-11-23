import { describe, expect, it } from "vitest";
import { businessDays, customerOrderNumberFromOneC, mapOneCOrganization, mapOneCStatus, selectChangedOrders } from "./one-c-mapping.js";

describe("1C sync mapping", () => {
  it("maps organizations without relying on exact punctuation", () => {
    expect(mapOneCOrganization("ЛАТУНИНГ ООО")).toBe("LATUNING");
    expect(mapOneCOrganization("ИП Ветров")).toBe("IP_VETROV");
    expect(mapOneCOrganization("Эконитрид")).toBe("ECONTRID");
  });

  it("maps production states and never imports completed as active", () => {
    expect(mapOneCStatus("Производство")).toBe("IN_PRODUCTION");
    expect(mapOneCStatus("В закупке")).toBe("PROCUREMENT");
    expect(mapOneCStatus("Завершен")).toBe("COMPLETED");
  });

  it("selects only new or version-changed documents and removes repeated refs", () => {
    const rows = [
      { Ref_Key: "a", DataVersion: "1" },
      { Ref_Key: "a", DataVersion: "1" },
      { Ref_Key: "b", DataVersion: "2" },
      { Ref_Key: "c", DataVersion: "3" }
    ];
    expect(selectChangedOrders(rows, new Map([["a", "1"], ["b", "1"]])).map(row => row.Ref_Key)).toEqual(["b", "c"]);
  });

  it("uses working days for the local production lead", () => {
    expect(businessDays("2026-11-23T12:00:00", "2026-12-01T23:59:59")).toBe(6);
  });

  it("uses the buyer-provided order number instead of the internal 1C number", () => {
    expect(customerOrderNumberFromOneC({ Number: "ЛТФР-001214", НомерПоДаннымКлиента: "121147" })).toBe("121147");
    expect(customerOrderNumberFromOneC({ Number: "ЛТФР-001214", НомерПоДаннымКлиента: "  " })).toBe("ЛТФР-001214");
  });
});
