/**
 * Tests für die zentrale Mahnung-Display-Logik (09.06.2026 v2).
 *
 * Regel-Set:
 *   - mahnung_am muss gesetzt sein
 *   - mahnung_count > 0 und ≤ 10
 *   - bezahlt_am leer
 *   - bezahlt_bereits ≠ true
 *   - hat_rechnung === true (NEU 09.06.2026)
 *   - status nicht terminal
 *
 * Wenn alle erfüllt → shouldShowMahnung=true.
 * Wenn Mahn-Mail eingegangen aber keine Rechnung → mahnungReviewHinweis
 * liefert einen Hinweis-Text statt einer Stufe.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldShowMahnung,
  mahnungStufeLabel,
  effectiveMahnungCount,
  mahnungReviewHinweis,
} from '../mahnung-display';

const HEUTE = '2026-06-09T10:00:00Z';

describe('shouldShowMahnung', () => {
  it('zeigt Mahnung bei vollständigem Happy-Path', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 1,
        hat_rechnung: true,
        bezahlt_am: null,
        bezahlt_bereits: false,
        status: 'offen',
      }),
    ).toBe(true);
  });

  it('blockt wenn keine Rechnung hinterlegt (hat_rechnung=false)', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 2,
        hat_rechnung: false,
        bezahlt_am: null,
        bezahlt_bereits: false,
        status: 'offen',
      }),
    ).toBe(false);
  });

  it('blockt wenn hat_rechnung undefined ist (Default-Defensive)', () => {
    // Caller hat das Feld nicht geladen → Helper darf NICHT durchwinken.
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 2,
      }),
    ).toBe(false);
  });

  it('blockt wenn PayPal-bezahlt (bezahlt_bereits=true)', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 2,
        hat_rechnung: true,
        bezahlt_am: null,
        bezahlt_bereits: true,
        status: 'offen',
      }),
    ).toBe(false);
  });

  it('blockt wenn bezahlt_am gesetzt', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 2,
        hat_rechnung: true,
        bezahlt_am: HEUTE,
        bezahlt_bereits: false,
        status: 'offen',
      }),
    ).toBe(false);
  });

  it('blockt bei terminalem Status', () => {
    for (const status of ['freigegeben', 'verworfen', 'storniert']) {
      expect(
        shouldShowMahnung({
          mahnung_am: HEUTE,
          mahnung_count: 2,
          hat_rechnung: true,
          status,
        }),
      ).toBe(false);
    }
  });

  it('blockt bei mahnung_count > 10 (Sanity-Cap, Datenmüll-Schutz)', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 11,
        hat_rechnung: true,
      }),
    ).toBe(false);
  });

  it('blockt bei mahnung_count = 0', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: HEUTE,
        mahnung_count: 0,
        hat_rechnung: true,
      }),
    ).toBe(false);
  });

  it('blockt wenn mahnung_am leer (Counter ohne Datum ist Datenmüll)', () => {
    expect(
      shouldShowMahnung({
        mahnung_am: null,
        mahnung_count: 3,
        hat_rechnung: true,
      }),
    ).toBe(false);
  });
});

describe('mahnungStufeLabel', () => {
  const base = {
    mahnung_am: HEUTE,
    hat_rechnung: true,
    bezahlt_am: null,
    bezahlt_bereits: false,
    status: 'offen',
  };

  it("liefert 'Mahnung' für Stufe 1", () => {
    expect(mahnungStufeLabel({ ...base, mahnung_count: 1 })).toBe('Mahnung');
  });

  it("liefert 'N. Mahnung' für Stufen > 1", () => {
    expect(mahnungStufeLabel({ ...base, mahnung_count: 3 })).toBe('3. Mahnung');
    expect(mahnungStufeLabel({ ...base, mahnung_count: 7 })).toBe('7. Mahnung');
  });

  it('liefert null wenn shouldShowMahnung false ist', () => {
    expect(mahnungStufeLabel({ ...base, mahnung_count: 2, hat_rechnung: false })).toBeNull();
    expect(mahnungStufeLabel({ ...base, mahnung_count: 2, bezahlt_bereits: true })).toBeNull();
  });
});

describe('effectiveMahnungCount', () => {
  const base = {
    mahnung_am: HEUTE,
    hat_rechnung: true,
    bezahlt_am: null,
    bezahlt_bereits: false,
  };

  it('liefert den count wenn alle Bedingungen passen', () => {
    expect(effectiveMahnungCount({ ...base, mahnung_count: 5 })).toBe(5);
  });

  it('liefert 0 wenn der Helper blockt', () => {
    expect(effectiveMahnungCount({ ...base, mahnung_count: 2, hat_rechnung: false })).toBe(0);
  });
});

describe('mahnungReviewHinweis', () => {
  it('liefert Hinweis bei Mahn-Mail ohne Rechnung', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: HEUTE,
        mahnung_count: 2,
        hat_rechnung: false,
      }),
    ).toBe('Mahn-Mail erkannt, aber keine Rechnung hinterlegt');
  });

  it('liefert null wenn echte Mahnung angezeigt wird (hat_rechnung=true)', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: HEUTE,
        mahnung_count: 2,
        hat_rechnung: true,
      }),
    ).toBeNull();
  });

  it('liefert null wenn keine Mahn-Mail eingegangen war', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: null,
        hat_rechnung: false,
      }),
    ).toBeNull();
  });

  it('liefert null wenn PayPal-bezahlt — kein Hinweis nötig', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: HEUTE,
        hat_rechnung: false,
        bezahlt_bereits: true,
      }),
    ).toBeNull();
  });

  it('liefert null wenn bezahlt_am gesetzt', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: HEUTE,
        hat_rechnung: false,
        bezahlt_am: HEUTE,
      }),
    ).toBeNull();
  });

  it('liefert null bei terminalem Status — keine offene Sache mehr', () => {
    expect(
      mahnungReviewHinweis({
        mahnung_am: HEUTE,
        hat_rechnung: false,
        status: 'freigegeben',
      }),
    ).toBeNull();
  });
});
