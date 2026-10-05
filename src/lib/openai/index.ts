/**
 * Einstieg in die KI-Funktionen. Nur was außerhalb von lib/openai gebraucht
 * wird, steht hier; alles andere bleibt in seinem Modul (cost, client,
 * prompts, dokument, extraction, digests, affinitaet).
 */
export { withCostTracking } from "./cost";
export { chatCompletion } from "./client";
export { type DokumentAnalyse } from "./prompts";
export { analysiereDokument, fuehreAbgleichDurch, kategorisiereArtikel, pruefeDuplikat } from "./dokument";
export { erkenneBestellerIntelligent, erkenneHaendlerAusEmail, pruefePreisanomalien } from "./extraction";
export {
  fasseBestellungZusammen,
  generiereErinnerungsmail,
  generiereWochenzusammenfassung,
  priorisiereBestellungen,
} from "./digests";
export { aktualisiereBestellerAffinitaet } from "./affinitaet";
