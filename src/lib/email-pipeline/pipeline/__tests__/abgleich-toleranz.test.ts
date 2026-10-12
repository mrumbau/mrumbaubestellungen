/**
 * tryAbgleich mit Toleranz (11.10.2026, lib/toleranz.ts).
 *
 * Die KI meldet 1.000,00 gegen 1.004,50 als Abweichung. Mit der Toleranz
 * aus den Firmen-Einstellungen wird daraus "ok", und der System-Kommentar
 * "Abweichungen erkannt" bleibt aus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAbgleich = vi.fn();
vi.mock("@/lib/openai", () => ({
  fuehreAbgleichDurch: (...args: unknown[]) => mockAbgleich(...args),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

function makeSupabase(einstellungen: Array<{ schluessel: string; wert: string }>) {
  const abgleiche: Array<Record<string, unknown>> = [];
  const kommentare: Array<Record<string, unknown>> = [];
  const dokumente = [
    { typ: "lieferschein", ki_roh_daten: { typ: "lieferschein", gesamtbetrag: 1000 } },
    { typ: "rechnung", ki_roh_daten: { typ: "rechnung", gesamtbetrag: 1004.5 } },
  ];
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { hat_lieferschein: true, hat_rechnung: true, status: "offen" } }) }) }) };
    }
    if (table === "abgleiche") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async (row: Record<string, unknown>) => {
          abgleiche.push(row);
          return { data: null, error: null };
        },
      };
    }
    if (table === "dokumente") {
      return { select: () => ({ eq: () => ({ in: async () => ({ data: dokumente }) }) }) };
    }
    if (table === "firma_einstellungen") {
      return { select: () => ({ in: async () => ({ data: einstellungen }) }) };
    }
    if (table === "kommentare") {
      return {
        insert: async (row: Record<string, unknown>) => {
          kommentare.push(row);
          return { data: null, error: null };
        },
      };
    }
    throw new Error(`unerwartete Tabelle ${table}`);
  });
  return { from, abgleiche, kommentare };
}

const kiErgebnis = {
  status: "abweichung" as const,
  abweichungen: [
    { feld: "gesamtbetrag", artikel: null, erwartet: "1.000,00", gefunden: "1.004,50", dokument: "Rechnung", schwere: "niedrig" as const },
  ],
  zusammenfassung: "LS und RG verglichen.",
};

describe("tryAbgleich mit Toleranz", () => {
  beforeEach(() => mockAbgleich.mockReset());

  it("Standard-Toleranz: 4,50 € Unterschied ist ok, kein Abweichungs-Kommentar", async () => {
    mockAbgleich.mockResolvedValue(kiErgebnis);
    const sb = makeSupabase([]);
    const { tryAbgleich } = await import("../abgleich");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await tryAbgleich(sb as any, "b1");
    expect(r).toEqual({ ranAbgleich: true, status: "ok" });
    expect(sb.abgleiche).toHaveLength(1);
    expect(sb.abgleiche[0].status).toBe("ok");
    expect(sb.abgleiche[0].abweichungen).toEqual([]);
    expect(String(sb.abgleiche[0].ki_zusammenfassung)).toContain("Innerhalb der Toleranz (2 % oder 5,00 €)");
    expect(sb.kommentare).toHaveLength(0);
    // Die Toleranz geht auch in den Prompt.
    expect(mockAbgleich).toHaveBeenCalledWith(undefined, expect.anything(), expect.anything(), { prozent: 2, betrag: 5 });
  });

  it("Toleranz 0: dieselbe Differenz bleibt eine Abweichung", async () => {
    mockAbgleich.mockResolvedValue(kiErgebnis);
    const sb = makeSupabase([
      { schluessel: "toleranz_prozent", wert: "0" },
      { schluessel: "toleranz_betrag", wert: "0" },
    ]);
    const { tryAbgleich } = await import("../abgleich");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await tryAbgleich(sb as any, "b1");
    expect(r).toEqual({ ranAbgleich: true, status: "abweichung" });
    expect(sb.abgleiche[0].status).toBe("abweichung");
    expect(sb.kommentare).toHaveLength(1);
    expect(String(sb.kommentare[0].text)).toContain("Abweichungen erkannt");
  });
});
