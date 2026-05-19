/**
 * Dokument-zentrierte KI-Operations: PDF/Bild-Analyse, 3-Wege-Abgleich,
 * Duplikat-Check, Artikel-Kategorisierung.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { logError, logInfo } from "@/lib/logger";
import { openai, withRetry, chatCompletion, safeParseGptJson, modelDisallowsCustomTemperature } from "./client";
import {
  ANALYSE_PROMPT,
  AbgleichErgebnisSchema,
  DokumentAnalyseSchema,
  folderHintPromptAddition,
  type AbgleichErgebnis,
  type DokumentAnalyse,
  type DuplikatErgebnis,
  type KategorisierungErgebnis,
} from "./prompts";

// PDF/Bild analysieren mit GPT-4o
export async function analysiereDokument(
  base64: string,
  mimeType: string,
  options?: { folderHint?: string | null }
): Promise<DokumentAnalyse> {
  // PDFs werden als file-Content gesendet, Bilder als image_url, Text als text
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType.startsWith("text/");

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = isText
    ? [
        {
          type: "text",
          text: Buffer.from(base64, "base64").toString("utf-8"),
        },
      ]
    : isPdf
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

  const systemPrompt = ANALYSE_PROMPT + folderHintPromptAddition(options?.folderHint);

  // F4.17 Fix: Adaptive max_tokens.
  let maxTokens = 2000;
  if (isText) {
    const inputBytes = Buffer.byteLength(base64, "base64");
    maxTokens = Math.min(2000, Math.max(500, Math.ceil(inputBytes / 5)));
  }

  // F4.3 Fix: Structured Outputs via zodResponseFormat. Kein safeParseGptJson
  // mehr nötig — die OpenAI-API garantiert valid-JSON conforming zum Schema
  // (oder wirft beim Refusal).
  //
  // 05.05.2026: Parse-Fehler-Retry — bei fehlgeschlagenem ersten Versuch
  // (kein parsed-Objekt oder Exception) einmal mit gpt-4o als Fallback-Modell
  // (älteres aber stabiles Strukturiertes-Output-Modell). Verhindert dass eine
  // einmalige GPT-5.5-Macke den ganzen Pipeline-Run für die Mail wertlos macht.
  const tryAnalyse = async (model: string): Promise<DokumentAnalyse | null> => {
    try {
      const completion = await withRetry(() =>
        openai.chat.completions.parse({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          // gpt-5/o-Modelle: max_completion_tokens. gpt-4*: max_tokens.
          ...(modelDisallowsCustomTemperature(model)
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens }),
          response_format: zodResponseFormat(DokumentAnalyseSchema, "DokumentAnalyse"),
        }),
      );
      const parsed = completion.choices[0]?.message?.parsed;
      if (!parsed) {
        const refusal = completion.choices[0]?.message?.refusal;
        logError("openai/analysiereDokument", `${model}: kein parsed-Objekt`, { refusal: refusal ?? null });
        return null;
      }
      return parsed as DokumentAnalyse;
    } catch (err) {
      logError("openai/analysiereDokument", `${model}: Aufruf fehlgeschlagen`, err);
      return null;
    }
  };

  const primary = await tryAnalyse("gpt-5.5");

  // 06.05.2026 — Erweiterung des Fallback-Triggers:
  // Bisher nur bei null-Result oder Exception. Jetzt auch wenn KI ein
  // betragsführendes Dokument erkennt (Rechnung/BB/LS) aber gesamtbetrag NULL
  // liefert → vermutlich Extraktions-Schwäche, gpt-4o-Retry hat bessere Chance
  // den Betrag aus Tabellen-Layouts zu extrahieren.
  // Anwendung: nicht nur Rechnung — auch Bestellbestätigungen tragen Beträge
  // (User-Feedback 06.05.2026: "Amazon BB haben immer preise drinnen, der
  // Preis darf durch Bestellbestätigung aufgenommen werden").
  // Verhindert "BB/RG ohne Betrag" im UI (Amazon-BBs, Elektroservice Feistbaur).
  const TYPEN_MIT_BETRAG = ["rechnung", "bestellbestaetigung", "lieferschein"];
  const primaryNeedsRetry =
    !primary ||
    (TYPEN_MIT_BETRAG.includes(primary.typ) && primary.gesamtbetrag == null && primary.parse_fehler !== true);

  if (primary && !primaryNeedsRetry) return primary;

  // Retry mit Fallback-Modell — gpt-4o ist battle-tested für Structured-Outputs
  logInfo("openai/analysiereDokument", primary
    ? `Retry mit gpt-4o (typ=${primary.typ} ohne gesamtbetrag)`
    : "Retry mit Fallback-Modell gpt-4o");
  const fallback = await tryAnalyse("gpt-4o");
  // Wenn fallback einen Betrag liefert, nimm fallback. Sonst behalte primary
  // (besser unvollständige Analyse als Komplett-Verlust).
  if (fallback && (fallback.gesamtbetrag != null || !primary)) return fallback;
  if (primary) return primary;

  return makeUnknownDokumentAnalyse(true);
}

/** F4.3 Helper: Default-Fallback wenn analysiereDokument keinen valid-Output liefert. */
function makeUnknownDokumentAnalyse(parseError: boolean): DokumentAnalyse {
  return {
    typ: "unbekannt",
    bestellnummer: null,
    auftragsnummer: null,
    lieferscheinnummer: null,
    haendler: null,
    datum: null,
    artikel: [],
    gesamtbetrag: null,
    netto: null,
    mwst: null,
    faelligkeitsdatum: null,
    lieferdatum: null,
    iban: null,
    konfidenz: 0,
    lieferadressen: [],
    volltext: "",
    parse_fehler: parseError,
    ist_gutschrift: false,
  };
}

