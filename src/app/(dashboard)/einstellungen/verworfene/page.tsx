import { createServerSupabaseClient } from "@/lib/supabase-server";
import { VerworfeneClient, AUDIT_CUTOFF_ISO, type VerworfeneEntry } from "./verworfene-client";

export const dynamic = "force-dynamic";

/**
 * /einstellungen/verworfene
 *
 * Audit-View: wer hat wann welche Mail verworfen? Quelle: `verworfene_emails`-
 * Tabelle (wird vom Verwerfen-Action-Endpoint befüllt). Liefert Absender,
 * Subject, Verworfen-von-Kürzel + Zeitstempel.
 *
 * 21.05.2026 — Cutoff bei 18.05.2026 14:19 Berliner Zeit. Frühere Einträge
 * (Test-Verwerfungen + MH-Spam-Cleanup) werden NICHT angezeigt, damit die
 * Audit-Sicht für alle Mitarbeiter mit dem ersten "echten" Eintrag (WK
 * Transport / CR) startet. Siehe `AUDIT_CUTOFF_ISO` in verworfene-client.tsx.
 *
 * Zugang: alle eingeloggten User (RLS-Policy `alle_authenticated_select_verworfene`).
 */
export default async function VerworfenePage() {
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("verworfene_emails")
    .select(
      "id, absender_adresse, absender_domain, email_betreff, verworfen_von, created_at, bestellung_id, bestellnummer, betrag, dokumente_snapshot",
    )
    .gte("created_at", AUDIT_CUTOFF_ISO)
    .order("created_at", { ascending: false })
    .limit(500);

  return <VerworfeneClient initialEntries={(rows as unknown as VerworfeneEntry[]) || []} />;
}
