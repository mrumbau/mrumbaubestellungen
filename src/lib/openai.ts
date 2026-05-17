import OpenAI from "openai";
import { SupabaseClient } from "@supabase/supabase-js";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { logError, logInfo } from "@/lib/logger";

// F4.13 Fix: 60s Default-Timeout. PDF-Vision braucht oft 20-30s, knapp am SDK-
// Default 30s — bei großen PDFs hilft das. Maximal-Werte werden bei Bedarf
// pro Call überschrieben.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
  maxRetries: 0, // wir machen Retries selbst via withRetry()
});

// ═══════════════════════════════════════════════════════════════════════════
// R2/F4.1: Cost-Tracking-Layer
//
// Jeder OpenAI-Call schreibt sein Cost-Profil entweder in einen request-scoped
// AsyncLocalStorage-Bucket (wenn der Caller `withCostTracking()` nutzt) ODER
// als logInfo-Eintrag (Per-Call-Visibility in Vercel-Function-Logs).
//
// Per-Mail-Aggregation in `email_processing_log.openai_*` setzt voraus, dass
// classify.ts/ingest.ts direkten Lib-Call statt HTTP-Loopback machen
// (Phase-2b-Backlog). Bis dahin: Per-Call-Logs sind unsere Cost-Diagnose.
// ═══════════════════════════════════════════════════════════════════════════

export interface CostBucket {
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
  calls: number;
  model_breakdown: Record<string, { input_tokens: number; output_tokens: number; cost_eur: number; calls: number }>;
}

/** USD pro 1M Tokens. Stand 2026-05. Anpassen wenn OpenAI-Preise ändern. */
export const MODEL_COSTS_USD: Record<string, { input: number; output: number }> = {
  // Email-Pipeline (Reasoning für Multi-Doc-Logik)
  "gpt-5.5": { input: 5.00, output: 30.00 },
  "gpt-5.5-pro": { input: 30.00, output: 180.00 },
  // CardScan (kein Reasoning nötig, json_schema strict garantiert Struktur)
  "gpt-5-mini": { input: 0.25, output: 2.00 },
  "gpt-5-nano": { input: 0.05, output: 0.40 },
  // Legacy — bleiben für Cost-Calc historischer Mails (vor Migration verarbeitet)
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

/** Grobe USD→EUR-Konversion. Bei Bedarf pro Quartal aktualisieren. */
export const USD_TO_EUR = 0.93;

const costStore = new AsyncLocalStorage<CostBucket>();

/**
 * Normalisiert Model-Namen. OpenAI returnt versionierte Namen wie
 * "gpt-5.5-2026-04-15" oder "gpt-4o-2024-08-06" — unsere MODEL_COSTS_USD-Map
 * hat aber nur die Base-Namen. Ohne Normalisierung wäre cost_eur immer 0.
 *
 * Strategie: längster Base-Namens-Match-Prefix gewinnt.
 */
function normalizeModelName(model: string): string {
  // Sortiere keys nach Länge (längster zuerst), damit "gpt-4o-mini" vor "gpt-4o" matched
  const keys = Object.keys(MODEL_COSTS_USD).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model === key || model.startsWith(key + "-") || model.startsWith(key + ".")) {
      return key;
    }
  }
  return model;
}

function calcCostEur(model: string, prompt_tokens: number, completion_tokens: number): number {
  const normalized = normalizeModelName(model);
  const rates = MODEL_COSTS_USD[normalized] ?? { input: 0, output: 0 };
  const usd = (prompt_tokens * rates.input + completion_tokens * rates.output) / 1_000_000;
  return usd * USD_TO_EUR;
}

