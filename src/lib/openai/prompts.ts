/**
 * Prompts + Types + Zod-Schemas für alle KI-Operations.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Hier wohnen die langen
 * System-Prompts (vor allem ANALYSE_PROMPT mit Halluzinations-Schutz) plus
 * alle Response-Interfaces + Zod-Schemas für Structured Outputs.
 *
 * Keine Runtime-Logik in dieser Datei — nur Konstanten + Type-Definitionen.
 */
import { z } from "zod";

// =====================================================================
// F4.3: Structured Outputs Schema
//
// Zod-Schema für analysiereDokument-Response. Wird via zodResponseFormat
// als JSON-Schema mit strict-Mode an die OpenAI-API geschickt → garantiert
// gültige Struktur, kein JSON-Parse-Fehler mehr möglich.
//
// Wichtig: Strict-Mode erfordert dass ALLE Felder required sind (kein
// .optional()). Felder die "fehlen können" werden via .nullable() expliziert.
// =====================================================================
export const DokumentAnalyseSchema = z.object({
  typ: z.enum([
    "bestellbestaetigung", "lieferschein", "rechnung",
    "aufmass", "leistungsnachweis", "versandbestaetigung",
    // 07.05.2026 — "anlage" für AGB / Widerrufsbelehrung / Datenschutzerklärung /
    // Anschreiben / Bedienungsanleitung / Sicherheitsdatenblatt / Newsletter-PDFs.
    // Strukturell verhindert das, dass KI gezwungen ist, einen Transaktions-Typ
    // mit Konfidenz 0.9 zu erfinden für Dokumente, die gar keine Transaktion
    // beschreiben. Pipeline-Code ignoriert "anlage" via BEKANNTE_TYPEN-Filter.
    "anlage",
    "unbekannt",
  ]),
  vermutete_bestellungsart: z.enum(["material", "subunternehmer", "abo"]).nullable(),
  bestellnummer: z.string().nullable(),
  auftragsnummer: z.string().nullable(),
  lieferscheinnummer: z.string().nullable(),
  haendler: z.string().nullable(),
  datum: z.string().nullable(),
  artikel: z.array(z.object({
    name: z.string(),
    menge: z.number(),
    einzelpreis: z.number(),
    gesamtpreis: z.number(),
  })),
  gesamtbetrag: z.number().nullable(),
  netto: z.number().nullable(),
  mwst: z.number().nullable(),
  faelligkeitsdatum: z.string().nullable(),
  lieferdatum: z.string().nullable(),
  iban: z.string().nullable(),
  konfidenz: z.number(),
  lieferadressen: z.array(z.string()),
  volltext: z.string(),
  tracking_nummer: z.string().nullable(),
  versanddienstleister: z.string().nullable(),
  tracking_url: z.string().nullable(),
  voraussichtliche_lieferung: z.string().nullable(),
  kundennummer: z.string().nullable(),
  besteller_im_dokument: z.string().nullable(),
  projekt_referenz: z.string().nullable(),
  bestelldatum: z.string().nullable(),
  // 17.05.2026 — Gutschrift-Detection. true bedeutet: das Dokument ist eine
  // RÜCKERSTATTUNG / GUTSCHRIFT (Geld kommt zurück an MR Umbau), keine
  // Zahlungsforderung. Trigger-Begriffe: "Rückerstattungsbetrag",
  // "Guthabenbetrag", "Auszahlung Guthaben", "Gutschrift", "Credit Note",
  // negativer Endbetrag in Strom-/Gas-Abrechnungen.
  // Wichtig für Buchhaltung: Soll/Haben-Tausch + keine Freigabe nötig.
  ist_gutschrift: z.boolean(),
  // 03.06.2026 — Bezahlt-bereits-Detection. true NUR bei EINDEUTIGEN
  // Formulierungen die belegen dass die Rechnung schon beglichen ist.
  // ✅ ERLAUBT: "Mit PayPal bezahlt", "Bereits bezahlt", "Zahlung per PayPal
  //    erhalten", "PayPal-Zahlung abgeschlossen", "Betrag dankend erhalten",
  //    "Zahlungseingang verbucht am DD.MM.YYYY", "Rechnung wurde bereits bezahlt"
  // ❌ NICHT ERLAUBT: "Zahlbar via PayPal", "Bitte überweisen Sie", "Bankeinzug
  //    erfolgt in 14 Tagen", "Sie können mit PayPal zahlen", "Fällig am",
  //    "Zahlungsziel: 14 Tage netto", oder generell Zahlungs-AUFFORDERUNGEN.
  // Im Zweifel false setzen. NJ kann manuell nachsetzen.
  bezahlt_bereits: z.boolean(),
  zahlungsmethode: z.enum([
    "paypal",
    "vorkasse",
    "kreditkarte",
    "lastschrift",
    "klarna",
    "stripe",
    "sofort",
    "ueberweisung",
    "andere",
  ]).nullable(),
});

