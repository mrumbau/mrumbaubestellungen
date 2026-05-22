/**
 * Post-Processing-Tail (Schritte 18-24).
 *
 *   18. updateBestellungStatus
 *   19. KI-Abgleich (nur material + min. 1 Doku)
 *   20. Preisanomalie-Check
 *   21. Abo-Logik
 *   23. UNBEKANNT-Hinweis (Kommentar an Bestellung)
 *   24. webhook_logs success-Eintrag
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 * 22.05.2026 — Schritt 22 (Signal verknüpfen) entfernt, Chrome-Extension stillgelegt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateBestellungStatus } from "@/lib/bestellung-utils";
import { tryAbgleich } from "./abgleich";
import { tryPreisanomalieCheck } from "./preisanomalie";
import { handleAboLogik } from "./abo-handling";
import type { AnalyseErgebnis } from "./anhang-analyse";

export interface PostProcessingInput {
  bestellungId: string;
  bestellungsart: "material" | "subunternehmer" | "abo";
  dokumenteGespeichert: number;
  haendlerDomain: string;
  haendlerName: string;
  analyseErgebnisse: AnalyseErgebnis[];
  bestellerKuerzelMutable: string;
  email_absender: string;
  email_betreff: string;
  erkannteBestellnummer: string | null;
}

export async function runPostProcessing(
  supabase: SupabaseClient,
  input: PostProcessingInput,
): Promise<void> {
  const {
    bestellungId, bestellungsart, dokumenteGespeichert,
    haendlerDomain, haendlerName, analyseErgebnisse,
    bestellerKuerzelMutable, email_absender, email_betreff, erkannteBestellnummer,
  } = input;

  // 18. Status aktualisieren
  await updateBestellungStatus(supabase, bestellungId);

  // 19. KI-Abgleich (nur material)
  if (bestellungsart === "material" && dokumenteGespeichert > 0) {
    await tryAbgleich(supabase, bestellungId);
  }

  // 20. Preisanomalie-Check
  await tryPreisanomalieCheck(supabase, bestellungId, haendlerName, analyseErgebnisse);

  // 21. Abo-Logik
  if (bestellungsart === "abo") {
    await handleAboLogik(supabase, bestellungId, haendlerDomain, haendlerName);
  }

  // 23. UNBEKANNT-Hinweis
  if (bestellerKuerzelMutable === "UNBEKANNT") {
    await supabase.from("kommentare").insert({
      bestellung_id: bestellungId,
      autor_kuerzel: "SYSTEM",
      autor_name: "Zuordnungs-Assistent",
      text: `Bestellung konnte keinem Besteller zugeordnet werden.\nHändler: ${haendlerName}\nAbsender: ${email_absender}\nBetreff: ${email_betreff || "–"}\n\nBitte manuell zuordnen.`,
    });
  }

  // 24. Webhook-Log Erfolg
  await supabase.from("webhook_logs").insert({
    typ: "email",
    status: "success",
    bestellung_id: bestellungId,
    bestellnummer: erkannteBestellnummer || null,
  });
}