function trackCost(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined) {
  const bucket = costStore.getStore();

  if (!bucket) {
    // Pipeline-Aufrufer hat kein withCostTracking gewickelt — nur Per-Call-Log.
    // Sollte normalerweise nicht passieren (replay.ts wickelt classify+ingest in withCostTracking).
    logInfo("openai/cost-debug", "trackCost: kein AsyncLocalStorage-bucket — Aufrufer ohne withCostTracking?", {
      model,
      has_usage: !!usage,
    });
    return;
  }

  if (!usage) {
    // KI-Call kam zurück ohne usage-Feld (Stream-Response, Error-Response, oder API-Quirk).
    // Mindestens den Call-Counter inkrementieren damit wir sehen DASS gerufen wurde.
    bucket.calls += 1;
    logInfo("openai/cost-debug", "trackCost: usage fehlte — nur Call-Counter inkrementiert", { model });
    return;
  }

  const inputT = usage.prompt_tokens ?? 0;
  const outputT = usage.completion_tokens ?? 0;
  const costEur = calcCostEur(model, inputT, outputT);
  // Versionierten Model-Namen für Breakdown-Key zu Base-Namen normalisieren —
  // sonst entstehen 100 Sub-Keys pro Modell-Release-Datum.
  const breakdownKey = normalizeModelName(model);

  bucket.input_tokens += inputT;
  bucket.output_tokens += outputT;
  bucket.cost_eur += costEur;
  bucket.calls += 1;
  const mb = (bucket.model_breakdown[breakdownKey] ??= { input_tokens: 0, output_tokens: 0, cost_eur: 0, calls: 0 });
  mb.input_tokens += inputT;
  mb.output_tokens += outputT;
  mb.cost_eur += costEur;
  mb.calls += 1;

  // Wenn beide 0 sind: log für Diagnose (bei 0-Token-Result wäre das ungewöhnlich)
  if (inputT === 0 && outputT === 0) {
    logInfo("openai/cost-debug", "trackCost: beide Token-Counter sind 0", { model, usage });
  }
}

/**
 * Wrappt einen Block aus mehreren OpenAI-Calls + akkumuliert die Costs.
 * Liefert Result + aggregierten Cost-Bucket. Caller schreibt z.B. in
 * `email_processing_log` oder ein Cost-Audit-Log.
 *
 * Funktioniert nur In-Process — HTTP-Loopback (siehe classify.ts/ingest.ts)
 * durchquert die Async-Local-Storage-Grenze. Für die Email-Pipeline daher
 * heute keine Per-Mail-Aggregation; siehe Phase-2b-Refactor.
 */
export async function withCostTracking<T>(fn: () => Promise<T>): Promise<{ result: T; cost: CostBucket }> {
  const bucket: CostBucket = {
    input_tokens: 0,
    output_tokens: 0,
    cost_eur: 0,
    calls: 0,
    model_breakdown: {},
  };
  const result = await costStore.run(bucket, fn);
  return { result, cost: bucket };
}

/** Retry-Wrapper mit exponential backoff für OpenAI-Calls. Auto-trackt Costs
 *  bei ChatCompletion-Responses (model + usage erkannt am Result-Shape).
 *
 *  F4.7 Fix: Retry-Detection via APIError.status statt String-Match auf der
 *  Error-Message. 4xx (außer 429) sind non-retryable — der Client-Fehler wird
 *  durch wiederholte Aufrufe nicht besser. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();
      // R2/F4.1: Auto-Cost-Tracking. Auch wenn usage null/undefined ist:
      // trackCost rufen damit bucket.calls inkrementiert wird + Diagnose-Log.
      if (result && typeof result === "object" && "model" in result) {
        const r = result as {
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        if (r.model) trackCost(r.model, r.usage ?? null);
      } else if (result && typeof result === "object") {
        // Result hat kein "model"-Feld — Cost-Tracking nicht möglich
        logInfo("openai/cost-debug", "withRetry-Result ohne model-Feld", {
          result_keys: Object.keys(result as object).slice(0, 10),
        });
      }
      return result;
    } catch (err: unknown) {
      let isRetryable = false;

      if (err instanceof OpenAI.APIError) {
        // Retryable: 429 (rate-limited), 5xx (server-side), explicit 408 (request timeout)
        const status = err.status ?? 0;
        isRetryable = status === 429 || status === 408 || (status >= 500 && status < 600);
      } else if (err instanceof Error) {
        // Network-Errors haben keinen .status — fallback auf String-Match
        const msg = err.message.toLowerCase();
        isRetryable =
          msg.includes("timeout")
          || msg.includes("econnreset")
          || msg.includes("etimedout")
          || msg.includes("network");
      }

      if (!isRetryable || attempt === maxRetries - 1) throw err;
      // Jitter zur Vermeidung von Thundering-Herd
      const backoff = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("Max retries reached");
}

/**
 * Generischer Wrapper für `openai.chat.completions.create` (non-streaming),
 * der den zentralen Client + withRetry + Auto-Cost-Tracking erzwingt.
 *
 * Nutze IMMER diese Funktion statt `new OpenAI({...})` + direkter chat-Call.
 * Sonst: kein Cost-Tracking (AsyncLocalStorage-Bucket bleibt leer), kein
 * Retry bei OpenAI 5xx, kein einheitliches Timeout.
 *
 * Streaming wird bewusst NICHT unterstützt — alle Caller im Repo arbeiten
 * synchron auf Vercel-Serverless mit kompletter JSON-Response.
 */