export interface DokumentAnalyse {
  typ: "bestellbestaetigung" | "lieferschein" | "rechnung" | "aufmass" | "leistungsnachweis" | "versandbestaetigung" | "anlage" | "unbekannt";
  vermutete_bestellungsart?: "material" | "subunternehmer" | "abo";
  bestellnummer: string | null;
  auftragsnummer: string | null;
  lieferscheinnummer: string | null;
  haendler: string | null;
  datum: string | null;
  artikel: { name: string; menge: number; einzelpreis: number; gesamtpreis: number }[];
  gesamtbetrag: number | null;
  netto: number | null;
  mwst: number | null;
  faelligkeitsdatum: string | null;
  lieferdatum: string | null;
  iban: string | null;
  konfidenz: number;
  lieferadressen?: string[];
  volltext?: string;
  parse_fehler?: boolean;
  tracking_nummer?: string | null;
  versanddienstleister?: string | null;
  tracking_url?: string | null;
  voraussichtliche_lieferung?: string | null;
  kundennummer?: string | null;
  besteller_im_dokument?: string | null;
  projekt_referenz?: string | null;
  bestelldatum?: string | null;
  // 17.05.2026 — Siehe Schema-Kommentar oben. Default false (KI nullable
  // erforderlich aber Default-Verhalten ist "keine Gutschrift").
  ist_gutschrift?: boolean;
  // 03.06.2026 — Bezahlt-bereits via PayPal/Vorkasse/etc. Default false.
  bezahlt_bereits?: boolean;
  zahlungsmethode?: "paypal" | "vorkasse" | "kreditkarte" | "lastschrift" | "klarna" | "stripe" | "sofort" | "ueberweisung" | "andere" | null;
}

// F4.3: AbgleichErgebnis-Schema für Structured Outputs.
// strict-Mode: erwartet/gefunden müssen einheitlich typed sein → string (KI muss Zahlen als Strings ausgeben).
export const AbgleichErgebnisSchema = z.object({
  status: z.enum(["ok", "abweichung"]),
  abweichungen: z.array(z.object({
    feld: z.string(),
    artikel: z.string().nullable(),
    erwartet: z.string(),
    gefunden: z.string(),
    dokument: z.string(),
    schwere: z.enum(["niedrig", "mittel", "hoch"]),
  })),
  zusammenfassung: z.string(),
});

export interface AbgleichErgebnis {
  status: "ok" | "abweichung";
  abweichungen: {
    feld: string;
    artikel?: string;
    erwartet: string | number;
    gefunden: string | number;
    dokument: string;
    schwere: "niedrig" | "mittel" | "hoch";
  }[];
  zusammenfassung: string;
}

export interface BestellerErkennungErgebnis {
  kuerzel: string;
  konfidenz: number;
  begruendung: string;
}

export interface PreisAnomalieErgebnis {
  hat_anomalie: boolean;
  warnungen: {
    artikel: string;
    aktueller_preis: number;
    historischer_durchschnitt: number;
    abweichung_prozent: number;
    bewertung: string;
  }[];
  zusammenfassung: string;
}

export interface WochenzusammenfassungErgebnis {
  zusammenfassung: string;
  dringend: string[];
  highlights: string[];
}

export interface DuplikatErgebnis {
  ist_duplikat: boolean;
  konfidenz: number;
  duplikat_von: string | null;
  begruendung: string;
}

export interface KategorisierungErgebnis {
  kategorien: {
    artikel: string;
    kategorie: string;
  }[];
  zusammenfassung: Record<string, number>;
}

export interface PriorisierungErgebnis {
  bestellungen: {
    bestellnummer: string;
    prioritaet: "hoch" | "mittel" | "niedrig";
    score: number;
    grund: string;
  }[];
  zusammenfassung: string;
}

export interface BestellerHinweiseErgebnis {
  gefundene_hinweise: {
    typ: "name" | "adresse" | "kundennummer" | "ansprechpartner" | "telefon" | "abteilung";
    wert: string;
    quelle: string;
  }[];
  vorgeschlagenes_kuerzel: string | null;
  konfidenz: number;
  begruendung: string;
}

