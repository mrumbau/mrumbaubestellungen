/**
 * bestellung-match Pure-Function Tests.
 *
 * Sicherheitskritisch: bestellnummernFuzzyMatch war R5c-Bug-Trigger
 * (CBEPFVF ⊂ CP-CBEPFVF-128671457-1 wurde nicht erkannt → Doppel-Bestellungen).
 * haendlerNamesMatch ist Foundation für Cross-Match (Bestellnummer kommt aus
 * verschiedenen Schreibweisen wie "CHECK24" vs "CHECK24 Vergleichsportal Autoteile GmbH").
 *
 * findByExactNumber/findByFuzzyNumber/findByCrossMatch brauchen Supabase-Mock —
 * separat in Mock-Infrastruktur-Sprint.
 */

import { describe, it, expect } from "vitest";
import {
  bestellnummernFuzzyMatch,
  haendlerNamesMatch,
} from "../bestellung-match";

describe("bestellnummernFuzzyMatch — R5c-Bugfix Substring-Match", () => {
  it("exakter Match", () => {
    expect(bestellnummernFuzzyMatch("CBEPFVF", "CBEPFVF")).toBe(true);
    expect(bestellnummernFuzzyMatch("305-1234567-1234567", "305-1234567-1234567")).toBe(true);
  });

  it("CHECK24-Bug: kurze Nr ⊂ lange Nr (Original-Pattern)", () => {
    // Genau das R5c-Bug-Szenario aus Sprint-Memory
    expect(bestellnummernFuzzyMatch("CBEPFVF", "CP-CBEPFVF-128671457-1")).toBe(true);
    expect(bestellnummernFuzzyMatch("CP-CBEPFVF-128671457-1", "CBEPFVF")).toBe(true); // umgekehrt
  });

  it("AUF-Nummer mit Prefix ⊂ vollständige Form", () => {
    expect(bestellnummernFuzzyMatch("AUF1234567", "Auftrag-AUF1234567-Position-1")).toBe(true);
  });

  it("Mindest-Länge 4 — kürzere Nummern werden nicht fuzzy gematched", () => {
    expect(bestellnummernFuzzyMatch("123", "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("ABC", "ABCDEF")).toBe(false);
  });

  it("liefert false bei null/undefined/leer", () => {
    expect(bestellnummernFuzzyMatch(null, "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("123456", null)).toBe(false);
    expect(bestellnummernFuzzyMatch(null, null)).toBe(false);
    expect(bestellnummernFuzzyMatch("", "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("123456", undefined)).toBe(false);
  });

  it("liefert false bei komplett unterschiedlichen Nummern", () => {
    expect(bestellnummernFuzzyMatch("ABC123456", "XYZ987654")).toBe(false);
    expect(bestellnummernFuzzyMatch("AUF1234567", "RE-9876543")).toBe(false);
  });

  it("trimt Whitespace", () => {
    expect(bestellnummernFuzzyMatch("  CBEPFVF  ", "CP-CBEPFVF-1")).toBe(true);
  });
});

describe("haendlerNamesMatch — Cross-Match-Logic", () => {
  it("identischer Name", () => {
    expect(haendlerNamesMatch("CHECK24", "CHECK24")).toBe(true);
    expect(haendlerNamesMatch("Brillux GmbH", "Brillux GmbH")).toBe(true);
  });

  it("case-insensitive", () => {
    expect(haendlerNamesMatch("CHECK24", "check24")).toBe(true);
    expect(haendlerNamesMatch("brillux", "Brillux")).toBe(true);
  });

  it("Substring-Match (kurzer Name in langem)", () => {
    expect(haendlerNamesMatch("CHECK24", "CHECK24 Vergleichsportal Autoteile GmbH")).toBe(true);
    expect(haendlerNamesMatch("CHECK24 Vergleichsportal Autoteile GmbH", "CHECK24")).toBe(true);
    expect(haendlerNamesMatch("Rexel", "Rexel Germany GmbH & Co. KG")).toBe(true);
  });

  it("Token-Match: gemeinsames signifikantes Wort", () => {
    expect(haendlerNamesMatch("Süd-Metall GmbH", "Süd-Metall Verkauf")).toBe(true);
    expect(haendlerNamesMatch("Hold & Spada Bau", "Spada Bauleistungen")).toBe(true);
  });

  it("Stop-Words führen NICHT zu false-positive", () => {
    // "GmbH", "Vergleichsportal", "Service" sind Stop-Words → nicht alleine matchend
    expect(haendlerNamesMatch("Foo GmbH", "Bar GmbH")).toBe(false);
    expect(haendlerNamesMatch("Foo Service", "Bar Service")).toBe(false);
  });

  it("Wörter <4 chars führen NICHT zu false-positive", () => {
    expect(haendlerNamesMatch("Mr Test", "Mr Foo")).toBe(false); // "Mr" + "Mr" sind <4
    expect(haendlerNamesMatch("XY GmbH", "XY OHG")).toBe(false);
  });

  it("liefert false bei null/undefined/leer", () => {
    expect(haendlerNamesMatch(null, "CHECK24")).toBe(false);
    expect(haendlerNamesMatch("CHECK24", null)).toBe(false);
    expect(haendlerNamesMatch(null, null)).toBe(false);
    expect(haendlerNamesMatch("", "CHECK24")).toBe(false);
  });

  it("Substring-Match nur bei Mindest-Länge 4", () => {
    // "ABC" als Substring in "ABCDEF" matched NICHT (zu kurz für sicheren Match)
    expect(haendlerNamesMatch("ABC", "ABCDEFGH")).toBe(false);
  });

  it("Reine Zahlen-Token werden ignoriert", () => {
    // "1234" allein ist kein gültiges Token (reine Zahl filter)
    expect(haendlerNamesMatch("Lieferant 1234", "Anderer 1234")).toBe(false);
  });

  it("Sonderzeichen werden in Token normalisiert", () => {
    // & und Bindestriche werden zu Leerzeichen
    expect(haendlerNamesMatch("Hold & Spada", "Hold-Spada")).toBe(true); // beide haben Token "hold" + "spada"
  });
});