/**
 * Modelle die nur den Default-`temperature`-Wert (1) akzeptieren.
 * Reasoning-Familie: gpt-5*, o1, o3, o4. Custom temperature → 400 Fehler.
 * Wird beim Wechsel des Org/Project-Keys oft sichtbar, weil die
 * strict-Validierung dort serverseitig anders gehandhabt wird.
 */
function modelDisallowsCustomTemperature(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("gpt-5") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}

export async function chatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  // Reasoning-Modelle (gpt-5*, o-Series) verlangen aktualisierte Param-Form:
  //   - temperature → muss Default (1) sein, sonst 400-Reject
  //   - max_tokens  → wurde zu `max_completion_tokens` umbenannt
  // 07.05.2026 — Auto-Migration im Wrapper damit Caller mit alter Param-Form
  // (max_tokens: 500) nicht crashen. Hat duplikat-check + bestellung-
  // zusammenfassung im Detail-View 500-en lassen.
  if (modelDisallowsCustomTemperature(params.model)) {
    const { temperature: _t, max_tokens, ...rest } = params;
    void _t;
    const fixed: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      ...rest,
      ...(max_tokens != null ? { max_completion_tokens: max_tokens } : {}),
    };
    return withRetry(() => openai.chat.completions.create(fixed));
  }
  return withRetry(() => openai.chat.completions.create(params));
}

/** Sicherer JSON-Parser für GPT-Responses — gibt Fallback statt Crash.
 *  F4.14 Fix: Parse-Fehler werden geloggt (vorher silent fallback → systematische
 *  Modell-Drift blieb unentdeckt). */
