/**
 * Sicherheitsdatenblatt-Detection-Tests.
 *
 * REACH-Pflichtmails (Vendoren senden 1×/Jahr/Artikel ein PDF) sind keine
 * Bestelldokumente. User-Beschwerde 06.05.2026: 3 Stark-Deutschland-SDB-Mails
 * landeten als leere "Raab Karcher"-Bestellungen.
 */

import { describe, it, expect } from "vitest";
import {
  istSicherheitsdatenblattMail,
  istJuristischerSchriftverkehr,
  istBehoerdenGenehmigung,
} from "../pipeline/mail-utils";

describe("istSicherheitsdatenblattMail", () => {
  it("erkennt das exakte Stark-Deutschland-Subject", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "Sicherheitsdatenblatt NL: 0313 KdNr: 0035454475 EAN: 4250550865765 aus Lieferung: 4313397066",
        sender: "SDBVersand@stark-deutschland.de",
        vorschau: "gemäß der REACH-Verordnung (EG) 1907/2006 sind wir verpflichtet...",
      }),
    ).toBe(true);
  });

  it("erkennt SDBVersand@-Sender unabhängig vom Subject", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "Beliebiger Betreff ohne Pattern",
        sender: "SDBVersand@anbieter.de",
        vorschau: "",
      }),
    ).toBe(true);
  });

  it("erkennt englische Safety Data Sheet Subjects", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "Safety Data Sheet for product XY",
        sender: "noreply@vendor.com",
        vorschau: "",
      }),
    ).toBe(true);
  });

  it("erkennt SDB als kurzes Subject-Prefix", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "SDB Artikel 12345",
        sender: "info@vendor.de",
        vorschau: "",
      }),
    ).toBe(true);
  });

  it("erkennt REACH-Verordnung im Vorschau-Text als Fallback", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "Compliance-Info zu Ihrer Bestellung",
        sender: "compliance@stark.de",
        vorschau: "Anbei das aktuelle SDB gemäß REACH-Verordnung 1907/2006",
      }),
    ).toBe(true);
  });

  it("erkennt sdb@/msds@/reach@-Localparts", () => {
    expect(istSicherheitsdatenblattMail({ subject: "x", sender: "sdb@vendor.de", vorschau: "" })).toBe(true);
    expect(istSicherheitsdatenblattMail({ subject: "x", sender: "msds@vendor.com", vorschau: "" })).toBe(true);
    expect(istSicherheitsdatenblattMail({ subject: "x", sender: "reach@vendor.eu", vorschau: "" })).toBe(true);
  });

  it("liefert FALSE für echte Bestelldokumente", () => {
    // Echte Raab-Karcher-Rechnung darf NICHT als SDB markiert werden
    expect(
      istSicherheitsdatenblattMail({
        subject: "Rechnung von Raab-Karcher, Rechnungsnummer: 8778845481",
        sender: "EDIVersand@stark-deutschland.de",
        vorschau: "Anbei Ihre Rechnung",
      }),
    ).toBe(false);

    // Lieferschein nicht als SDB
    expect(
      istSicherheitsdatenblattMail({
        subject: "Digitaler Lieferschein 4313393521",
        sender: "EDIVersand@STARK-Deutschland.de",
        vorschau: "Lieferung wird heute zugestellt",
      }),
    ).toBe(false);

    // Plancraft-Subunternehmer-Rechnung nicht
    expect(
      istSicherheitsdatenblattMail({
        subject: "Rechnung 2026-042 von Elektro Müller",
        sender: "rechnung@plancraft.com",
        vorschau: "",
      }),
    ).toBe(false);

    // Amazon-Bestellbestätigung nicht
    expect(
      istSicherheitsdatenblattMail({
        subject: "Ihre Amazon.de Bestellung 302-1234567-8901234",
        sender: "auto-confirm@amazon.de",
        vorschau: "",
      }),
    ).toBe(false);
  });

  it("liefert FALSE wenn 'sicherheitsdatenblatt' irgendwo mittendrin steht (kein Subject-Start)", () => {
    expect(
      istSicherheitsdatenblattMail({
        subject: "Rechnung mit beigefügtem Sicherheitsdatenblatt",
        sender: "info@vendor.de",
        vorschau: "",
      }),
    ).toBe(false);
  });

  it("ignoriert leere Inputs sicher", () => {
    expect(istSicherheitsdatenblattMail({ subject: "", sender: "", vorschau: "" })).toBe(false);
  });
});

