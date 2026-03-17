import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Retry-Wrapper mit exponential backoff für OpenAI-Calls */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("timeout") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("500") ||
          err.message.includes("503"));

      if (!isRetryable || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Max retries reached");
}

export interface DokumentAnalyse {
  typ: "bestellbestaetigung" | "lieferschein" | "rechnung";
  bestellnummer: string | null;
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
}

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

const ANALYSE_PROMPT = `Du bist ein Assistent der Geschäftsdokumente für eine deutsche Baufirma analysiert.
Analysiere das folgende Dokument und gib NUR ein JSON-Objekt zurück, kein Text davor oder danach.

Erkenne den Dokumenttyp: bestellbestaetigung, lieferschein, oder rechnung.

Gib folgende Struktur zurück:
{
  "typ": "rechnung",
  "bestellnummer": "#45231",
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
  "konfidenz": 0.95
}

Falls ein Feld nicht erkennbar ist, setze null.`;

// PDF/Bild analysieren mit GPT-4o
export async function analysiereDokument(
  base64: string,
  mimeType: string
): Promise<DokumentAnalyse> {
  // PDFs werden als file-Content gesendet, Bilder als image_url
  const isPdf = mimeType === "application/pdf";

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = isPdf
    ? [
        {
          type: "file",
          file: {
            filename: "dokument.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
        } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart,
      ]
    : [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
      ];

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: ANALYSE_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// KI-Abgleich zwischen den 3 Dokumenten
export async function fuehreAbgleichDurch(
  bestellbestaetigung: DokumentAnalyse | null,
  lieferschein: DokumentAnalyse | null,
  rechnung: DokumentAnalyse | null
): Promise<AbgleichErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Du bist ein Prüfassistent für eine deutsche Baufirma.
Vergleiche die folgenden Dokumente einer Bestellung und prüfe ob alles übereinstimmt.

Gib NUR ein JSON-Objekt zurück:
{
  "status": "ok" | "abweichung",
  "abweichungen": [
    {
      "feld": "menge",
      "artikel": "Bosch Bohrmaschine",
      "erwartet": 2,
      "gefunden": 1,
      "dokument": "lieferschein",
      "schwere": "hoch"
    }
  ],
  "zusammenfassung": "Alles stimmt überein." | "Abweichung gefunden: ..."
}`,
        },
        {
          role: "user",
          content: `Bestellbestätigung: ${JSON.stringify(bestellbestaetigung)}
Lieferschein: ${JSON.stringify(lieferschein)}
Rechnung: ${JSON.stringify(rechnung)}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// ========== NEUE KI-FUNKTIONEN ==========

// 1. Intelligente Besteller-Erkennung anhand historischer Bestellmuster
export async function erkenneBestellerIntelligent(
  artikelAusEmail: { name: string; menge: number; einzelpreis: number }[],
  haendlerName: string,
  bestellerHistorie: { kuerzel: string; name: string; artikel_namen: string[]; haendler: string[] }[]
): Promise<BestellerErkennungErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Zuordnungsassistent für eine deutsche Baufirma.
Anhand der Artikel in einer neuen Bestellung und der Bestellhistorie der Mitarbeiter sollst du erkennen, wer wahrscheinlich bestellt hat.

Gib NUR ein JSON-Objekt zurück:
{
  "kuerzel": "MT",
  "konfidenz": 0.85,
  "begruendung": "Marlon bestellt regelmäßig Bosch-Werkzeug bei Bauhaus"
}

Falls du dir sehr unsicher bist (konfidenz < 0.4), setze kuerzel auf "UNBEKANNT".`,
      },
      {
        role: "user",
        content: `Neue Bestellung bei ${haendlerName}:
Artikel: ${JSON.stringify(artikelAusEmail)}

Bestellhistorie der Mitarbeiter:
${bestellerHistorie.map((b) => `${b.kuerzel} (${b.name}): Bestellt oft: ${b.artikel_namen.slice(0, 15).join(", ")} | Händler: ${b.haendler.join(", ")}`).join("\n")}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.1,
  })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 2. Lieferschein-Erinnerung generieren
