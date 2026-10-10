/**
 * Ein schon vorhandener Beleg zaehlt wie gespeichert (10.10.2026).
 *
 * Befund: "zuordnen" im Eingang fuer zwei laengst verbuchte Raab-Karcher-
 * Mails hat je einen zweiten Beleg ohne PDF aus dem Mailtext angelegt
 * (Rechnung ohne Nummer und Betrag), weil der Anhang als Duplikat
 * uebersprungen wurde und die Pipeline dann "kein Dokument gespeichert"
 * annahm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
const mockApply = vi.fn();
vi.mock("../bestellung-propagate", () => ({
  applyAnalyseToBestellung: (...args: unknown[]) => mockApply(...args),
}));

import { persistAnhangDokumente } from "../dokument-persist";
import type { AnalyseErgebnis } from "../anhang-analyse";

function makeSupabase(vorhanden: boolean) {
  const upload = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ data: "neu-dok", error: null }));
  const from = vi.fn((table: string) => {
    if (table === "dokumente") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: async () => ({ data: vorhanden ? [{ id: "alt-dok", storage_pfad: "x/y.pdf" }] : [] }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return builder;
    }
    return { insert: async () => ({ error: null }) };
  });
  return { client: { from, rpc, storage: { from: () => ({ upload }) } }, upload, rpc };
}

function rechnung(): AnalyseErgebnis {
  return {
    dateiName: "rechnung.pdf",
    mime_type: "application/pdf",
    // safeBase64ToBuffer verlangt mindestens 64 Zeichen und 50 Bytes.
    base64: Buffer.from("%PDF-1.4 " + "Testinhalt ".repeat(20)).toString("base64"),
    analyse: { typ: "rechnung", bestellnummer: "8779633385", gesamtbetrag: 181.09, konfidenz: 0.9 } as AnalyseErgebnis["analyse"],
  } as AnalyseErgebnis;
}

const input = {
  bestellungId: "b-1",
  email_betreff: "Rechnung 8779633385",
  email_absender: "edi@stark-deutschland.de",
  email_datum: "2026-10-08T10:00:00Z",
  bodyExtractedBetrag: null,
};

describe("persistAnhangDokumente — vorhandener Beleg", () => {
  beforeEach(() => mockApply.mockReset());

  it("zaehlt den schon vorhandenen Beleg wie gespeichert, ohne Upload und Insert", async () => {
    const { client, upload, rpc } = makeSupabase(true);
    const r = await persistAnhangDokumente(client as never, { ...input, analyseErgebnisse: [rechnung()] });
    expect(r.dokumenteGespeichert).toBe(1);
    expect(r.bereitsVorhanden).toBe(1);
    expect(r.gespeicherteTypen).toEqual(["rechnung"]);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("speichert einen neuen Beleg wie bisher", async () => {
    const { client, upload, rpc } = makeSupabase(false);
    const r = await persistAnhangDokumente(client as never, { ...input, analyseErgebnisse: [rechnung()] });
    expect(r.dokumenteGespeichert).toBe(1);
    expect(r.bereitsVorhanden).toBe(0);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
  });
});
