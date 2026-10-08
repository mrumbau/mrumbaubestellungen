import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Angemeldeter Nutzer aus dem Sitzungs-Token — lokal gegen den oeffentlichen
 * Schluessel des Projekts geprueft, ohne Netzaufruf (08.10.2026).
 *
 * Vorher rief jede API-Route `supabase.auth.getUser()`, einen Roundtrip zu
 * Supabase Auth (gemessen: im Schnitt 177 ms, Spitzen ueber 3 s) — obwohl die
 * Middleware dieselbe Sitzung gerade erst geprueft hatte. Die Routen brauchen
 * nur die Nutzer-ID; die steht signiert im Token.
 */
export async function angemeldeterNutzer(
  supabase: { auth: Pick<SupabaseClient["auth"], "getClaims"> },
): Promise<{ id: string } | null> {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  return typeof id === "string" && id.length > 0 ? { id } : null;
}
