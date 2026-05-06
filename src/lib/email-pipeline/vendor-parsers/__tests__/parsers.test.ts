/**
 * Vendor-Parser Smoke-Tests.
 *
 * Pro Parser: matches() mit echtem Beispiel-Subject/Sender → erwartet true,
 * parse() liefert nicht-null mit erwarteten Feldern (bestellnummer, haendler,
 * typ, konfidenz). Plus Negativtest: fremde Domain → matches false.
 *
 * Beispiel-Daten stammen aus echten Mail-Headern (DB-Query 2026-05-05),
 * NICHT spekuliert. Falls ein Test fehlschlägt: erst echtes Mail-Sample
 * holen, dann Test anpassen — Pipeline-Prinzip "DB-Query statt Spekulation".
 */

import { describe, it, expect } from "vitest";
import { tryParseVendor } from "../index";
import type { VendorParserInput } from "../types";

function makeInput(overrides: Partial<VendorParserInput>): Omit<VendorParserInput, "email_domain"> & { email_domain?: string } {
  return {
    email_absender: overrides.email_absender || "test@example.com",
    email_betreff: overrides.email_betreff || "",
    email_text: overrides.email_text || "",
    email_html: overrides.email_html ?? null,
    anhaenge: overrides.anhaenge || [],
    email_domain: overrides.email_domain,
  };
}

describe("Vendor-Parser Dispatch", () => {
  it("liefert null für unbekannten Sender", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "no-vendor@random-stranger.example",
        email_betreff: "Hallo",
        email_text: "Lorem ipsum",
      }),
    );
    expect(result).toBeNull();
  });
});

describe("Amazon Parser", () => {
  it("matched amazon.de + setzt bestellnummer-Format 305-XXXXXXX-XXXXXXX", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "auto-confirm@amazon.de",
        email_betreff: "Ihre Amazon.de Bestellung von 305-1234567-1234567",
        email_text: "Bestellnummer 305-1234567-1234567",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("amazon");
    expect(result!.result.documents[0].bestellnummer).toMatch(/^305-\d{7}-\d{7}$/);
  });
});

describe("Telekom Parser", () => {
  it("matched telekom.de + extrahiert RechnungsNr aus Body", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "kundenservice-rechnungonline@telekom.de",
        email_betreff: "Telekom Mobilfunk-Rechnung für Geschäftskunden März 2026",
        email_text: "Rechnungsnummer 123456789012\nBuchungskonto 87654321",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("telekom");
    expect(result!.result.documents[0].bestellnummer).toBe("123456789012");
    expect(result!.result.documents[0].vermutete_bestellungsart).toBe("abo");
    expect(result!.result.documents[0].haendler).toContain("Mobilfunk");
  });

  it("verwirft Marketing-Mails (kein 'Rechnung' im Subject)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "newsletter@telekom.de",
        email_betreff: "Neue Tarife im April",
      }),
    );
    expect(result).toBeNull();
  });
});

describe("Kaufland Marketplace Parser", () => {
  it("extrahiert M-Pattern Bestellnummer aus Subject", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "noreply@kaufland-marktplatz.de",
        email_betreff: "Rechnung zu deiner Bestellung M1234567",
        email_text: "Bestellung M1234567 vom 04.05.2026",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("kaufland-marketplace");
    expect(result!.result.documents[0].bestellnummer).toBe("M1234567");
    expect(result!.result.documents[0].typ).toBe("rechnung");
  });
});

describe("Süd-Metall Parser", () => {
  it("extrahiert AUF-Nummer + Kundennummer aus Subject", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "info@sued-metall.de",
        email_betreff: "Süd-Metall AUF1234567 Kd-Nr.: 654321",
        email_text: "Auftragsbestätigung",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("sued-metall");
    expect(result!.result.documents[0].auftragsnummer).toBe("AUF1234567");
    expect(result!.result.documents[0].kundennummer).toBe("654321");
  });

  it("Subject-Fallback (Domain-fremd, aber 'Süd-Metall' + AUF im Subject)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "forwarder@example.com",
        email_betreff: "Fwd: Süd-Metall AUF7654321 ...",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("sued-metall");
    expect(result!.result.documents[0].auftragsnummer).toBe("AUF7654321");
  });

  it("Versandbestätigung wird KORREKT als versandbestaetigung klassifiziert (Bug 22.04.: KI hatte fälschlich bestellbestaetigung)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "lieferschein@suedmetall.com",
        email_betreff: "Ihre Bestellung AUF3631178 wurde versandt | Süd-Metall Beschläge GmbH",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("sued-metall");
    expect(result!.result.documents[0].typ).toBe("versandbestaetigung");
    expect(result!.result.documents[0].auftragsnummer).toBe("AUF3631178");
  });
});