export async function generiereErinnerungsmail(
  bestellungen: { bestellnummer: string; haendler: string; besteller: string; tage_alt: number; betrag: number }[]
): Promise<string> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein freundlicher Assistent der kurze, professionelle Erinnerungsmails auf Deutsch schreibt.
Schreibe eine kurze E-Mail an den Besteller mit der Aufforderung den fehlenden Lieferschein einzuscannen.
Tonfall: freundlich, direkt, kurz. Keine Anrede mit "Sehr geehrter". Duzen ist OK.
Format: Nur den E-Mail-Body, kein Betreff.`,
      },
      {
        role: "user",
        content: `Folgende Bestellungen haben seit mehreren Tagen keinen Lieferschein:
${bestellungen.map((b) => `- ${b.bestellnummer} bei ${b.haendler} (${b.tage_alt} Tage, ${b.betrag}€)`).join("\n")}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.5,
  }));

  return response.choices[0]?.message?.content || "";
}

// 3. Anomalie-Erkennung bei Preisen
export async function pruefePreisanomalien(
  aktuelleArtikel: { name: string; einzelpreis: number; menge: number }[],
  historischePreise: { name: string; preise: number[] }[]
): Promise<PreisAnomalieErgebnis> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Preisüberwachungsassistent für eine deutsche Baufirma.
Vergleiche aktuelle Artikelpreise mit historischen Durchschnittspreisen.
Melde Abweichungen über 30% als Warnung.

Gib NUR ein JSON-Objekt zurück:
{
  "hat_anomalie": true,
  "warnungen": [
    {
      "artikel": "Bosch Bohrmaschine",
      "aktueller_preis": 890.00,
      "historischer_durchschnitt": 149.99,
      "abweichung_prozent": 493,
      "bewertung": "Preis fast 5x höher als üblich – bitte prüfen!"
    }
  ],
  "zusammenfassung": "1 Preiswarnung: Bosch Bohrmaschine deutlich teurer als üblich."
}

Falls alles normal ist: hat_anomalie false, warnungen leer.`,
      },
      {
        role: "user",
        content: `Aktuelle Rechnung/Bestellung:
${JSON.stringify(aktuelleArtikel)}

