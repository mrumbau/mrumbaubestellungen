/**
 * Backward-Compat-Barrel für die OpenAI-Lib.
 *
 * 19.05.2026 (A2.7) — Re-Export aller Submodule, damit die 41+ Import-Sites
 * (`import { ... } from "@/lib/openai"`) unverändert weiterfunktionieren.
 *
 * Module-Layout:
 *   cost.ts       — Cost-Tracking + Hard-Cap (CostBucket, withCostTracking, ...)
 *   client.ts     — openai-Instance + withRetry + chatCompletion + safeParseGptJson
 *   prompts.ts    — Types + Zod-Schemas + ANALYSE_PROMPT + folderHintPromptAddition
 *   dokument.ts   — analysiereDokument, fuehreAbgleichDurch, pruefeDuplikat, kategorisiereArtikel
 *   extraction.ts — Besteller/Haendler/Subunternehmer/Projekt + Preis-Anomalien + Hinweise
 *   digests.ts    — generiereErinnerungsmail, generiereWochenzusammenfassung, priorisiereBestellungen, fasseBestellungZusammen
 *   affinitaet.ts — berechneAffinitaet, aktualisiereBestellerAffinitaet (deterministisch, kein KI-Call)
 *
 * Bei neuen KI-Funktionen: direkt im passenden Sub-Modul ergänzen + hier re-exportieren.
 */
export {
  // Konstanten
  MAX_COST_PER_MAIL_EUR,
  MODEL_COSTS_USD,
  USD_TO_EUR,
  // Klasse
  CostCapExceededError,
  // Funktionen
  trackCost,
  withCostTracking,
  // Typen
  type CostBucket,
} from "./cost";

export {
  chatCompletion,
  modelDisallowsCustomTemperature,
  openai,
  safeParseGptJson,
  withRetry,
} from "./client";

export {
  ANALYSE_PROMPT,
  AbgleichErgebnisSchema,
  DokumentAnalyseSchema,
  folderHintPromptAddition,
  type AbgleichErgebnis,
  type BestellerErkennungErgebnis,
  type BestellerHinweiseErgebnis,
  type DokumentAnalyse,
  type DuplikatErgebnis,
  type KategorisierungErgebnis,
  type PreisAnomalieErgebnis,
  type PriorisierungErgebnis,
  type ProjektMatchErgebnis,
  type WochenzusammenfassungErgebnis,
} from "./prompts";

export {
  analysiereDokument,
  fuehreAbgleichDurch,
  kategorisiereArtikel,
  pruefeDuplikat,
} from "./dokument";

export {
  erkenneBestellerIntelligent,
  erkenneHaendlerAusEmail,
  erkenneProjektAusInhalt,
  erkenneSubunternehmerAusEmail,
  extrahiereBestellerHinweise,
  pruefePreisanomalien,
} from "./extraction";

export {
  fasseBestellungZusammen,
  generiereErinnerungsmail,
  generiereWochenzusammenfassung,
  priorisiereBestellungen,
} from "./digests";

export {
  aktualisiereBestellerAffinitaet,
  berechneAffinitaet,
} from "./affinitaet";
