import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { RECHNUNGSORDNER } from "@/lib/eingang";

/**
 * Zaehler fuer die Navigation (Pool-Badge, Eingang-Badge).
 *
 * Beide Zahlen sind fuer alle Nutzer gleich und aendern sich selten, aber
 * das Layout fragt sie bei jedem Seitenaufruf ab. Gemessen am 08.10.2026:
 * die Eingang-Zaehlung kostet ueber PostgREST rund 200 ms pro Seite. Darum
 * wird das Ergebnis pro Server-Instanz 30 Sekunden lang wiederverwendet.
 * Ein Badge, das bis zu 30 Sekunden hinterherhinkt, stoert niemanden; die
 * Listen selbst sind immer frisch.
 */
const HALTBARKEIT_MS = 30_000;

type Zaehler = { pool: number; eingang: number };
let gemerkt: { bis: number; werte: Zaehler } | null = null;

export async function ladeNavZaehler(supabase: SupabaseClient<Database>): Promise<Zaehler> {
  if (gemerkt && gemerkt.bis > Date.now()) return gemerkt.werte;

  const [pool, eingang] = await Promise.all([
    supabase
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("archiviert_am", null)
      .eq("besteller_kuerzel", "UNBEKANNT")
      .eq("bestellungsart", "material"),
    supabase
      .from("v_rechnungseingang")
      .select("id", { count: "exact", head: true })
      .eq("ordner", RECHNUNGSORDNER)
      .eq("offen", true),
  ]);

  const werte = { pool: pool.count ?? 0, eingang: eingang.count ?? 0 };
  // Ein Fehler (count null) wird nicht gemerkt, damit der naechste Aufruf es
  // erneut versucht.
  if (pool.count !== null && eingang.count !== null) {
    gemerkt = { bis: Date.now() + HALTBARKEIT_MS, werte };
  }
  return werte;
}

/** Nach Aenderungen (Abhaken, Zuordnen) sofort frische Zahlen auf dieser Instanz. */
export function navZaehlerVergessen(): void {
  gemerkt = null;
}
