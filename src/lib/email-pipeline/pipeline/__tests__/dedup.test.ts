/**
 * Tests für shouldSkipAsStubDuplicate.
 *
 * Bug-Kontext (18.05.2026): Zwei Mechaniken erzeugten Stub-Duplikate in der
 * Buchhaltung — Race-Condition (zweiter Worker für dieselbe Mail) und
 * Reminder-Mails (zweite Mail mit derselben Bestellnummer). Beide wurden mit
 * dem gleichen Pre-Persist-Check geschlossen.
 */
import { describe, it, expect, vi } from "vitest";
import { shouldSkipAsStubDuplicate } from "../dedup";

interface FakeExisting {
  id: string;
  gesamtbetrag: number | null;
  storage_pfad: string | null;
}

function makeSupabase(existing: FakeExisting[] | null, error: Error | null = null) {
  const limit = vi.fn().mockResolvedValue({ data: existing, error });
  const eq3 = vi.fn().mockReturnValue({ limit });
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

describe("shouldSkipAsStubDuplicate", () => {
  const baseInput = {
    bestellungId: "bestellung-uuid",
    typ: "rechnung",
    bestellnummerErkannt: "78611",
    newGesamtbetrag: null,
    newStoragePfad: null,
  };

  it("skipt Stub wenn vollständige Rechnung mit gleicher BN existiert (PDF-Fall)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 1601.09, storage_pfad: "bestellung-uuid/rechnung_xxx.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({ ...baseInput, supabase });
    expect(skip).toBe(true);
  });

  it("skipt Stub wenn vollständige Rechnung nur Betrag hat (kein PDF, body-only-Original)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 573.26, storage_pfad: null },
    ]);
    const skip = await shouldSkipAsStubDuplicate({ ...baseInput, supabase });
    expect(skip).toBe(true);
  });

  it("skipt NICHT wenn keine existierende Rechnung", async () => {
    const supabase = makeSupabase([]);
    const skip = await shouldSkipAsStubDuplicate({ ...baseInput, supabase });
    expect(skip).toBe(false);
  });

  it("skipt NICHT wenn neues Doku selbst Betrag hat (= echte Teil-Rechnung mit fehlendem PDF)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 1601.09, storage_pfad: "x.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({
      ...baseInput,
      supabase,
      newGesamtbetrag: 500, // hat Betrag → kein Stub
    });
    expect(skip).toBe(false);
  });

  it("skipt NICHT wenn neues Doku PDF hat (= Anhang-Path)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 1601.09, storage_pfad: "x.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({
      ...baseInput,
      supabase,
      newStoragePfad: "bestellung-uuid/rechnung_new.pdf",
    });
    expect(skip).toBe(false);
  });

  it("skipt NICHT für Bestellbestätigung (nur rechnung schützen)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 1601.09, storage_pfad: "x.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({
      ...baseInput,
      supabase,
      typ: "bestellbestaetigung",
    });
    expect(skip).toBe(false);
  });

  it("skipt NICHT wenn existierende Rechnung selbst nur Stub ist (beide unvollständig — kein klarer Sieger)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: null, storage_pfad: null }, // existing ist auch Stub
    ]);
    const skip = await shouldSkipAsStubDuplicate({ ...baseInput, supabase });
    expect(skip).toBe(false);
  });

  it("skipt NICHT wenn bestellnummerErkannt fehlt (kann nicht eindeutig matchen)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 100, storage_pfad: "x.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({
      ...baseInput,
      supabase,
      bestellnummerErkannt: null,
    });
    expect(skip).toBe(false);
  });

  it("fail-open bei DB-Fehler (lieber Duplikat als Datenverlust)", async () => {
    const supabase = makeSupabase(null, new Error("connection refused"));
    const skip = await shouldSkipAsStubDuplicate({ ...baseInput, supabase });
    expect(skip).toBe(false);
  });

  it("behandelt gesamtbetrag=0 als Stub (Reklamationen mit 0€ sind keine echten Rechnungen)", async () => {
    const supabase = makeSupabase([
      { id: "ex-1", gesamtbetrag: 1601.09, storage_pfad: "x.pdf" },
    ]);
    const skip = await shouldSkipAsStubDuplicate({
      ...baseInput,
      supabase,
      newGesamtbetrag: 0,
    });
    expect(skip).toBe(true);
  });
});
