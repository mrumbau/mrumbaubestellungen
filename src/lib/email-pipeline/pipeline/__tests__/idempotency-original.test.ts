import { describe, it, expect } from "vitest";
import { waehleOriginal } from "../idempotency-check";

const rows = [
  { subject: "AW: Rechnung 4711", bestellung_id: "b-1" },
  { subject: "Lieferschein 99", bestellung_id: "b-2" },
  { subject: "Rechnung 4711", bestellung_id: null },
];

describe("waehleOriginal", () => {
  it("findet die verbuchte Erstzustellung trotz AW:/WG:-Praefix und Gross/Klein", () => {
    expect(waehleOriginal(rows, "rechnung 4711")).toBe("b-1");
  });

  it("ignoriert Zeilen ohne Bestellung und andere Betreffs", () => {
    expect(waehleOriginal([rows[2]], "rechnung 4711")).toBeUndefined();
    expect(waehleOriginal(rows, "rechnung 4712")).toBeUndefined();
  });

  it("leere Liste → nichts", () => {
    expect(waehleOriginal([], "rechnung 4711")).toBeUndefined();
  });
});