// KI-Abgleich zwischen den 3 Dokumenten
export async function fuehreAbgleichDurch(
  bestellbestaetigung: DokumentAnalyse | null,
  lieferschein: DokumentAnalyse | null,
  rechnung: DokumentAnalyse | null
): Promise<AbgleichErgebnis> {
  try {
    // chat.completions.parse hat dieselbe Param-Auto-Migration nötig wie .create:
    // gpt-5/o-Modelle akzeptieren keine custom temperature und kein max_tokens.
    // Wir konvertieren explizit (kein chatCompletion-Wrapper, weil parse mit
    // zodResponseFormat einen anderen Return-Typ liefert).
    const completion = await withRetry(() =>
      openai.chat.completions.parse({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `Du bist ein Prüfassistent für eine deutsche Baufirma.
Vergleiche die vorliegenden Dokumente einer Bestellung und prüfe ob alles übereinstimmt.

Pflicht-Dokumente sind Lieferschein und Rechnung.
Bestellbestätigung ist OPTIONAL — wenn null, prüfe nur LS↔RG.
Wenn alle drei vorhanden sind, prüfe alle drei gegenseitig.

Gib das Ergebnis als JSON-Objekt zurück:
- status: "ok" wenn keine Abweichungen, sonst "abweichung"
- abweichungen: Liste der erkannten Diskrepanzen
- zusammenfassung: kurze Beschreibung in Deutsch (nenne welche Dokumente verglichen wurden)

In abweichungen[].erwartet und abweichungen[].gefunden gib Werte IMMER als String (auch Zahlen).`,
          },
          {
            role: "user",
            content: `Bestellbestätigung: ${bestellbestaetigung ? JSON.stringify(bestellbestaetigung) : "(nicht vorhanden)"}
Lieferschein: ${JSON.stringify(lieferschein)}
Rechnung: ${JSON.stringify(rechnung)}`,
          },
        ],
        max_completion_tokens: 2000,
        response_format: zodResponseFormat(AbgleichErgebnisSchema, "AbgleichErgebnis"),
      }),
    );

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      logError("openai/fuehreAbgleichDurch", "kein parsed-Result", {
        refusal: completion.choices[0]?.message?.refusal ?? null,
      });
      return { status: "ok", abweichungen: [], zusammenfassung: "Abgleich konnte nicht durchgeführt werden." };
    }
    // Cast: z.string() für erwartet/gefunden aus dem Schema → AbgleichErgebnis-Type
    // erlaubt string | number, also widening-Cast safe.
    return parsed as AbgleichErgebnis;
  } catch (err) {
    logError("openai/fuehreAbgleichDurch", "Strict-Outputs fehlgeschlagen", err);
    return { status: "ok", abweichungen: [], zusammenfassung: "Abgleich konnte nicht durchgeführt werden." };
  }
}

// Duplikat-Erkennung
export async function pruefeDuplikat(
  neueBestellung: { haendler: string; betrag: number | null; artikel: { name: string; menge: number; einzelpreis: number }[] },
  existierendeBestellungen: { bestellnummer: string; haendler: string; betrag: number | null; artikel: { name: string; menge: number; einzelpreis: number }[]; datum: string }[]
): Promise<DuplikatErgebnis> {
  if (existierendeBestellungen.length === 0) {
    return { ist_duplikat: false, konfidenz: 1, duplikat_von: null, begruendung: "Keine vergleichbaren Bestellungen vorhanden." };
  }

  const response = await chatCompletion({
    model: "gpt-5.5",
    response_format: { type: "json_object" },
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
    max_tokens: 800,
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<DuplikatErgebnis>(text, { ist_duplikat: false, konfidenz: 0, duplikat_von: null, begruendung: "Parsing fehlgeschlagen" });
}

// Automatische Artikel-Kategorisierung
export async function kategorisiereArtikel(
  artikel: { name: string; menge: number; einzelpreis: number }[]
): Promise<KategorisierungErgebnis> {
  const response = await chatCompletion({
    // R2/F4.2: Whitelist-Kategorien-Zuordnung — gpt-4o-mini ausreichend
    model: "gpt-5.5",
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
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<KategorisierungErgebnis>(text, { kategorien: [], zusammenfassung: {} });
}