Historische Preise (letzte Einkäufe):
${historischePreise.map((h) => `${h.name}: ${h.preise.map((p) => p.toFixed(2) + "€").join(", ")}`).join("\n") || "Keine historischen Daten vorhanden."}`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  }));

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 4. Automatische Händler-Erkennung aus E-Mail
export async function erkenneHaendlerAusEmail(
  emailAbsender: string,
  emailBetreff: string,
  erkannterHaendlerName: string | null
): Promise<{ name: string; domain: string; email_muster: string } | null> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Assistent der Händler/Lieferanten anhand von E-Mail-Daten erkennt.
Extrahiere den Firmennamen, die Domain und das E-Mail-Muster.

Gib NUR ein JSON-Objekt zurück:
{
  "name": "Bauhaus",
  "domain": "bauhaus.de",
  "email_muster": "noreply@bauhaus.de"
}

Falls du den Händler nicht erkennen kannst, gib null zurück.`,
      },
      {
        role: "user",
        content: `E-Mail-Absender: ${emailAbsender}
Betreff: ${emailBetreff}
Erkannter Händlername aus Dokument: ${erkannterHaendlerName || "nicht erkannt"}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.1,
  }));

  const text = response.choices[0]?.message?.content || "null";
  if (text.trim() === "null") return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// 5. Wochen-/Dashboard-Zusammenfassung
export async function generiereWochenzusammenfassung(
  stats: {
    gesamt: number;
    offen: number;
    abweichungen: number;
    ls_fehlt: number;
    freigegeben: number;
    vollstaendig: number;
    erwartet: number;
    freigegebenes_volumen: number;
    ueberfaellige_rechnungen: { bestellnummer: string; haendler: string; faellig: string; betrag: number }[];
    abweichende_bestellungen: { bestellnummer: string; haendler: string; problem: string }[];
  }
): Promise<WochenzusammenfassungErgebnis> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Management-Assistent für eine deutsche Baufirma.
Erstelle eine kurze, prägnante Zusammenfassung der aktuellen Bestellsituation.
Schreibe auf Deutsch, maximal 3-4 Sätze für die Zusammenfassung.
Markiere dringende Punkte klar.

Gib NUR ein JSON-Objekt zurück:
{
  "zusammenfassung": "Aktuell 15 Bestellungen, davon 3 offen. 2 Abweichungen müssen geprüft werden. Freigegebenes Volumen: 12.500€.",
  "dringend": ["Würth #91023 ist überfällig (seit 3 Tagen)", "Bauhaus #45231: Mengenabweichung bei Dübeln"],
  "highlights": ["5 Rechnungen diese Woche freigegeben", "Keine neuen Abweichungen seit Dienstag"]
}`,
      },
      {
        role: "user",
        content: `Aktuelle Statistiken:
- Gesamt: ${stats.gesamt} Bestellungen
- Offen: ${stats.offen}
- Abweichungen: ${stats.abweichungen}
- LS fehlt: ${stats.ls_fehlt}
- Freigegeben: ${stats.freigegeben}
- Vollständig (bereit zur Freigabe): ${stats.vollstaendig}
- Erwartet: ${stats.erwartet}
- Freigegebenes Volumen: ${stats.freigegebenes_volumen.toFixed(2)}€

Überfällige Rechnungen:
${stats.ueberfaellige_rechnungen.length > 0
  ? stats.ueberfaellige_rechnungen.map((r) => `- ${r.bestellnummer} (${r.haendler}): Fällig ${r.faellig}, ${r.betrag}€`).join("\n")
  : "Keine"}

Abweichende Bestellungen:
${stats.abweichende_bestellungen.length > 0
  ? stats.abweichende_bestellungen.map((a) => `- ${a.bestellnummer} (${a.haendler}): ${a.problem}`).join("\n")
  : "Keine"}`,
      },
    ],
    max_tokens: 800,
    temperature: 0.3,
  }));

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 6. Duplikat-Erkennung
export interface DuplikatErgebnis {
  ist_duplikat: boolean;
  konfidenz: number;
  duplikat_von: string | null;
  begruendung: string;
}

export async function pruefeDuplikat(
  neueBestellung: { haendler: string; betrag: number | null; artikel: { name: string; menge: number; einzelpreis: number }[] },
  existierendeBestellungen: { bestellnummer: string; haendler: string; betrag: number | null; artikel: { name: string; menge: number; einzelpreis: number }[]; datum: string }[]
): Promise<DuplikatErgebnis> {
  if (existierendeBestellungen.length === 0) {
    return { ist_duplikat: false, konfidenz: 1, duplikat_von: null, begruendung: "Keine vergleichbaren Bestellungen vorhanden." };
  }

  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Duplikat-Erkennungsassistent für eine deutsche Baufirma.
Prüfe ob die neue Bestellung ein Duplikat einer existierenden Bestellung ist.
Eine Bestellung ist ein Duplikat wenn: gleicher Händler, sehr ähnliche/identische Artikel, ähnlicher Betrag.
Leichte Preisunterschiede (z.B. durch MwSt-Rundung) sind KEIN Duplikat.

Gib NUR ein JSON-Objekt zurück:
{
  "ist_duplikat": true,
  "konfidenz": 0.95,
  "duplikat_von": "#45231",
  "begruendung": "Identische Artikel und Betrag wie Bestellung #45231 vom 12.03."
}

Falls kein Duplikat: ist_duplikat false, duplikat_von null.`,
      },
      {
        role: "user",
        content: `Neue Bestellung:
Händler: ${neueBestellung.haendler}
Betrag: ${neueBestellung.betrag ?? "unbekannt"}€
Artikel: ${JSON.stringify(neueBestellung.artikel)}

Existierende Bestellungen (letzte 7 Tage, gleicher Händler):
${existierendeBestellungen.map((b) => `- ${b.bestellnummer} (${b.datum}): ${b.betrag}€, Artikel: ${JSON.stringify(b.artikel)}`).join("\n")}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.1,
  }));

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 7. Automatische Artikel-Kategorisierung
export interface KategorisierungErgebnis {
  kategorien: {
    artikel: string;
    kategorie: string;
  }[];
  zusammenfassung: Record<string, number>;
}