describe("DeubaXXL Parser", () => {
  it("extrahiert 'Deine Bestellung XXX' aus Subject", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "noreply@deubaxxl.de",
        email_betreff: "Deine Bestellung 1234567 wurde bestätigt",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("deubaxxl");
    expect(result!.result.documents[0].bestellnummer).toBe("1234567");
  });
});

describe("Megabad Parser", () => {
  it("Sender-driven: warenausgang@ → versandbestaetigung", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "warenausgang@megabad.de",
        email_betreff: "Bestellung 81218020 unterwegs",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.documents[0].typ).toBe("versandbestaetigung");
    expect(result!.result.documents[0].bestellnummer).toBe("81218020");
  });

  it("Sender-driven: info@ ohne Subject-Keyword → bestellbestaetigung", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "info@megabad.de",
        email_betreff: "Bestellung 81218020", // kein klares Keyword
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.documents[0].typ).toBe("bestellbestaetigung");
  });
});

describe("Hold & Spada Parser", () => {
  it("Subject-Pattern '<digits>, DD.MM.YYYY, Mailversand'", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "tanja.santl@hold-spada.com",
        email_betreff: "26405829, 04.05.2026, Mailversand",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("hold-spada");
    expect(result!.result.documents[0].bestellnummer).toBe("26405829");
    expect(result!.result.documents[0].datum).toBe("2026-05-04");
    expect(result!.result.documents[0].vermutete_bestellungsart).toBe("subunternehmer");
  });
});

describe("Rexel Parser", () => {
  it("extrahiert RechnungsNr + Datum + KundenNr", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "rechnung@rexel.de",
        email_betreff: "Ihre Rechnung Nr. 3549364 vom 20.04.2026 - Kunden Nr. 9447944",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("rexel");
    expect(result!.result.documents[0].bestellnummer).toBe("3549364");
    expect(result!.result.documents[0].datum).toBe("2026-04-20");
    expect(result!.result.documents[0].kundennummer).toBe("9447944");
  });
});

describe("CHECK24 Parser", () => {
  it("Account-Mails (kundenkonto@) werden NICHT erfasst", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "kundenkonto@check24.de",
        email_betreff: "414825 ist Ihr CHECK24 Einmalcode zur Anmeldung",
      }),
    );
    expect(result).toBeNull();
  });

  it("Sub-Brand-Detection für noreply.autoteile@", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "noreply.autoteile@check24.de",
        email_betreff: "Wie schön: Ihre Bestellung ist da!",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.documents[0].haendler).toContain("Autoteile");
    expect(result!.result.documents[0].typ).toBe("bestellbestaetigung");
  });

  it("handwerk@ Sender → bestellungsart=abo", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "handwerk@check24.de",
        email_betreff: "Profis Prime: Abbuchung steht an",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.documents[0].vermutete_bestellungsart).toBe("abo");
    expect(result!.result.documents[0].typ).toBe("rechnung");
  });
});

describe("Microsoft Parser", () => {
  it("matched nur Billing-Subjects, nicht Service-Mails", async () => {
    const billingResult = await tryParseVendor(
      makeInput({
        email_absender: "microsoft-noreply@microsoft.com",
        email_betreff: "Rechnung für Microsoft 365 Business Standard einsehen",
      }),
    );
    expect(billingResult).not.toBeNull();
    expect(billingResult!.result.vendor).toBe("microsoft");
    expect(billingResult!.result.documents[0].haendler).toContain("Microsoft");

    const securityResult = await tryParseVendor(
      makeInput({
        email_absender: "microsoft-noreply@microsoft.com",
        email_betreff: "Sicherheitswarnung: Neuer Login erkannt",
      }),
    );
    expect(securityResult).toBeNull();
  });
});

describe("Shopify Parser", () => {
  it("matched billing@shopify.com mit englischem Datum-Format", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "billing@shopify.com",
        email_betreff: "Rechnung Apr 26, 2026 für Floorstore",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("shopify");
    expect(result!.result.documents[0].datum).toBe("2026-04-26");
    expect(result!.result.documents[0].projekt_referenz).toBe("Floorstore");
    expect(result!.result.documents[0].vermutete_bestellungsart).toBe("abo");
  });

  it("schließt Marketing-Domain email.shopify.com aus", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "email@email.shopify.com",
        email_betreff: "Die perfekte Geschäftsidee finden",
      }),
    );
    expect(result).toBeNull();
  });
});