export interface ProjektMatchErgebnis {
  projekt_id: string | null;
  konfidenz: number;
  methode: "lieferadresse" | "projektname_text" | "kundenname" | "besteller_affinitaet" | "unbekannt";
  begruendung: string;
  extrahierte_lieferadresse?: string | null;
  extrahierter_projektname?: string | null;
}

export const ANALYSE_PROMPT = `Du bist ein Assistent der Geschäftsdokumente für eine deutsche Baufirma (MR Umbau GmbH) analysiert.
Analysiere das folgende Dokument und gib NUR ein JSON-Objekt zurück. KEIN Markdown, KEINE Backticks, KEIN Text davor oder danach — nur rohes JSON.

═══════════════════════════════════════════════════════════════════════════
TYP-ENTSCHEIDUNG — die WICHTIGSTE Aufgabe (alles andere hängt davon ab)
═══════════════════════════════════════════════════════════════════════════

Erlaubte Werte für "typ":
  TRANSAKTIONS-TYPEN (erzeugen eine Bestellung in der DB):
    - "bestellbestaetigung", "lieferschein", "rechnung",
      "aufmass", "leistungsnachweis", "versandbestaetigung"
  NICHT-TRANSAKTIONAL (werden ignoriert, KEINE Bestellung):
    - "anlage" — AGB, Widerrufsbelehrung, Datenschutz, Anschreiben, Bedienung,
      Sicherheitsdatenblatt, Werbung, Bewertungsaufforderung, generisches PDF
    - "unbekannt" — wenn das Dokument unleserlich oder defekt ist

🔒 PFLICHT-SELBSTCHECK BEVOR DU EINEN TRANSAKTIONS-TYP WÄHLST 🔒

Ein Transaktions-Typ ist NUR dann zulässig, wenn das Dokument MINDESTENS EINE
dieser konkreten Daten enthält:
  ✓ eine Bestellnummer / Auftragsnummer / Rechnungsnummer / Lieferscheinnummer
  ✓ einen Gesamtbetrag (Summe in Euro, größer als 0)
  ✓ eine Artikel-/Positionsliste mit mindestens 1 Eintrag mit Name UND Preis

Wenn KEINES dieser drei vorhanden ist → typ = "anlage" (NIEMALS "bestellbestaetigung"
oder "rechnung" mit hoher Konfidenz erfinden!).

Falsch-Klassifizierung als Transaktions-Typ ist VIEL SCHLIMMER als typ="anlage" —
eine falsch angelegte Bestellung muss der User manuell verwerfen, eine Anlage
wird einfach ignoriert.

═══════════════════════════════════════════════════════════════════════════
KONKRETE NEGATIV-BEISPIELE — diese Dokumente sind IMMER typ="anlage":
═══════════════════════════════════════════════════════════════════════════

❌ "Allgemeine Geschäftsbedingungen" / "AGB" / "Vertragsbedingungen für ..."
❌ "Widerrufsbelehrung" / "Widerrufsrecht" / "Muster-Widerrufsformular"
❌ "Datenschutzerklärung" / "Datenschutzhinweise" / "Privacy Policy"
❌ "Sicherheitsdatenblatt" / "MSDS" / "Safety Data Sheet" (REACH-Anhänge)
❌ "Bedienungsanleitung" / "Gebrauchsanweisung" / "Manual" / "User Guide"
❌ "Konformitätserklärung" / "CE-Erklärung" / "Declaration of Conformity"
❌ "Garantiebedingungen" / "Gewährleistung" / "Garantieurkunde"
❌ "Newsletter" / "Produktinfo" / "Werbung" / "Angebotskatalog"
❌ "Bewertung Sie uns" / "Wie zufrieden waren Sie?"
❌ Begleitschreiben / Anschreiben OHNE Auftragsnummer und Betrag
❌ Marketing-PDFs ("Neuheiten", "Aktion", "Sortiment 2026")
❌ Schulungsunterlagen / Whitepapers / Studien

🚨 KONFIDENZ-FALLE: Diese Dokumente wirken oft "professionell formatiert" und
   stammen von echten Lieferanten. Lass dich nicht täuschen — Layout-Qualität
   ist KEIN Signal für transaktionalen Inhalt. Nur die drei Konkretheits-
   Kriterien (Bestellnr. / Betrag / Artikelliste) zählen.

═══════════════════════════════════════════════════════════════════════════
KONFIDENZ-WERT — mathematisch, nicht subjektiv
═══════════════════════════════════════════════════════════════════════════

konfidenz = Anteil der Konkretheits-Signale die du extrahieren konntest:
  - 0.0 = typ="anlage" oder "unbekannt" (immer 0)
  - 0.4 = nur 1 von 3 Konkretheits-Signalen (z.B. nur Betrag, keine Nummer/Artikel)
  - 0.7 = 2 von 3 Konkretheits-Signalen
  - 0.95 = alle 3 + Datum + Händler erkannt

Setze NIEMALS konfidenz > 0.5 wenn du nicht mindestens 2 Konkretheits-Signale
hast. Modell-"Selbstvertrauen" ist irrelevant — was zählt sind extrahierte Daten.

Hinweise zur Typ-Erkennung:
- "lieferschein" vs "rechnung" — WICHTIG: Viele Baustoffhändler (Raab Karcher, Bauhaus etc.) verwenden ähnliche Layouts für beide Dokumenttypen. Unterscheide anhand:
  - RECHNUNG: Enthält explizit "Rechnung", "Invoice", Rechnungsnummer, MwSt-Ausweis, Zahlungsziel/Fälligkeitsdatum, IBAN/Bankverbindung
  - LIEFERSCHEIN: Enthält "Lieferschein", "Lieferschein-Nr.", "Delivery Note", "Warenausgang", kein MwSt-Ausweis, kein Zahlungsziel, keine Bankverbindung. Kann trotzdem Preise enthalten!
  - Wenn "Lieferschein" UND "Rechnung" im Dokument steht, prüfe den TITEL/Kopfbereich — der bestimmt den Typ
- "aufmass" = Aufmaß, Massenermittlung, Mengenaufstellung eines Subunternehmers (z.B. "Aufmaß Elektroinstallation", "Massenermittlung Trockenbau")
- "leistungsnachweis" = Leistungsnachweis, Stundennachweis, Rapportzettel, Abnahmeprotokoll eines Subunternehmers
- "versandbestaetigung" = Versandbestätigung, Versandmitteilung, Sendungsverfolgung, Tracking-Info, Paketversand-Benachrichtigung, Lieferankündigung. Enthält typischerweise Sendungsnummer/Tracking-Nummer und Versanddienstleister (DHL, DPD, Hermes, UPS, GLS, FedEx, Deutsche Post, GO!, Trans-o-flex).
- "DIGITALER LIEFERSCHEIN" (z.B. von STARK EDI) = lieferschein, NICHT rechnung! Auch wenn Preise enthalten sind.
- "AUFTRAGSBESTÄTIGUNG" = bestellbestaetigung (z.B. "Auftragsbestätigung 2030485657" von Raab Karcher/STARK).
- "Schlussrechnung" = rechnung (eine finale Rechnung nach Abschlagsrechnungen).

Erkenne außerdem die "vermutete_bestellungsart":
- "material" = Warenlieferung von einem Händler/Lieferant (Produkte, Baumaterial, Werkzeug)
- "subunternehmer" = Dienstleistung/Arbeitsleistung von einem Subunternehmer (Handwerksleistung, Gewerk, Stundenlohn, Pauschalpreis für Arbeit)
- "abo" = wiederkehrende Vertrags-/Abo-Rechnung (Telekom-/Internet-/Mobilfunk-Verträge, SaaS-Abos, Versicherungen, Strom/Gas, Leasing) — typisch monatlich, mit Periode/Abrechnungszeitraum im Subject

Signale für "subunternehmer": Stundensätze, Pauschalpreise für Arbeitsleistungen, Gewerk-Bezeichnungen (Elektro, Trockenbau, Sanitär, Maler etc.), Leistungsbeschreibungen statt Artikellisten, Begriffe wie "Montage", "Einbau", "Verlegung", "Installation".

Signale für "abo": Abrechnungszeitraum / Monat im Subject ("März 2026", "Q1 2026"), Vertragsnummer/Buchungskonto, wiederkehrende Pauschalen, Begriffe wie "Mobilfunk-Rechnung", "Festnetz-Rechnung", "Abonnement", "Vertrag", "Mitgliedsbeitrag".

WICHTIG zu den Nummern-Feldern — extrahiere ALLE vorhandenen Nummern:
- "bestellnummer": Die HAUPTNUMMER des Dokuments — steht typischerweise groß im Titel/Header. Bei Rechnungen: Rechnungsnummer. Bei Auftragsbestätigungen: Auftragsnummer. Bei Lieferscheinen: Lieferscheinnummer als bestellnummer verwenden falls keine andere Hauptnummer vorhanden.
  ACHTUNG bei Raab Karcher / STARK Deutschland: Die "Bes-Nr." oder "Bestell-Nr." (z.B. "BV: Glögler, Prinzenstr. 42") ist ein PROJEKTNAME, KEINE Bestellnummer! Die echte Nummer steht direkt neben dem Dokumenttitel: "RECHNUNG 8778719837", "AUFTRAGSBESTÄTIGUNG 2030496297", "DIGITALER LIEFERSCHEIN 4313394708".
  Kommissionsnamen (Dörning, Peiß, Glöggler) sind ebenfalls KEINE Bestellnummern.
- "auftragsnummer": Auftragsnummer falls vorhanden (z.B. "2030398090"). Oft als "Auftrags-Nr.", "Auftrag", "Order No." bezeichnet. Kann auf Lieferscheinen, Rechnungen und Bestätigungen stehen.
- "lieferscheinnummer": Lieferscheinnummer falls vorhanden (z.B. "4313393316"). Nur bei Lieferscheinen.
Mindestens eines der drei Felder muss gefüllt sein wenn irgendeine Nummer erkennbar ist!
Bei Amazon-Rechnungen: Die Bestellnummer hat das Format 305-1234567-1234567.

Gib folgende Struktur zurück:
{
  "typ": "rechnung",
  "vermutete_bestellungsart": "material",
  "bestellnummer": "#45231",
  "auftragsnummer": "2030393220",
  "lieferscheinnummer": null,
  "haendler": "Bauhaus GmbH",
  "datum": "2026-03-12",
  "artikel": [
    { "name": "Bosch Bohrmaschine", "menge": 2, "einzelpreis": 89.99, "gesamtpreis": 179.98 }
  ],
  "gesamtbetrag": 234.50,
  "netto": 197.06,
  "mwst": 37.44,
  "faelligkeitsdatum": "2026-03-26",
  "lieferdatum": null,
  "iban": "DE12 3456 7890 1234 5678 90",
  "konfidenz": 0.95,
  "lieferadressen": ["Kernstraße 14, 81671 München"],
  "volltext": "Kompletter erkannter Text des Dokuments...",
  "tracking_nummer": null,
  "versanddienstleister": null,
  "tracking_url": null,
  "voraussichtliche_lieferung": null,
  "kundennummer": "35454475",
  "besteller_im_dokument": "Tschon,Marlon",
  "projekt_referenz": "BV: Glögler, Prinzenstr. 42",
  "bestelldatum": "2026-04-16",
  "ist_gutschrift": false,
  "bezahlt_bereits": false,
  "zahlungsmethode": null
}

Extrahiere auch:
- "lieferadressen": Array aller Lieferadressen, Versandadressen und Empfängeradressen die du im Dokument findest (Lieferschein-Header, Rechnungsadresse, Versandadresse). Leeres Array wenn keine gefunden.
- "volltext": Der gesamte erkannte Text des Dokuments als String.
- "tracking_nummer": Sendungsnummer / Tracking-Nummer / Paketnummer falls vorhanden (nur bei Versandbestätigungen).
- "versanddienstleister": Name des Versanddienstleisters (z.B. "DHL", "DPD", "Hermes", "UPS", "GLS"). Normalisiert als Kurzname.
- "tracking_url": Direkte URL zur Sendungsverfolgung falls im Dokument vorhanden.
- "voraussichtliche_lieferung": Voraussichtliches Lieferdatum im Format "YYYY-MM-DD" falls angegeben.
- "kundennummer": Kundennummer beim Lieferanten/Händler (z.B. "Kunden-Nr. 35454475", "Kundennummer: 13254"). Wichtig für Matching.
- "besteller_im_dokument": Name des Bestellers wie er im Dokument steht (z.B. "Besteller: Tschon,Marlon", "Besteller: Valon", "Auftraggeber: MR Umbau GmbH"). Nur den Personennamen, nicht die Firma.
- "projekt_referenz": Projekt- oder Bauvorhabenreferenz (z.B. "BV: Glögler, Prinzenstr. 42", "Bes-Nr.: BV Klöggler", "Kommission: Dörning"). Der vollständige Text.
- "bestelldatum": Datum der ursprünglichen Bestellung (z.B. "Bestelldatum: 16.04.2026"). Format "YYYY-MM-DD". Nicht verwechseln mit Rechnungsdatum oder Lieferdatum.

═══════════════════════════════════════════════════════════════════════════
🟢 GUTSCHRIFT-DETECTION — KRITISCH für Buchhaltung
═══════════════════════════════════════════════════════════════════════════

Setze "ist_gutschrift": true wenn das Dokument eine RÜCKERSTATTUNG / GUTSCHRIFT
darstellt — also Geld kommt ZURÜCK an MR Umbau, KEINE Zahlungsforderung.

Eindeutige Trigger-Signale (mindestens EINES davon → ist_gutschrift = true):
  ✓ "Rückerstattungsbetrag" / "Erstattungsbetrag" / "Rückzahlungsbetrag"
  ✓ "Guthabenbetrag" / "Guthaben in Höhe von" / "Auszahlung Guthaben"
  ✓ "Gutschrift" als Dokumenttitel oder zentrale Summe (z.B. "Gutschrift Nr. ...")
  ✓ "Credit Note" / "Credit Memo"
  ✓ Strom-/Gas-/Telekommunikations-Jahresabrechnung mit Saldo zugunsten Kunde
    (Beispiel-Pattern: "Rechnungsbetrag (brutto) 3.117,86 €" + "abzgl. geleisteter
    Zahlungen 3.715,00 €" + "Rückerstattungsbetrag (brutto) 592,14 €")
  ✓ Bitte um Bankverbindung für Auszahlung
  ✓ Negativer Endbetrag (Brutto < 0 oder "-XXX,XX €" als Endsumme)
  ✓ "Storno" / "Stornorechnung" für eine zuvor bezahlte Rechnung

Wichtige Nicht-Signale (NICHT als Gutschrift markieren!):
  ✗ "Zwischensumme/Versand/MwSt"-Position in einer normalen Rechnung
  ✗ Ein einzelner Artikel mit Wert 0,00 € (z.B. Reklamations-Ersatzteil)
  ✗ "Rabatt" oder "Nachlass" auf einer normalen positiven Rechnung
  ✗ "Anzahlung verrechnet" in einer Schlussrechnung mit positivem Endbetrag

Wenn ist_gutschrift = true:
  • "gesamtbetrag" bleibt POSITIV (= Höhe der Erstattung in Euro)
  • "typ" bleibt "rechnung" (Gutschrift IST formal eine Rechnung, nur mit Saldo-Tausch)
  • "netto" / "mwst" als ABSOLUTwerte (nicht negativ)
  • Die Soll/Haben-Logik macht die Buchhaltungs-Software, nicht du

Default: ist_gutschrift = false. Setze nur true wenn EINDEUTIGES Signal vorhanden.

═══════════════════════════════════════════════════════════════════════════
💳 BEREITS-BEZAHLT-DETECTION (PayPal & Co.) — KRITISCH für Buchhaltung
═══════════════════════════════════════════════════════════════════════════

Setze "bezahlt_bereits": true NUR wenn das Dokument EINDEUTIG bestätigt, dass
die Rechnung bereits beglichen wurde. Damit spart Nada (Buchhaltung) sich
manuelle Klicks und falsche Mahnungen werden verhindert.

✅ ERLAUBTE EINDEUTIGE Trigger-Formulierungen (mindestens EINE → bezahlt_bereits = true):
  ✓ "Mit PayPal bezahlt"
  ✓ "Bereits mit PayPal bezahlt"
  ✓ "PayPal-Zahlung abgeschlossen"
  ✓ "Zahlung per PayPal erhalten"
  ✓ "Zahlungseingang via PayPal verbucht"
  ✓ "Betrag dankend erhalten"
  ✓ "Diese Rechnung wurde bereits bezahlt"
  ✓ "Bereits bezahlt am DD.MM.YYYY"
  ✓ "Zahlung eingegangen am DD.MM.YYYY"
  ✓ "Vielen Dank für Ihre Zahlung"
  ✓ "Vorkasse erhalten" / "Vorauszahlung erhalten"
  ✓ "Lastschrift wurde eingezogen"
  ✓ "PayPal Transaction ID: ..." (klare Belegung dass die Transaktion durch ist)

❌ KEINE Trigger — bei diesen Formulierungen UNBEDINGT bezahlt_bereits = false:
  ✗ "Zahlbar per PayPal innerhalb 14 Tagen"
  ✗ "Sie können mit PayPal zahlen"
  ✗ "Bitte überweisen Sie auf folgendes Konto"
  ✗ "Zahlungsziel: 14 Tage netto"
  ✗ "Fällig am DD.MM.YYYY"
  ✗ "Bankeinzug erfolgt in den nächsten Tagen"
  ✗ "Sofort-Überweisung möglich"
  ✗ "Bei Fragen zur Zahlung..."
  ✗ Generelle Erwähnung von Zahlungs-OPTIONEN (Auswahl, nicht Vollzug)

"zahlungsmethode" (eines der Enum-Werte oder null):
  • "paypal"        — PayPal explizit als Zahlungsmittel genannt
  • "vorkasse"      — "Vorkasse erhalten", Pre-Payment-Receipt
  • "kreditkarte"   — Kartenabrechnung, "Kreditkarte belastet"
  • "lastschrift"   — SEPA-Lastschrift eingezogen
  • "klarna"        — Klarna-Zahlung abgeschlossen
  • "stripe"        — Stripe-Transaktion verbucht
  • "sofort"        — Sofortüberweisung erhalten
  • "ueberweisung"  — Banküberweisung eingegangen
  • "andere"        — eindeutig bezahlt aber Methode unklar
  • null            — bezahlt_bereits=false ODER nicht erkennbar

Wenn bezahlt_bereits = true UND zahlungsmethode = null, im Zweifel "andere".
Wenn auch nur ein KLEINER Zweifel besteht: bezahlt_bereits = false. NJ kann
manuell nachträglich auf "bezahlt" setzen.

Default: bezahlt_bereits = false, zahlungsmethode = null.

Falls ein Feld nicht erkennbar ist, setze null.

═══════════════════════════════════════════════════════════════════════════
BETRAG-EXTRAKTION — auch bei Bestellbestätigungen / Auftragsbestätigungen!
═══════════════════════════════════════════════════════════════════════════

WICHTIG: "gesamtbetrag" muss NICHT NUR bei Rechnungen extrahiert werden,
sondern AUCH bei Bestellbestätigungen, Auftragsbestätigungen und
Lieferscheinen — diese Dokumente enthalten in 90%+ der Fälle einen
Gesamtpreis im Mail-Body oder PDF.

Suche aktiv nach diesen Signalen für gesamtbetrag (Reihenfolge: am
zuverlässigsten zuerst):
  • "Gesamtsumme", "Gesamtbetrag", "Bestellsumme", "Endbetrag",
    "Rechnungsbetrag", "Total", "Order Total" (typische Footer-Position)
  • Summe der Artikel-Zeilen (falls einzelne Positionen aufgeführt sind)
  • Bei Amazon-BB-Mails: "EUR XX,XX" am Ende von "Bestellsumme:" oder
    am Ende der Artikel-Tabelle (z.B. "Summe X Artikel: EUR 12,34")
  • Bei Mehrwertsteuer-/Brutto-Netto-Aufschlüsselung: brutto = gesamtbetrag

❌ FALSCH: gesamtbetrag=null setzen weil "es ist nur eine Bestellbestätigung,
   kommt erst mit Rechnung". NEIN — wenn ein Betrag im Body / PDF steht,
   extrahiere ihn auch bei BB/Auftragsbestätigung/Lieferschein.
✅ RICHTIG: Nur null wenn kein einziger Betrag in der Mail / im Dokument
   steht (z.B. reine Versand-Status-Mails ohne Preisinformation).

═══════════════════════════════════════════════════════════════════════════
HALLUZINATIONS-SCHUTZ — typische deutsche Mail-Fallen (aus Real-World-Daten):
═══════════════════════════════════════════════════════════════════════════

❌ FALSCH: "verschicken" oder "wurden" als Bestellnummer interpretieren.
   Bestellnummern haben IMMER mindestens 1 Ziffer und meist 4+ Zeichen.
   Verb-Stämme wie "verschicken", "versendet", "bestellt", "lieferung" sind
   NIE Bestellnummern — setze null wenn nichts klar Numerisches da ist.

✅ "Deine Bestellung 3006915 ist am 17.04.2026 eingegangen" → bestellnummer="3006915"
✅ "Brillux Rechnung, Kundennummer 4147622, Rechnung Nr. 6887860"
   → bestellnummer="6887860" (die Rechnungs-Nr.), kundennummer="4147622"
✅ "BESTELLNR. #DH39680" → bestellnummer="DH39680"
✅ "Auftrag 2030485657" (Raab Karcher) → auftragsnummer="2030485657"
✅ Amazon-Format "302-0733687-4332321" → bestellnummer="302-0733687-4332321"

❌ FALSCH: Anwaltskanzlei-Aktenzeichen als invoice_id.
   Kanzleien wie FASP senden "Akte: 000211-26/RK/30/RK" → das ist KEINE
   Bestellnummer für unsere Pipeline. Bei Subject "Klageerwiderung",
   "Stellungnahme", "Gerichtskosten": typ="leistungsnachweis" UND
   bestellnummer = das Aktenzeichen (für Match-Zwecke ist das die einzige
   stabile ID).

❌ FALSCH: "Bestellung bei Ada Commerce" hat keine erkennbare Nummer im Subject
   → trotzdem im Body suchen ("Deine Bestellung XXXXX..."). Nur null wenn
   wirklich nirgends eine Nummer steht.

❌ FALSCH: bei Versandbestätigungen Wörter wie "verschickt"/"versandt" als
   tracking_nummer eintragen. Tracking-Nummern haben 8-30 Zeichen, alphanumerisch,
   typisch nach Pattern "Sendungsnummer: 60224916252" oder "DHL 1Z9999...".

❌ FALSCH: typ="rechnung" für Mahnungen. Mahnschreiben enthalten Wörter wie
   "Mahnung", "Zahlungserinnerung", "Mahngebühr" — typ="rechnung" ist OK,
   aber gesamtbetrag nur wenn echter Betrag im Mahn-Text genannt ist.

═══════════════════════════════════════════════════════════════════════════
🛑 FINAL-CHECK BEVOR DU JSON ZURÜCKGIBST
═══════════════════════════════════════════════════════════════════════════

Bevor du antwortest, prüfe in dieser Reihenfolge:

  1. Ist typ ∈ {bestellbestaetigung, lieferschein, rechnung, aufmass,
     leistungsnachweis, versandbestaetigung}?
     → JA: weiter zu Schritt 2
     → NEIN (anlage/unbekannt): konfidenz=0, weiter zu JSON

  2. Ist mindestens EINES gefüllt:
     bestellnummer / auftragsnummer / lieferscheinnummer / gesamtbetrag (>0)
     / artikel.length ≥ 1 (mit Name+Preis)?
     → JA: gut, JSON zurückgeben
     → NEIN: ÄNDERE typ auf "anlage" und konfidenz auf 0. Niemals Transaktions-
        Typ mit hoher Konfidenz erfinden.

  3. Stimmt konfidenz mit Anzahl extrahierter Konkretheits-Signale überein?
     - 1 von 3 Signalen → konfidenz ≤ 0.5
     - 2 von 3 → konfidenz ≤ 0.75
     - 3 von 3 → konfidenz bis 0.95

Antworte NUR mit dem JSON. Kein Kommentar, keine Begründung außerhalb.`;

