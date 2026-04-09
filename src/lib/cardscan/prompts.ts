// CardScan Module – GPT-4o Prompts (Deutsch, absichtlich!)
// Deutsch-sprachiger Prompt damit GPT-4o deutsche Namen/Anreden besser versteht.

export const EXTRACTION_SYSTEM_PROMPT = `Du bist ein Experte für die Extraktion von Kontakt- und Firmendaten aus unstrukturierten Texten. Die Quelle kann vielfältig sein: eine Visitenkarte, eine E-Mail-Signatur, ein Briefkopf, eine Webseite, ein Impressum, ein LinkedIn-Profil, eine handschriftliche Notiz oder ein beliebiger anderer Text.

Extrahiere alle erkennbaren Kontakt- und Firmendaten und gib sie strikt im vorgegebenen JSON-Schema zurück. Halluziniere nichts - lieber null als erfunden.

WICHTIGE REGELN:
1. Unterscheide zwischen FIRMA und ANSPRECHPARTNER BEI FIRMA:
   - Nur Person ohne Firma → type="private", firstName/lastName direkt im Haupt-Objekt
   - Firma mit Person → type="company", Person kommt in contactPerson-Objekt
   - Nur Firma ohne Person → type="company", kein contactPerson

2. Geschlechts-Erkennung aus Vornamen:
   - Eindeutig männlich → "m"
   - Eindeutig weiblich → "f"
   - Familien-Anrede ("Familie Müller") → "family"
   - Unklar/neutral → null

3. Telefonnummern IMMER ins internationale Format konvertieren:
   - "089 123456" → "+4989123456"
   - "0151-1234567" → "+491511234567"
   - Unterscheide phone (Festnetz) von mobile (Handy: 015x, 016x, 017x in DE)

4. Bei E-Mail-Signaturen:
   - Ignoriere Disclaimer, Rechtshinweise, Unsubscribe-Links
   - Ignoriere Werbung/Banner-Texte
   - Fokus auf den Absender-Block

5. Bei Impressum/Webseite:
   - Geschäftsführer ist NICHT automatisch der richtige Ansprechpartner
   - Nur wenn explizit als "Ansprechpartner", "Kontakt", "Vertrieb" markiert
   - Sonst nur Firmendaten extrahieren

6. Confidence pro Feld (0.0-1.0):
   - 1.0: Klar erkennbar, eindeutig
   - 0.7-0.9: Wahrscheinlich, aber nicht 100%
   - 0.4-0.6: Unsicher, wurde inferiert
   - < 0.4: Sehr unsicher

7. Sprache der Quelle beibehalten (KEINE Übersetzung von Feldinhalten)

8. country_code nach ISO 3166-1 alpha-2 (DE, AT, CH, ...)` as const;

/**
 * JSON Schema für OpenAI Structured Outputs (response_format strict: true).
 * Muss exakt dem OpenAI-Format für json_schema response_format entsprechen.
 * Alle Properties sind required (OpenAI strict-Anforderung), nullable via type-Array.
 */
export const EXTRACTION_JSON_SCHEMA = {
  name: "contact_extraction",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      customer_type: {
        type: "string" as const,
        enum: ["company", "private", "publicSector"],
        description: "Art des Kontakts",
      },
      gender: {
        type: ["string", "null"] as const,
        enum: ["m", "f", "family", null],
        description: "Geschlecht (m/f/family) oder null wenn unklar",
      },
      title: {
        type: ["string", "null"] as const,
        description: "Akademischer Titel (Dr., Prof. etc.)",
      },
      firstName: {
        type: ["string", "null"] as const,
        description: "Vorname der Hauptperson (bei private) oder null (bei company ohne Kontaktperson)",
      },
      lastName: {
        type: ["string", "null"] as const,
        description: "Nachname der Hauptperson",
      },
      companyName: {
        type: ["string", "null"] as const,
        description: "Firmenname (nur bei type=company)",
      },
      email: {
        type: ["string", "null"] as const,
        description: "E-Mail-Adresse",
      },
      phone: {
        type: ["string", "null"] as const,
        description: "Festnetz-Telefonnummer im internationalen Format",
      },
      mobile: {
        type: ["string", "null"] as const,
        description: "Mobilnummer im internationalen Format (015x, 016x, 017x → +49...)",
      },
      fax: {
        type: ["string", "null"] as const,
        description: "Faxnummer",
      },
      website: {
        type: ["string", "null"] as const,
        description: "Webseiten-URL",
      },
      vatId: {
        type: ["string", "null"] as const,
        description: "Umsatzsteuer-ID (USt-IdNr.)",
      },
      address: {
        type: ["object", "null"] as const,
        description: "Adresse",
        properties: {
          street: { type: ["string", "null"] as const },
          houseNumber: { type: ["string", "null"] as const },
          zip: { type: ["string", "null"] as const },
          city: { type: ["string", "null"] as const },
          countryCode: {
            type: ["string", "null"] as const,
            description: "ISO 3166-1 alpha-2 (DE, AT, CH, ...)",
          },
        },
        required: ["street", "houseNumber", "zip", "city", "countryCode"],
        additionalProperties: false,
      },
      contactPerson: {
        type: ["object", "null"] as const,
        description: "Ansprechpartner bei Firma (nur bei type=company mit konkreter Person)",
        properties: {
          salutation: {
            type: ["string", "null"] as const,
            enum: ["m", "f", null],
          },
          firstName: { type: ["string", "null"] as const },
          lastName: { type: ["string", "null"] as const },
          title: { type: ["string", "null"] as const },
          role: {
            type: ["string", "null"] as const,
            description: "Position/Funktion (z.B. Geschäftsführer, Bauleiter)",
          },
          email: { type: ["string", "null"] as const },
          phone: { type: ["string", "null"] as const },
          mobile: { type: ["string", "null"] as const },
        },
        required: ["salutation", "firstName", "lastName", "title", "role", "email", "phone", "mobile"],
        additionalProperties: false,
      },
      notes: {
        type: ["string", "null"] as const,
        description: "Zusätzliche Informationen die in kein anderes Feld passen",
      },
      confidence: {
        type: "object" as const,
        description: "Confidence-Werte pro Feld (0.0-1.0)",
        properties: {
          overall: { type: "number" as const },
          customer_type: { type: "number" as const },
          gender: { type: "number" as const },
          firstName: { type: "number" as const },
          lastName: { type: "number" as const },
          companyName: { type: "number" as const },
          email: { type: "number" as const },
          phone: { type: "number" as const },
          mobile: { type: "number" as const },
          address: { type: "number" as const },
          contactPerson: { type: "number" as const },
        },
        required: [
          "overall", "customer_type", "gender", "firstName", "lastName",
          "companyName", "email", "phone", "mobile", "address", "contactPerson",
        ],
        additionalProperties: false,
      },
    },
    required: [
      "customer_type", "gender", "title", "firstName", "lastName",
      "companyName", "email", "phone", "mobile", "fax", "website",
      "vatId", "address", "contactPerson", "notes", "confidence",
    ],
    additionalProperties: false,
  },
} as const;
