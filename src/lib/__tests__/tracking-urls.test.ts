/**
 * tracking-urls Tests — Versand-URL-Templates.
 *
 * Wird aus dem versand-handler aufgerufen wenn Tracking-Nummer gefunden ist
 * aber keine URL im Body. Alle 6 Templates müssen gültig + URL-encoded sein.
 */

import { describe, it, expect } from "vitest";
import { buildTrackingUrl } from "../tracking-urls";

describe("buildTrackingUrl", () => {
  it("baut DHL-URL mit korrektem Param", () => {
    const url = buildTrackingUrl("DHL", "00340434161094016769");
    expect(url).toBe("https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094016769");
  });

  it("baut DPD-URL mit korrektem Pfad", () => {
    const url = buildTrackingUrl("DPD", "12345678901234");
    expect(url).toContain("tracking.dpd.de");
    expect(url).toContain("12345678901234");
  });

  it("baut FedEx-URL", () => {
    const url = buildTrackingUrl("FedEx", "871102802954");
    expect(url).toContain("fedex.com/fedextrack");
    expect(url).toContain("trknbr=871102802954");
  });

  it("baut UPS / GLS / Hermes URLs", () => {
    expect(buildTrackingUrl("UPS", "1Z999AA10123456784")).toContain("ups.com/track");
    expect(buildTrackingUrl("GLS", "ABC123")).toContain("gls-group.com");
    expect(buildTrackingUrl("Hermes", "H1234567890")).toContain("myhermes.de");
  });

  it("ist case-insensitive für Dienstleister-Namen", () => {
    expect(buildTrackingUrl("dhl", "ABC123")).not.toBeNull();
    expect(buildTrackingUrl("DHL", "ABC123")).not.toBeNull();
    expect(buildTrackingUrl("Dhl", "ABC123")).not.toBeNull();
  });

  it("trimt Whitespace bei Dienstleister + Nummer", () => {
    const url = buildTrackingUrl("  DHL  ", "  ABC123  ");
    expect(url).toContain("ABC123");
    expect(url).not.toContain("  ");
  });

  it("URL-encodes Sondernzeichen in der Nummer", () => {
    const url = buildTrackingUrl("DHL", "ABC#123");
    expect(url).toContain("ABC%23123");
  });

  it("liefert null bei unbekanntem Dienstleister", () => {
    expect(buildTrackingUrl("DPDirect", "ABC")).toBeNull();
    expect(buildTrackingUrl("PostKlugscheißer", "X")).toBeNull();
    expect(buildTrackingUrl("", "ABC")).toBeNull();
  });
});

describe("Versand-Tracking-Pattern (aus versand-handler)", () => {
  // Replizierte Regex aus versand-handler.ts — nicht exportiert, hier für Test
  const TRACKING_REGEX = /(?:sendungsnummer|tracking[- ]?(?:nr|nummer|number|id|code)|paketnummer|shipment)[:\s]*([A-Z0-9]{8,30})/i;
  const BESTELL_REGEX = /(?:bestellnummer|bestellung|order|auftrag)[:\s#]*([A-Z0-9-]{4,30})/i;

  it("Tracking-Pattern matched DE+EN-Varianten", () => {
    expect("Sendungsnummer: 00340434161094016769".match(TRACKING_REGEX)?.[1]).toBe("00340434161094016769");
    expect("tracking-nummer 12345678901234".match(TRACKING_REGEX)?.[1]).toBe("12345678901234");
    expect("Tracking ID: ABC12345".match(TRACKING_REGEX)?.[1]).toBe("ABC12345");
    expect("Paketnummer: H1234567890".match(TRACKING_REGEX)?.[1]).toBe("H1234567890");
  });

  it("Tracking-Pattern verwirft zu kurze Nummern (<8 chars)", () => {
    expect("Sendungsnummer: ABC123".match(TRACKING_REGEX)).toBeNull(); // 6 chars
  });

  it("Bestell-Pattern matched DE+EN-Varianten + Hash-Prefix", () => {
    expect("Bestellnummer: M1234567".match(BESTELL_REGEX)?.[1]).toBe("M1234567");
    expect("order #ABC123".match(BESTELL_REGEX)?.[1]).toBe("ABC123");
    expect("Auftrag: AUF1234567".match(BESTELL_REGEX)?.[1]).toBe("AUF1234567");
    expect("Ihre Bestellung 12345678".match(BESTELL_REGEX)?.[1]).toBe("12345678");
  });

  it("Bestell-Pattern erkennt Bindestrich-Format (Amazon)", () => {
    const match = "bestellung 305-1234567-1234567".match(BESTELL_REGEX);
    expect(match?.[1]).toBe("305-1234567-1234567");
  });
});