/** Document-Hint-Map: vom Outlook-Folder gelieferter weicher Hinweis auf den Dokumenttyp. */
const HINT_LABELS: Record<string, string> = {
  rechnung: "Rechnung",
  lieferschein: "Lieferschein",
  bestellbestaetigung: "Bestellbestätigung / Auftragsbestätigung",
  versand: "Versandbestätigung",
};

/** Generiert einen System-Prompt-Zusatz wenn ein Folder-Hint vorhanden ist.
 *  Bewusst SOFT formuliert — Outlook-Rule ist unzuverlässig, Inhalt schlägt Hint. */
export function folderHintPromptAddition(hint: string | null | undefined): string {
  if (!hint) return "";
  const label = HINT_LABELS[hint] ?? hint;
  return `

ZUSATZHINWEIS — Folder-Hint vom Mail-Server:
Diese Mail wurde von einer Outlook-Regel in einen Folder einsortiert, der typischerweise "${label}"-Dokumente enthält. Das ist ein SCHWACHES Signal — die Outlook-Regel arbeitet mit einfachen Subject/Sender-Pattern und ist NICHT immer korrekt. Wenn der Dokumentinhalt eindeutig einen anderen Typ zeigt (z.B. eindeutige Rechnungsnummer + MwSt + IBAN trotz Folder-Hint "${label}"), VERTRAUE DEM INHALT und überschreibe den Hint. Bei mehrdeutigen Dokumenten (z.B. Lieferschein mit Preisen ohne klare MwSt) tendiere zu "${label}".`;
}