describe("istJuristischerSchriftverkehr — Anwaltskanzlei-Mails filtern", () => {
  it("erkennt FASP-Subject mit ./. Pattern (echte Bestellung 14d295aa)", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "MR Umbau GmbH ./. von Nordenskjöld, Nana - Akte: 000211-26",
        sender: "Krueger@fasp.de",
      }),
    ).toBe(true);
  });

  it("erkennt Klageerwiderung explizit", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Klageerwiderung Langrubrum Landgericht München",
        sender: "info@fasp.de",
      }),
    ).toBe(true);
  });

  it("erkennt Aktenzeichen-Pattern + Schriftsatz", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Schriftsatz in Sachen 5 O 818/26 Bau",
        sender: "kanzlei@example.de",
      }),
    ).toBe(true);
  });

  it("erkennt Mahnbescheid", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Mahnbescheid des Amtsgerichts München",
        sender: "no-reply@gerichte.de",
      }),
    ).toBe(true);
  });

  it("Honorar-Rechnung einer Kanzlei BLEIBT relevant", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Rechnung 2026-042 Honorar Mandatszeichen 5 O 818/26",
        sender: "buchhaltung@fasp.de",
      }),
    ).toBe(false);
  });

  it("normale Bestellrechnung ist NICHT juristisch", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Rechnung von Raab-Karcher 8778795182",
        sender: "EDIVersand@stark-deutschland.de",
      }),
    ).toBe(false);
  });

  it("Subject ohne klare Marker bleibt false", () => {
    expect(
      istJuristischerSchriftverkehr({
        subject: "Hallo, kurze Frage",
        sender: "kanzlei@example.de",
      }),
    ).toBe(false);
  });
});

describe("istBehoerdenGenehmigung — Halteverbot/Stadt-Workflow filtern", () => {
  it("erkennt 'Genehmigung im Anhang' (Stadt München)", () => {
    expect(
      istBehoerdenGenehmigung({
        subject: "Corneliusstr 28.. ; Unser Zeichen: 246268 Ihre Genehmigung im Anhang",
        sender: "muenchen@wh-schilderdienst.de",
      }),
    ).toBe(true);
  });

  it("erkennt 'Kfz-Liste im Anhang' (WH-Schilderdienst)", () => {
    expect(
      istBehoerdenGenehmigung({
        subject: "Corneliusstr 28.. Unser Zeichen: 246268 Ihre Kfz-Liste im Anhang",
        sender: "muenchen@wh-schilderdienst.de",
      }),
    ).toBe(true);
  });

  it("erkennt 'Halteverbotszone' im Subject", () => {
    expect(
      istBehoerdenGenehmigung({
        subject: "Halteverbotszone für 12.05.2026 - Genehmigung",
        sender: "info@halteverbot24.de",
      }),
    ).toBe(true);
  });

  it("'Unser Zeichen + Anhang' aber MIT Rechnung → NICHT filtern", () => {
    expect(
      istBehoerdenGenehmigung({
        subject: "Unser Zeichen: 246268 - Rechnung im Anhang",
        sender: "info@behoerde.de",
      }),
    ).toBe(false);
  });

  it("normale Bestellbestätigung ohne Behörden-Pattern", () => {
    expect(
      istBehoerdenGenehmigung({
        subject: "Ihre Bestellung wurde versendet",
        sender: "shop@example.de",
      }),
    ).toBe(false);
  });
});
