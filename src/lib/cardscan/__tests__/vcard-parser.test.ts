import { describe, it, expect } from "vitest";
import { parseVcard } from "../vcard-parser";

describe("parseVcard", () => {
  it("parst eine simple Privatperson", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Mustermann;Max;;;",
      "FN:Max Mustermann",
      "EMAIL:max@example.com",
      "TEL;TYPE=CELL:+491701234567",
      "END:VCARD",
    ].join("\r\n");

    const { data, confidence } = parseVcard(vcf);

    expect(data.customer_type).toBe("private");
    expect(data.firstName).toBe("Max");
    expect(data.lastName).toBe("Mustermann");
    expect(data.email).toBe("max@example.com");
    expect(data.mobile).toBe("+491701234567");
    expect(data.phone).toBeNull();
    expect(data.companyName).toBeNull();
    expect(data.contactPerson).toBeNull();
    expect(confidence.overall).toBeGreaterThan(0.9);
  });

  it("parst Firma mit Ansprechpartner", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Schmidt;Anna",
      "FN:Anna Schmidt",
      "ORG:ACME GmbH",
      "TITLE:Geschäftsführerin",
      "EMAIL:anna@acme.de",
      "TEL;TYPE=WORK:+4989123456",
      "TEL;TYPE=CELL:+491511234567",
      "TEL;TYPE=FAX:+4989999",
      "ADR:;;Hauptstraße 12;München;;80331;Deutschland",
      "URL:https://acme.de",
      "END:VCARD",
    ].join("\n");

    const { data } = parseVcard(vcf);

    expect(data.customer_type).toBe("company");
    expect(data.companyName).toBe("ACME GmbH");
    // Bei Firma mit Person: Top-Level Name UND contactPerson werden befüllt
    // (downstream entscheidet welche Felder ans CRM gemappt werden)
    expect(data.firstName).toBe("Anna");
    expect(data.lastName).toBe("Schmidt");
    expect(data.contactPerson).not.toBeNull();
    expect(data.contactPerson?.firstName).toBe("Anna");
    expect(data.contactPerson?.lastName).toBe("Schmidt");
    expect(data.phone).toBe("+4989123456");
    expect(data.mobile).toBe("+491511234567");
    expect(data.fax).toBe("+4989999");
    expect(data.address?.street).toBe("Hauptstraße");
    expect(data.address?.houseNumber).toBe("12");
    expect(data.address?.zip).toBe("80331");
    expect(data.address?.city).toBe("München");
    expect(data.address?.countryCode).toBe("DE");
    expect(data.website).toBe("https://acme.de");
  });

  it("akzeptiert v4.0 mit CRLF-Zeilenenden", () => {
    const vcf =
      "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Klaus Müller\r\nN:Müller;Klaus\r\nEMAIL:k@m.de\r\nEND:VCARD\r\n";
    const { data } = parseVcard(vcf);
    expect(data.firstName).toBe("Klaus");
    expect(data.lastName).toBe("Müller");
    expect(data.email).toBe("k@m.de");
  });

  it("eskaliert escaped semicolons in Feldern (RFC 6350 §3.4)", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "ORG:Maler\\; Lackierer GmbH",
      "FN:Test",
      "END:VCARD",
    ].join("\n");
    const { data } = parseVcard(vcf);
    expect(data.companyName).toBe("Maler; Lackierer GmbH");
  });

  it("setzt Confidence=0 für fehlende Felder", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Solo",
      "N:Solo;",
      "END:VCARD",
    ].join("\n");
    const { confidence } = parseVcard(vcf);
    expect(confidence.email).toBe(0);
    expect(confidence.phone).toBe(0);
    expect(confidence.companyName).toBe(0);
    expect(confidence.address).toBe(0);
  });

  it("ignoriert leere und Property-lose Zeilen ohne Crash", () => {
    const vcf = [
      "BEGIN:VCARD",
      "",
      "VERSION:3.0",
      "RANDOMGARBAGE",
      "FN:OK",
      "N:OK;",
      "END:VCARD",
    ].join("\n");
    const { data } = parseVcard(vcf);
    expect(data.lastName).toBe("OK");
  });

  it("erkennt private Person ohne ORG", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Weber;Familie",
      "FN:Familie Weber",
      "EMAIL:weber@home.de",
      "END:VCARD",
    ].join("\n");
    const { data } = parseVcard(vcf);
    expect(data.customer_type).toBe("private");
    expect(data.lastName).toBe("Weber");
    expect(data.firstName).toBe("Familie");
  });
});
