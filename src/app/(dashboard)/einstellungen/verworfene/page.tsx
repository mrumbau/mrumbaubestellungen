import { createServerSupabaseClient } from "@/lib/supabase-server";
import { VerworfeneClient, type VerworfeneEntry } from "./verworfene-client";

export const dynamic = "force-dynamic";

/**
 * /einstellungen/system/verworfene
 *
 * Audit-View: wer hat wann welche Mail verworfen? Quelle: `verworfene_emails`-
 * Tabelle (wird vom Verwerfen-Action-Endpoint befüllt). Liefert Absender,
 * Subject, Verworfen-von-Kürzel + Zeitstempel — keine Betrag/BN, dafür braucht's
 * eine Korrelation via events (siehe Sidebar im Client).
 *
 * Role-gate: parent /einstellungen/system/layout.tsx redirected Nicht-Admin.
 */
export default async function VerworfenePage() {
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("verworfene_emails")
    .select("id, absender_adresse, absender_domain, email_betreff, verworfen_von, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  return <VerworfeneClient initialEntries={(rows as VerworfeneEntry[]) || []} />;
}