export async function kategorisiereArtikel(
  artikel: { name: string; menge: number; einzelpreis: number }[]
): Promise<KategorisierungErgebnis> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Kategorisierungsassistent für eine deutsche Baufirma.
Ordne jeden Artikel einer passenden Kategorie zu.

Verwende NUR diese Kategorien:
- Werkzeug
- Baumaterial
- Befestigungstechnik
- Verbrauchsmaterial
- Elektro
- Sanitär
- Arbeitsschutz
- Sonstiges

Gib NUR ein JSON-Objekt zurück:
{
  "kategorien": [
    { "artikel": "Bosch Bohrmaschine", "kategorie": "Werkzeug" },
    { "artikel": "Fischer Dübel 8mm 100St", "kategorie": "Befestigungstechnik" }
  ],
  "zusammenfassung": { "Werkzeug": 1, "Befestigungstechnik": 1 }
}`,
      },
      {
        role: "user",
        content: `Artikel:\n${artikel.map((a) => `- ${a.name} (${a.menge}x, ${a.einzelpreis}€)`).join("\n")}`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  }));

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 8. Fälligkeits-Priorisierung
export interface PriorisierungErgebnis {
  bestellungen: {
    bestellnummer: string;
    prioritaet: "hoch" | "mittel" | "niedrig";
    score: number;
    grund: string;
  }[];
  zusammenfassung: string;
}

export async function priorisiereBestellungen(
  bestellungen: {
    bestellnummer: string;
    haendler: string;
    status: string;
    betrag: number | null;
    tage_alt: number;
    hat_rechnung: boolean;
    hat_lieferschein: boolean;
    faelligkeitsdatum: string | null;
  }[]
): Promise<PriorisierungErgebnis> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Priorisierungsassistent für eine deutsche Baufirma.
Bewerte welche offenen Bestellungen am dringendsten bearbeitet werden müssen.

Kriterien (Gewichtung):
- Hoher Betrag = dringender
- Nahe/überschrittene Fälligkeit = sehr dringend
- Abweichung-Status = dringend (muss geprüft werden)
- Alter der Bestellung = je älter desto dringender
- Fehlende Dokumente = relevant

Gib NUR ein JSON-Objekt zurück:
{
  "bestellungen": [
    {
      "bestellnummer": "#45231",
      "prioritaet": "hoch",
      "score": 92,
      "grund": "Rechnung überfällig seit 3 Tagen, Betrag 2.450€"
    }
  ],
  "zusammenfassung": "3 Bestellungen mit hoher Priorität."
}

Sortiere nach Score absteigend. Maximal 10 Bestellungen.`,
      },
      {
        role: "user",
        content: `Offene Bestellungen:\n${bestellungen.map((b) =>
          `- ${b.bestellnummer} bei ${b.haendler}: Status=${b.status}, Betrag=${b.betrag ?? "?"}€, ${b.tage_alt} Tage alt, Fällig=${b.faelligkeitsdatum || "unbekannt"}, Rechnung=${b.hat_rechnung ? "ja" : "nein"}, LS=${b.hat_lieferschein ? "ja" : "nein"}`
        ).join("\n")}`,
      },
    ],
    max_tokens: 1500,
    temperature: 0.2,
  }));

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 9. Besteller-Hinweise aus E-Mail-Text und Dokumenten extrahieren
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

