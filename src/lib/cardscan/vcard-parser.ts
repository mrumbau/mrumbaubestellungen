// CardScan Module – vCard (.vcf) Parser
// Direktes Parsing ohne GPT – vCard-Felder werden 1:1 auf ExtractedContactData gemappt.

import { logInfo } from "@/lib/logger";
import type { ExtractedContactData, ConfidenceScores } from "@/lib/cardscan/types";

const ROUTE_TAG = "/lib/cardscan/vcard-parser";

interface VcardParseResult {
  data: ExtractedContactData;
  confidence: ConfidenceScores;
}

/**
 * Parst einen vCard-String (.vcf) direkt in ExtractedContactData.
 * Kein GPT-Call nötig – vCard hat ein festes Schema.
 */
export function parseVcard(vcfContent: string): VcardParseResult {
  const lines = vcfContent.split(/\r?\n/);
  const fields: Record<string, string> = {};

  // Einfacher vCard-Parser (unterstützt v3.0 und v4.0)
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const keyPart = line.slice(0, colonIdx).toUpperCase();
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    // Property-Name extrahieren (ohne Parameter wie ;TYPE=WORK etc.)
    const propName = keyPart.split(";")[0];
    const typeParams = keyPart.toUpperCase(); // z.B. "TEL;TYPE=CELL"

    switch (propName) {
      case "FN":
        fields.fn = value;
        break;
      case "N": {
        // N:Nachname;Vorname;Weitere;Prefix;Suffix
        const parts = value.split(";");
        if (parts[0]) fields.lastName = parts[0];
        if (parts[1]) fields.firstName = parts[1];
        if (parts[3]) fields.title = parts[3]; // Prefix = Titel
        break;
      }
      case "ORG":
        fields.org = value.split(";")[0];
        break;
      case "TITLE":
      case "ROLE":
        fields.role = value;
        break;
      case "EMAIL":
        fields.email = value;
        break;
      case "TEL": {
        const isCell =
          typeParams.includes("CELL") || typeParams.includes("MOBILE");
        const isFax = typeParams.includes("FAX");
        if (isFax) {
          fields.fax = value;
        } else if (isCell) {
          fields.mobile = value;
        } else {
          // Erstes TEL ohne spezifischen Typ → phone
          if (!fields.phone) fields.phone = value;
          else if (!fields.mobile) fields.mobile = value;
        }
        break;
      }
      case "ADR": {
        // ADR:;;Straße;Stadt;Region;PLZ;Land
        const adrParts = value.split(";");
        const streetFull = adrParts[2] || "";
        // Hausnummer aus Straße extrahieren (letztes Wort wenn es eine Zahl enthält)
        const streetMatch = streetFull.match(/^(.+?)\s+(\d[\w/-]*)$/);
        fields.street = streetMatch ? streetMatch[1] : streetFull;
        fields.houseNumber = streetMatch ? streetMatch[2] : "";
        fields.city = adrParts[3] || "";
        fields.zip = adrParts[5] || "";
        fields.country = adrParts[6] || "";
        break;
      }
      case "URL":
        fields.website = value;
        break;
      case "NOTE":
        fields.note = value;
        break;
    }
  }

  // Bestimme customer_type
  const isCompany = !!fields.org && !fields.firstName && !fields.lastName;
  const isCompanyWithPerson = !!fields.org && (!!fields.firstName || !!fields.lastName);

  const data: ExtractedContactData = {
    customer_type: fields.org ? "company" : "private",
    gender: null, // vCard hat kein Geschlecht-Feld
    title: fields.title || null,
    firstName: isCompany ? null : (fields.firstName || null),
    lastName: isCompany ? null : (fields.lastName || null),
    companyName: fields.org || null,
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    fax: fields.fax || null,
    website: fields.website || null,
    vatId: null,
    letterSalutation: null, // Nicht aus vCard ableitbar
    address:
      fields.street || fields.city
        ? {
            street: fields.street || null,
            houseNumber: fields.houseNumber || null,
            zip: fields.zip || null,
            city: fields.city || null,
            countryCode: fields.country
              ? fields.country.slice(0, 2).toUpperCase()
              : null,
          }
        : null,
    contactPerson:
      isCompanyWithPerson
        ? {
            salutation: null,
            firstName: fields.firstName || null,
            lastName: fields.lastName || null,
            title: fields.title || null,
            role: fields.role || null,
            email: fields.email || null,
            phone: fields.phone || null,
            mobile: fields.mobile || null,
          }
        : null,
    notes: fields.note || null,
  };

  // vCard-Felder haben hohe Confidence (strukturiertes Format)
  const confidence: ConfidenceScores = {
    overall: 0.95,
    customer_type: fields.org ? 0.9 : 0.85,
    gender: 0.0, // Nicht aus vCard ableitbar
    firstName: fields.firstName ? 1.0 : 0.0,
    lastName: fields.lastName ? 1.0 : 0.0,
    companyName: fields.org ? 1.0 : 0.0,
    email: fields.email ? 1.0 : 0.0,
    phone: fields.phone ? 1.0 : 0.0,
    mobile: fields.mobile ? 1.0 : 0.0,
    address: fields.street || fields.city ? 0.95 : 0.0,
    contactPerson: isCompanyWithPerson ? 0.9 : 0.0,
  };

  logInfo(ROUTE_TAG, "vCard geparst", {
    hasOrg: !!fields.org,
    hasName: !!(fields.firstName || fields.lastName),
    hasEmail: !!fields.email,
    hasAddress: !!(fields.street || fields.city),
  });

  return { data, confidence };
}