function safeParseGptJson<T>(text: string, fallback: T, context = "openai/safeParseGptJson"): T {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : clean);
  } catch (err) {
    logError(context, "JSON-Parse fehlgeschlagen — Fallback wird zurückgegeben", {
      error: err instanceof Error ? err.message : String(err),
      raw_preview: text.slice(0, 500),
    });
    return fallback;
  }
}

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
const DokumentAnalyseSchema = z.object({
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

const ANALYSE_PROMPT = `Du bist ein Assistent der Geschäftsdokumente für eine deutsche Baufirma (MR Umbau GmbH) analysiert.
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
  "ist_gutschrift": false
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
function folderHintPromptAddition(hint: string | null | undefined): string {
  if (!hint) return "";
  const label = HINT_LABELS[hint] ?? hint;
  return `

ZUSATZHINWEIS — Folder-Hint vom Mail-Server:
Diese Mail wurde von einer Outlook-Regel in einen Folder einsortiert, der typischerweise "${label}"-Dokumente enthält. Das ist ein SCHWACHES Signal — die Outlook-Regel arbeitet mit einfachen Subject/Sender-Pattern und ist NICHT immer korrekt. Wenn der Dokumentinhalt eindeutig einen anderen Typ zeigt (z.B. eindeutige Rechnungsnummer + MwSt + IBAN trotz Folder-Hint "${label}"), VERTRAUE DEM INHALT und überschreibe den Hint. Bei mehrdeutigen Dokumenten (z.B. Lieferschein mit Preisen ohne klare MwSt) tendiere zu "${label}".`;
}

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

// F4.3: AbgleichErgebnis-Schema für Structured Outputs.
// strict-Mode: erwartet/gefunden müssen einheitlich typed sein → string (KI muss Zahlen als Strings ausgeben).
const AbgleichErgebnisSchema = z.object({
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

// ========== NEUE KI-FUNKTIONEN ==========

// 1. Intelligente Besteller-Erkennung anhand historischer Bestellmuster
export async function erkenneBestellerIntelligent(
  artikelAusEmail: { name: string; menge: number; einzelpreis: number }[],
  haendlerName: string,
  bestellerHistorie: { kuerzel: string; name: string; artikel_namen: string[]; haendler: string[] }[]
): Promise<BestellerErkennungErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
    model: "gpt-5.5",
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
        // F4.11 Fix: Pre-Trim der Artikel- und Händler-Listen pro Besteller.
        // Top-5 Artikel + Top-5 Händler reichen für Profil-Erkennung; volle
        // Liste hätte Token-Verbrauch unnötig getrieben.
        content: `Neue Bestellung bei ${haendlerName}:
Artikel: ${JSON.stringify(artikelAusEmail.slice(0, 10))}

Bestellhistorie der Mitarbeiter:
${bestellerHistorie.map((b) => `${b.kuerzel} (${b.name}): Bestellt oft: ${b.artikel_namen.slice(0, 5).join(", ")} | Händler: ${b.haendler.slice(0, 5).join(", ")}`).join("\n")}`,
      },
    ],
    max_tokens: 500,
  })
  );

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<BestellerErkennungErgebnis>(text, { kuerzel: "UNBEKANNT", konfidenz: 0, begruendung: "Parsing fehlgeschlagen" });
}

// 2. Lieferschein-Erinnerung generieren
export async function generiereErinnerungsmail(
  bestellungen: { bestellnummer: string; haendler: string; besteller: string; tage_alt: number; betrag: number }[]
): Promise<string> {
  const response = await chatCompletion({
    // R2/F4.2: gpt-4o-mini ausreichend für simple Text-Generation; ~5x günstiger
    model: "gpt-5.5",
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
  });

  return response.choices[0]?.message?.content || "";
}

// 3. Anomalie-Erkennung bei Preisen
export async function pruefePreisanomalien(
  aktuelleArtikel: { name: string; einzelpreis: number; menge: number }[],
  historischePreise: { name: string; preise: number[] }[]
): Promise<PreisAnomalieErgebnis> {
  const response = await chatCompletion({
    // R2/F4.2: numerischer Vergleich, kein Reasoning nötig — gpt-4o-mini reicht
    model: "gpt-5.5",
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
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<PreisAnomalieErgebnis>(text, { hat_anomalie: false, warnungen: [], zusammenfassung: "Preisanalyse konnte nicht durchgeführt werden." });
}

// 4. Automatische Händler-Erkennung aus E-Mail
export async function erkenneHaendlerAusEmail(
  emailAbsender: string,
  emailBetreff: string,
  erkannterHaendlerName: string | null
): Promise<{ name: string; domain: string; email_muster: string } | null> {
  const response = await chatCompletion({
    // R2/F4.2: einfache Domain-/Namens-Extraktion — gpt-4o-mini ausreichend
    model: "gpt-5.5",
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
        // F4.9 Fix: User-Input via JSON-Encoding gegen Prompt-Injection
        content: `Analysiere folgenden Input (JSON):\n\`\`\`json\n${JSON.stringify({
          email_absender: emailAbsender,
          email_betreff: emailBetreff,
          erkannter_haendler_name: erkannterHaendlerName ?? null,
        })}\n\`\`\``,
      },
    ],
    max_tokens: 300,
  });

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

