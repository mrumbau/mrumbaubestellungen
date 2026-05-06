import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";

export const dynamic = "force-dynamic";

// 07.05.2026 — Pagination komplett client-side.
// Vorher: server-side range(0,19) + client-side filter → mathematischer Unfug
// (Filter sah nur 20er-Ausschnitt, Sort funktionierte nur lokal pro Page,
// Saved-Views "Überfällig" zeigten leere Page weil Server-Sort nicht zur
// Client-Sort passte). Bei aktuell 113 aktiven Bestellungen ist alles-laden
// trivial (~30 KB gzipped). Cap bei 500 — darüber hinaus Server-Pagination
// nötig (dann Re-Architektur).
const HARD_CAP = 500;

export default async function BestellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ projekt_id?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const { projekt_id: projektIdParam } = await searchParams;

  let dataQuery = supabase
    .from("bestellungen")
    .select(
      "id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_versandbestaetigung, projekt_id, projekt_name, mahnung_am, mahnung_count, created_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz",
    )
    .is("archiviert_am", null)
    .order("created_at", { ascending: false })
    .limit(HARD_CAP);

  // Besteller: eigene Material-Bestellungen + alle Abo/SU Bestellungen (Freigabe durch jeden Besteller möglich)
  if (profil?.rolle === "besteller") {
    dataQuery = dataQuery.or(
      `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
    );
  }

  if (projektIdParam) {
    dataQuery = dataQuery.eq("projekt_id", projektIdParam);
  }

  const [{ data: bestellungen }, { data: projekte }] = await Promise.all([
    dataQuery,
    supabase
      .from("projekte")
      .select("id, name, farbe")
      .neq("status", "archiviert")
      .order("name"),
  ]);

  // Audit-Trail-Spalte: events-Count für ALLE geladenen Bestellungen
  // (vorher war es nur für die 20 der server-side-Page → jetzt für alle).
  const ids = (bestellungen || []).map((b) => b.id);
  const eventCountMap: Record<string, { count: number; lastAt: string | null }> = {};
  if (ids.length > 0) {
    const { data: summaries } = await supabase
      .from("bestellung_event_summary")
      .select("bestellung_id, event_count, last_event_at")
      .in("bestellung_id", ids);
    for (const s of summaries || []) {
      if (s.bestellung_id) {
        eventCountMap[s.bestellung_id] = {
          count: s.event_count ?? 0,
          lastAt: s.last_event_at ?? null,
        };
      }
    }
  }

  const total = bestellungen?.length ?? 0;
  const reachedCap = total >= HARD_CAP;

  const aktiverProjektName = projektIdParam
    ? (projekte || []).find((p) => p.id === projektIdParam)?.name || null
    : null;

  const aktiverProjektFarbe = projektIdParam
    ? (projekte || []).find((p) => p.id === projektIdParam)?.farbe || "#570006"
    : null;

  return (
    <div>
      {/* Breadcrumb bei Projekt-Filter */}
      {projektIdParam && aktiverProjektName && (
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <a href="/bestellungen" className="text-foreground-subtle hover:text-brand transition-colors">Bestellungen</a>
          <svg className="w-3.5 h-3.5 text-foreground-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: aktiverProjektFarbe || "#570006" }} />
            {aktiverProjektName}
          </span>
        </nav>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Bestellungen</h1>
          <p className="text-foreground-subtle text-sm mt-1">
            {profil?.rolle === "admin"
              ? "Alle Bestellungen"
              : "Deine Bestellungen"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-amount text-xs text-foreground-subtle">{total}</span>
          <span className="text-[10px] text-foreground-faint uppercase tracking-wide">
            {reachedCap ? `≥ ${HARD_CAP}` : "Geladen"}
          </span>
        </div>
      </div>

      {reachedCap && (
        <div className="mb-4 rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-[12px] text-warning">
          Hard-Cap von {HARD_CAP} Bestellungen erreicht. Älteste Einträge werden nicht angezeigt — bitte archivieren oder Server-Pagination einführen.
        </div>
      )}

      <BestellungenTabelle
        bestellungen={bestellungen || []}
        projekte={(projekte || []) as { id: string; name: string; farbe: string }[]}
        aktiverProjektFilter={projektIdParam || null}
        aktiverProjektName={aktiverProjektName}
        isAdmin={profil?.rolle === "admin"}
        eventCountMap={eventCountMap}
      />
    </div>
  );
}
