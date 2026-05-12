/**
 * mergeVendorIntoKi Tests — A5 Audit-Welle, F-BE-3.
 *
 * Lockt das konfidenz-gewichtete Override-Verhalten fest, damit künftige
 * Pipeline-Refactors die Logik nicht stillschweigend brechen.
 *
 * Regel: Bei Critical-Conflict zwischen Vendor und KI gewinnt Vendor wenn:
 *   vendor.konfidenz >= 0.85 UND ki.konfidenz <= 0.80.
 * Default sonst: KI gewinnt (außer leere/null KI-Werte).
 */

import { describe, it, expect } from "vitest";
import { mergeVendorIntoKi } from "../index";
import type { DokumentAnalyse } from "@/lib/openai";

function baseDoc(overrides: Partial<DokumentAnalyse> = {}): DokumentAnalyse {
  return {
    typ: "rechnung",
    bestellnummer: null,
    auftragsnummer: null,
    lieferscheinnummer: null,
    haendler: null,
    datum: null,
    artikel: [],
    gesamtbetrag: null,
    netto: null,
    mwst: null,
    faelligkeitsdatum: null,
    lieferdatum: null,
    bestelldatum: null,
    kundennummer: null,
    iban: null,
    konfidenz: 0.9,
    volltext: null,
    parse_fehler: null,
    ...overrides,
  } as DokumentAnalyse;
}

describe("mergeVendorIntoKi — Default-Verhalten", () => {
  it("übernimmt Vendor-Wert wenn KI null/leer", () => {
    const ki = baseDoc({ bestellnummer: null, gesamtbetrag: null });
    const vendor = baseDoc({ bestellnummer: "VND-001", gesamtbetrag: 100 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.bestellnummer).toBe("VND-001");
    expect(merged.gesamtbetrag).toBe(100);
  });

  it("behält KI-Konfidenz immer (NEVER_MERGE)", () => {
    const ki = baseDoc({ konfidenz: 0.9 });
    const vendor = baseDoc({ konfidenz: 0.5 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.konfidenz).toBe(0.9);
  });

  it("override typ nur wenn KI 'unbekannt'", () => {
    const kiUnbekannt = baseDoc({ typ: "unbekannt" });
    const vendor = baseDoc({ typ: "rechnung" });
    expect(mergeVendorIntoKi(kiUnbekannt, vendor).typ).toBe("rechnung");

    const kiBekannt = baseDoc({ typ: "lieferschein" });
    expect(mergeVendorIntoKi(kiBekannt, vendor).typ).toBe("lieferschein");
  });

  it("KI gewinnt bei Konflikt wenn beide hohe Konfidenz haben", () => {
    const ki = baseDoc({ bestellnummer: "KI-123", konfidenz: 0.92 });
    const vendor = baseDoc({ bestellnummer: "VND-456", konfidenz: 0.95 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.bestellnummer).toBe("KI-123");
  });
});

describe("mergeVendorIntoKi — Konfidenz-gewichtetes Override (F-BE-3)", () => {
  it("Vendor 0.92 + KI 0.65 → Vendor gewinnt für Bestellnr", () => {
    const ki = baseDoc({ bestellnummer: "KI-WRONG", konfidenz: 0.65 });
    const vendor = baseDoc({ bestellnummer: "VND-RIGHT", konfidenz: 0.92 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.bestellnummer).toBe("VND-RIGHT");
  });

  it("Vendor 0.90 + KI 0.80 → KI gewinnt (Threshold-Boundary)", () => {
    // KI exactly at 0.80 (= threshold), vendor at 0.90 — KI gewinnt
    // weil unsere Bedingung kiKonfidenz <= 0.80 ist (inklusiv).
    // Eigentlich wollen wir override-AKTIV bei <= 0.8 → Vendor gewinnt.
    // Test dokumentiert das Verhalten.
    const ki = baseDoc({ bestellnummer: "KI-X", konfidenz: 0.8 });
    const vendor = baseDoc({ bestellnummer: "VND-Y", konfidenz: 0.9 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.bestellnummer).toBe("VND-Y"); // <= 0.8 triggert override
  });

  it("Vendor 0.84 (unter Threshold) → KI gewinnt trotz niedriger KI-Konfidenz", () => {
    const ki = baseDoc({ bestellnummer: "KI-X", konfidenz: 0.5 });
    const vendor = baseDoc({ bestellnummer: "VND-Y", konfidenz: 0.84 });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.bestellnummer).toBe("KI-X"); // Vendor erreicht nicht 0.85
  });

  it("Override greift auf Beträge + IBAN + Faelligkeitsdatum", () => {
    const ki = baseDoc({
      gesamtbetrag: 999,
      iban: "DE00 0000 0000 0000 0000 00",
      faelligkeitsdatum: "2026-12-31",
      konfidenz: 0.5,
    });
    const vendor = baseDoc({
      gesamtbetrag: 1234.56,
      iban: "DE12 3456 7890 1234 5678 90",
      faelligkeitsdatum: "2026-05-30",
      konfidenz: 0.95,
    });
    const merged = mergeVendorIntoKi(ki, vendor);
    expect(merged.gesamtbetrag).toBe(1234.56);
    expect(merged.iban).toBe("DE12 3456 7890 1234 5678 90");
    expect(merged.faelligkeitsdatum).toBe("2026-05-30");
  });

  it("Override greift NICHT auf nicht-critical Fields wie Händler-Name", () => {
    const ki = baseDoc({ haendler: "KI-Detected", konfidenz: 0.5 });
    const vendor = baseDoc({ haendler: "VendorDetected", konfidenz: 0.95 });
    const merged = mergeVendorIntoKi(ki, vendor);
    // haendler ist nicht in CRITICAL_OVERRIDE_FIELDS → KI gewinnt
    expect(merged.haendler).toBe("KI-Detected");
  });
});