// 4b. Automatische Subunternehmer-Erkennung aus E-Mail/Rechnung
export async function erkenneSubunternehmerAusEmail(
  emailAbsender: string,
  emailBetreff: string,
  erkannterName: string | null,
  dokumentText: string | null
): Promise<{ firma: string; gewerk: string | null; email_muster: string; steuer_nr: string | null; iban: string | null } | null> {
  const response = await chatCompletion({
    // R2/F4.2: Text-Matching für SU-Firmen-Erkennung — gpt-4o-mini ausreichend
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Assistent der Subunternehmer anhand von E-Mail-Daten und Rechnungsinhalten erkennt.
Dies ist eine deutsche Baufirma (Innenausbau). Subunternehmer sind Handwerksbetriebe die Arbeitsleistungen erbringen.

Extrahiere:
- firma: Firmenname des Subunternehmers
- gewerk: Das Gewerk/die Branche (eines von: Elektro, Sanitär/Heizung, Trockenbau, Maler/Lackierer, Estrich, Fliesen, Bodenbelag, Schreiner/Tischler, Schlosser/Metallbau, Fenster/Türen, Dachdecker, Reinigung, Abbruch/Entsorgung, Sonstiges)
- email_muster: Die E-Mail-Adresse des Absenders
- steuer_nr: Steuer-Nr oder USt-ID falls im Dokument erkennbar
- iban: IBAN falls im Dokument erkennbar

Gib NUR ein JSON-Objekt zurück:
{
  "firma": "Elektro Müller GmbH",
  "gewerk": "Elektro",
  "email_muster": "rechnung@elektro-mueller.de",
  "steuer_nr": "DE123456789",
  "iban": "DE89 3704 0044 0532 0130 00"
}

Falls du den Subunternehmer nicht erkennen kannst, gib null zurück.`,
      },
      {
        role: "user",
        // F4.9 Fix: User-Input via JSON-Encoding gegen Prompt-Injection
        content: `Analysiere folgenden Input (JSON):\n\`\`\`json\n${JSON.stringify({
          email_absender: emailAbsender,
          email_betreff: emailBetreff,
          erkannter_firmenname: erkannterName ?? null,
          dokument_text_auszug: dokumentText ? dokumentText.slice(0, 2000) : null,
        })}\n\`\`\``,
      },
    ],
    max_tokens: 400,
  });

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
    freigegebenes_volumen: number;
    ueberfaellige_rechnungen: { bestellnummer: string; haendler: string; faellig: string; betrag: number }[];
    abweichende_bestellungen: { bestellnummer: string; haendler: string; problem: string }[];
  }
): Promise<WochenzusammenfassungErgebnis> {
  const response = await chatCompletion({
    model: "gpt-5.5",
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
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<WochenzusammenfassungErgebnis>(text, { zusammenfassung: "Zusammenfassung konnte nicht erstellt werden.", dringend: [], highlights: [] });
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
  // F4.10 Fix: Pre-Filter Top-15 nach Heuristik (überfällig + älteste + höchste Beträge),
  // Rest als Statistik. Verhindert Token-Explosion bei vielen offenen Bestellungen.
  const TOP_N = 15;
  const heuteISO = new Date().toISOString().slice(0, 10);
  const scored = bestellungen.map((b) => {
    let score = 0;
    if (b.faelligkeitsdatum && b.faelligkeitsdatum < heuteISO) score += 50; // überfällig
    if (b.status === "abweichung") score += 30;
    score += Math.min(b.tage_alt, 30);
    if (b.betrag && b.betrag > 1000) score += 10;
    if (!b.hat_rechnung) score += 5;
    return { b, score };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, TOP_N).map((s) => s.b);
  const restCount = Math.max(0, bestellungen.length - top.length);
  const restSummary = restCount > 0 ? `\n\nWeitere ${restCount} offene Bestellungen (niedrigere Priorität, nicht im Detail).` : "";

  const response = await chatCompletion({
    model: "gpt-5.5",
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
        content: `Offene Bestellungen (Top ${top.length} nach Pre-Filter):\n${top.map((b) =>
          `- ${b.bestellnummer} bei ${b.haendler}: Status=${b.status}, Betrag=${b.betrag ?? "?"}€, ${b.tage_alt} Tage alt, Fällig=${b.faelligkeitsdatum || "unbekannt"}, Rechnung=${b.hat_rechnung ? "ja" : "nein"}, LS=${b.hat_lieferschein ? "ja" : "nein"}`
        ).join("\n")}${restSummary}`,
      },
    ],
    max_tokens: 1500,
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<PriorisierungErgebnis>(text, { bestellungen: [], zusammenfassung: "Priorisierung konnte nicht durchgeführt werden." });
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
      model: "gpt-5.5",
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
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<BestellerHinweiseErgebnis>(text, { gefundene_hinweise: [], vorgeschlagenes_kuerzel: null, konfidenz: 0, begruendung: "Parsing fehlgeschlagen" });
}

// 10. Kommentar-Zusammenfassung für eine Bestellung
export async function fasseBestellungZusammen(
  bestellung: { bestellnummer: string; haendler: string; status: string; betrag: number },
  abweichungen: { feld: string; artikel?: string; erwartet: string | number; gefunden: string | number }[],
  kommentare: { autor: string; text: string; datum: string }[]
): Promise<string> {
  const response = await chatCompletion({
    model: "gpt-5.5",
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
    max_tokens: 600,
  });

  return response.choices[0]?.message?.content || "Zusammenfassung konnte nicht erstellt werden.";
}

// ============================================================
// INTELLIGENTE BAUSTELLEN- & KUNDENERKENNUNG
// ============================================================

export interface ProjektMatchErgebnis {
  projekt_id: string | null;
  konfidenz: number;
  methode: "lieferadresse" | "projektname_text" | "kundenname" | "besteller_affinitaet" | "unbekannt";
  begruendung: string;
  extrahierte_lieferadresse?: string | null;
  extrahierter_projektname?: string | null;
}


// 11. Projekt-Erkennung aus E-Mail + Dokumenten (GPT-4o, Stufen 1-3)
export async function erkenneProjektAusInhalt(params: {
  email_betreff: string;
  email_body: string;
  dokument_texte: string[];
  lieferadressen: string[];
  buero_adresse: string;
  aktive_projekte: {
    id: string;
    name: string;
    beschreibung: string | null;
    adresse: string | null;
    adresse_keywords: string[];
    kunden_name: string | null;
  }[];
}): Promise<ProjektMatchErgebnis | null> {
  if (params.aktive_projekte.length === 0) return null;

  const bueroHinweis = params.buero_adresse
    ? `Ignoriere die Büro-Adresse: ${params.buero_adresse}`
    : "Keine Büro-Adresse konfiguriert — überspringe diesen Filter.";

  const projekteListe = params.aktive_projekte.map((p) =>
    `- ID: ${p.id} | Name: "${p.name}" | Adresse: ${p.adresse || "keine"} | Keywords: [${p.adresse_keywords.join(", ")}] | Kunde: ${p.kunden_name || "keiner"} | Beschreibung: ${p.beschreibung || "keine"}`
  ).join("\n");

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `Du bist ein Assistent der Bestellungen Baustellen zuordnet.

Analysiere E-Mail und PDF-Inhalt und bestimme welche Baustelle/Projekt gemeint ist. Nutze diese Signale:

1. LIEFERADRESSE: Suche nach Lieferadressen im Text. Vergleiche mit den Baustellen-Adressen der Projekte. Fuzzy-Matching: "Kernstr. 14" = "Kernstraße 14". ${bueroHinweis}

2. PROJEKTNAME/BAUSTELLE: Suche nach direkten Erwähnungen von Projektnamen, Baustellen-Bezeichnungen, Objektnamen, BV-Nummern, Auftragsnummern. Vergleiche mit den Projektnamen und Beschreibungen.

3. KUNDENNAME: Suche nach Auftraggeber, Rechnungsempfänger, Auftraggeber-Adresse. Vergleiche mit Kundennamen der Projekte.

Wichtig: Artikelnamen sind KEIN Erkennungsmerkmal. Nur Adressen, Namen und Projektreferenzen zählen.

Antworte NUR als JSON:
{
  "projekt_id": "uuid oder null",
  "konfidenz": 0.0-1.0,
  "methode": "lieferadresse|projektname_text|kundenname|unbekannt",
  "begruendung": "Kurze deutsche Erklärung",
  "extrahierte_lieferadresse": "Adresse oder null",
  "extrahierter_projektname": "Name oder null"
}

Wenn kein Projekt passt: projekt_id=null, methode="unbekannt", konfidenz=0.`,
        },
        {
          role: "user",
          content: `AKTIVE PROJEKTE:
${projekteListe}

E-MAIL-BETREFF: ${params.email_betreff || "(leer)"}

E-MAIL-TEXT:
${(params.email_body || "").slice(0, 2000)}

EXTRAHIERTE LIEFERADRESSEN:
${params.lieferadressen.length > 0 ? params.lieferadressen.join("\n") : "(keine)"}

DOKUMENT-TEXTE:
${params.dokument_texte.length > 0
  ? params.dokument_texte.map((t, i) => `--- Dokument ${i + 1} ---\n${t.slice(0, 1500)}`).join("\n\n")
  : "(keine Dokument-Texte verfügbar)"}`,
        },
      ],
      max_tokens: 500,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!parsed.projekt_id || parsed.methode === "unbekannt" || parsed.konfidenz <= 0) {
      return null;
    }
    return {
      projekt_id: parsed.projekt_id,
      konfidenz: Math.max(0, Math.min(1, Number(parsed.konfidenz) || 0)),
      methode: parsed.methode || "unbekannt",
      begruendung: parsed.begruendung || "",
      extrahierte_lieferadresse: parsed.extrahierte_lieferadresse || null,
      extrahierter_projektname: parsed.extrahierter_projektname || null,
    };
  } catch {
    return null;
  }
}