describe("FASP Anwaltskanzlei Parser", () => {
  it("extrahiert Aktenzeichen aus Subject + setzt typ=leistungsnachweis", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "info@fasp.de",
        email_betreff: "MR Umbau GmbH ./. von Nordenskjöld, Nana - Akte: 000211-26",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("fasp");
    expect(result!.result.documents[0].bestellnummer).toBe("000211-26");
    expect(result!.result.documents[0].typ).toBe("leistungsnachweis");
    expect(result!.result.documents[0].vermutete_bestellungsart).toBe("subunternehmer");
    expect(result!.result.documents[0].projekt_referenz).toContain("von Nordenskjöld");
  });
});

describe("Hamdi Muhameti Parser", () => {
  it("Subject 'Rechnung 12 2026' → RE012", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "info@hmfliesenleger.de",
        email_betreff: "Rechnung 12 2026",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("hamdi-muhameti");
    expect(result!.result.documents[0].bestellnummer).toBe("RE012");
  });

  it("Reply 'Re: Rechnung 12 2026' → gleiche RE012 (Idempotenz)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "info@hmfliesenleger.de",
        email_betreff: "Re: Rechnung 12 2026",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.documents[0].bestellnummer).toBe("RE012");
  });
});

describe("Feistbaur Parser (SU, Localpart-Match)", () => {
  it("matched feistbaur@t-online.de aber NICHT andere t-online.de-Sender", async () => {
    const matched = await tryParseVendor(
      makeInput({
        email_absender: "feistbaur@t-online.de",
        email_betreff: "Rechnung Bauvorhaben Roemerweg 309002-R",
        email_text: "Rechnungsnummer 309002-R",
      }),
    );
    expect(matched).not.toBeNull();
    expect(matched!.result.vendor).toBe("feistbaur");
    expect(matched!.result.documents[0].bestellnummer).toBe("309002-R");
    expect(matched!.result.documents[0].vermutete_bestellungsart).toBe("subunternehmer");

    const otherUser = await tryParseVendor(
      makeInput({
        email_absender: "max.mueller@t-online.de",
        email_betreff: "Rechnung",
      }),
    );
    expect(otherUser).toBeNull();
  });

  it("Konfidenz unter Threshold → KI-Merge", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "feistbaur@t-online.de",
        email_betreff: "Anfrage",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.acceptWithoutKI).toBe(false);
    expect(result!.result.konfidenz).toBeLessThan(0.75);
  });
});

describe("Brillux Parser", () => {
  it("matched brillux.de + extrahiert Rechnung Nr. + Kundennummer", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "Fakturaversand_gs_01@brillux.de",
        email_betreff: "Brillux Rechnung, Kundennummer 4147622, Rechnung Nr. 6887860",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("brillux");
    expect(result!.result.documents[0].bestellnummer).toBe("6887860");
    expect(result!.result.documents[0].kundennummer).toBe("4147622");
  });

  it("Mahnung-Mails (fm@) werden an KI delegiert (null returned)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "fm@brillux.de",
        email_betreff: "Mahnung zu Rechnung Nr. 6887860",
      }),
    );
    expect(result).toBeNull();
  });
});

describe("Fritz Baustoffe Parser", () => {
  it("extrahiert RechNr + Datum aus Subject", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "rechnung@f-b.gmbh",
        email_betreff: "RechNr: 04/1234567 vom 20.04.2026",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("fritz-baustoffe");
  });
});

describe("Plancraft Parser", () => {
  it("matched plancraft.com mit erwartetem Subject-Pattern (Rechnung X von Y)", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "rechnung@plancraft.com",
        email_betreff: "Rechnung 2026-042 von Elektro Müller GmbH",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.result.vendor).toBe("plancraft");
  });

  it("liefert null für fremde Domains die 'plancraft' im Localpart haben", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "plancraft-fan@gmail.com",
        email_betreff: "Rechnung 2026-042 von Elektro Müller GmbH",
      }),
    );
    expect(result).toBeNull();
  });
});

describe("Raab Karcher / Stark Parser", () => {
  it("liefert null für fremde Domain trotz raab-Match im Localpart", async () => {
    const result = await tryParseVendor(
      makeInput({
        email_absender: "raab@example.com",
        email_betreff: "Test",
      }),
    );
    expect(result).toBeNull();
  });
});