export async function extrahiereBestellerHinweise(
  emailText: string,
  emailBetreff: string,
  dokumentTexte: string[],
  bekannteBenutzer: { kuerzel: string; name: string; email: string }[]
): Promise<BestellerHinweiseErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Du bist ein Zuordnungsassistent für eine deutsche Baufirma (MR Umbau GmbH).
Analysiere E-Mail-Text und Dokumentinhalte nach Hinweisen, wer die Bestellung aufgegeben hat.

Suche nach:
- Personennamen (Ansprechpartner, Besteller, "Bestellt von", "Aufgegeben von")
- Lieferadressen mit Personennamen ("z.Hd.", "c/o", "Empfänger")
- Kundennummern die einem Mitarbeiter zugeordnet werden können
- Telefonnummern oder E-Mail-Adressen im Dokument
- Abteilungshinweise oder Kostenstellen

Bekannte Mitarbeiter:
${bekannteBenutzer.map((b) => `- ${b.kuerzel}: ${b.name} (${b.email})`).join("\n")}

Gib NUR ein JSON-Objekt zurück:
{
  "gefundene_hinweise": [
    { "typ": "name", "wert": "Marlon Tschon", "quelle": "Lieferadresse" },
    { "typ": "kundennummer", "wert": "KD-4812", "quelle": "E-Mail-Text" }
  ],
  "vorgeschlagenes_kuerzel": "MT",
  "konfidenz": 0.75,
  "begruendung": "Name 'Marlon Tschon' in Lieferadresse gefunden, passt zu Mitarbeiter MT"
}

Falls keine Hinweise gefunden: vorgeschlagenes_kuerzel null, konfidenz 0.`,
        },
        {
          role: "user",
          content: `E-Mail-Betreff: ${emailBetreff}
E-Mail-Text (Auszug): ${emailText.slice(0, 2000)}

Dokumentinhalte:
${dokumentTexte.map((t, i) => `--- Dokument ${i + 1} ---\n${t.slice(0, 1500)}`).join("\n\n")}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.1,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// 10. Kommentar-Zusammenfassung für eine Bestellung
export async function fasseBestellungZusammen(
  bestellung: { bestellnummer: string; haendler: string; status: string; betrag: number },
  abweichungen: { feld: string; artikel?: string; erwartet: string | number; gefunden: string | number }[],
  kommentare: { autor: string; text: string; datum: string }[]
): Promise<string> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Zusammenfassungs-Assistent für eine deutsche Baufirma.
Fasse den aktuellen Stand einer Bestellung in 2-3 prägnanten Sätzen auf Deutsch zusammen.
Berücksichtige Abweichungen und Kommentare. Schreibe so, dass die Buchhaltung sofort versteht was los ist.
Gib NUR den Text zurück, kein JSON.`,
      },
      {
        role: "user",
        content: `Bestellung: ${bestellung.bestellnummer} bei ${bestellung.haendler}
Status: ${bestellung.status}, Betrag: ${bestellung.betrag}€

Abweichungen:
${abweichungen.length > 0
  ? abweichungen.map((a) => `- ${a.feld}${a.artikel ? ` (${a.artikel})` : ""}: Erwartet ${a.erwartet}, gefunden ${a.gefunden}`).join("\n")
  : "Keine Abweichungen"}

Kommentare:
${kommentare.length > 0
  ? kommentare.map((k) => `- ${k.autor} (${k.datum}): ${k.text}`).join("\n")
  : "Keine Kommentare"}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.3,
  }));

  return response.choices[0]?.message?.content || "Zusammenfassung konnte nicht erstellt werden.";
}