// 12. Recency-Boost: Kürzlich aktive Projekte höher gewichten
function recencyBoost(letzteBestellung: string | null): number {
  if (!letzteBestellung) return 1.0;
  const tage = (Date.now() - new Date(letzteBestellung).getTime()) / (1000 * 60 * 60 * 24);
  if (tage <= 7) return 1.15;   // letzte Woche: +15%
  if (tage <= 30) return 1.05;  // letzter Monat: +5%
  if (tage > 90) return 0.85;   // > 3 Monate: -15%
  return 1.0;
}

// 13. Besteller-Affinität (deterministisch, kostenlos — wird VOR GPT geprüft)
export function berechneAffinitaet(
  bestellerKuerzel: string,
  projekte: { id: string; name: string; besteller_affinitaet: Record<string, number> | null; letzte_bestellung: string | null }[]
): ProjektMatchErgebnis | null {
  let maxAdjusted = 0;
  let affinitaetsProjekt: typeof projekte[0] | null = null;
  let rawAnteil = 0;

  for (const projekt of projekte) {
    if (!projekt.besteller_affinitaet) continue;
    const anteil = projekt.besteller_affinitaet[bestellerKuerzel] || 0;
    if (anteil < 0.5) continue;
    const adjusted = anteil * recencyBoost(projekt.letzte_bestellung);
    if (adjusted > maxAdjusted) {
      maxAdjusted = adjusted;
      affinitaetsProjekt = projekt;
      rawAnteil = anteil;
    }
  }

  if (affinitaetsProjekt && maxAdjusted > 0) {
    const konfidenz = Math.min(maxAdjusted * 0.80, 0.80);
    if (konfidenz >= 0.60) {
      return {
        projekt_id: affinitaetsProjekt.id,
        konfidenz,
        methode: "besteller_affinitaet",
        begruendung: `Besteller ${bestellerKuerzel} bestellt zu ${Math.round(rawAnteil * 100)}% für "${affinitaetsProjekt.name}"`,
      };
    }
  }
  return null;
}

// 14. Besteller-Affinität aktualisieren (Self-Learning)
export async function aktualisiereBestellerAffinitaet(
  supabase: SupabaseClient,
  projektId: string
): Promise<void> {
  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("besteller_kuerzel")
    .eq("projekt_id", projektId)
    .neq("besteller_kuerzel", "UNBEKANNT");

  if (!bestellungen || bestellungen.length === 0) return;

  const counts: Record<string, number> = {};
  for (const b of bestellungen) {
    counts[b.besteller_kuerzel] = (counts[b.besteller_kuerzel] || 0) + 1;
  }

  const gesamt = bestellungen.length;
  const affinitaet: Record<string, number> = {};
  for (const [kuerzel, anzahl] of Object.entries(counts)) {
    affinitaet[kuerzel] = Math.round((anzahl / gesamt) * 100) / 100;
  }

  await supabase
    .from("projekte")
    .update({ besteller_affinitaet: affinitaet })
    .eq("id", projektId);
}
