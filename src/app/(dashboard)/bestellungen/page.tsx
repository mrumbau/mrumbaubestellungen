import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";
import { ScopeTabs, type PoolScope } from "@/components/bestellungen/scope-tabs";

const SCOPE_VALUES: ReadonlyArray<PoolScope> = ["pool", "mine-open", "mine-done", "all"];

function parseScope(raw: string | undefined, rolle: string | undefined): PoolScope {
  if (raw && (SCOPE_VALUES as readonly string[]).includes(raw)) {
    const view = raw as PoolScope;
    // `all` ist admin-only — Besteller fällt zurück auf `mine-open`.
    if (view === "all" && rolle !== "admin") return "mine-open";
    return view;
  }
  // Default per Rolle: admin sieht alles, Besteller startet auf eigene offene.
  return rolle === "admin" ? "all" : "mine-open";
}

// 22.05.2026 (Perf Stufe 2.8) — Dynamic-Split für BestellungenTabelle zurückgenommen.
// Grund: BestellungenTabelle hostet useRowReturnFlash (Spatial-Continuity-Afterglow
// beim Back-Navigation von Detail-Page). Mit dynamic() wird der Component-Mount
// nach popstate verzögert UND React Compiler stable@1.0.0 cached getRowClassName
// in einer Weise, die die setId-State-Update aus dem Hook nicht zuverlässig im
// Row-Render-Loop reflektiert. User-Report 22.05.: Afterglow nach Back ist weg.
// Bundle-Win war marginal (~30-50 kB), UX-Verlust war kritisch — Trade umgekehrt.
// Andere 3 Splits (dashboard-widgets, archiv-client, email-sync-client) bleiben.

// 15.05.2026 (Cold-Start-Fix): Edge-Runtime → ~0ms cold-start statt Lambda-Container.
export const runtime = "edge";
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
  searchParams: Promise<{ projekt_id?: string; view?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const { projekt_id: projektIdParam, view: viewParam } = await searchParams;
  const scope: PoolScope = parseScope(viewParam, profil?.rolle);

  // 21.05.2026 (Perf) — dokumente via FK-Embed statt sequentiellem 2. Roundtrip.
  // Vorher: Query 1 (bestellungen) parallel Query 2 (projekte), DANN Query 3
  // (dokumente.IN(ids)). Drei Roundtrips total. Jetzt: dokumente embedded in
  // bestellung-Query → 2 statt 3 Roundtrips, spart ~80-150ms.
  // Trade-off: Response wird ~30% größer (bei 500 Bestellungen × ~3 Dokus × 3
  // Nummern-Felder ≈ +50KB). Bei aktuell ~150 Bestellungen vernachlässigbar.
  //
  // 02.06.2026 (Pool Phase 2) — vorschlag_kuerzel + vorschlag_konfidenz mit
  // selektiert. Die BestellerCell zeigt sie im Pool-State als Ghost-Pill.
  let dataQuery = supabase
    .from("bestellungen")
    .select(
      "id, bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name, besteller_kuerzel, besteller_name, vorschlag_kuerzel, vorschlag_konfidenz, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_versandbestaetigung, projekt_id, projekt_name, mahnung_am, mahnung_count, created_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, ist_gutschrift, dokumente(bestellnummer_erkannt, auftragsnummer, lieferscheinnummer)",
    )
    .is("archiviert_am", null)
    .order("created_at", { ascending: false })
    .limit(HARD_CAP);

  // 02.06.2026 (Pool Phase 2) — Scope-Routing pro Tab.
  //   pool       → UNBEKANNT-Material (alle Besteller dank Phase-1-RLS)
  //   mine-open  → eigene + Abo/SU, status ≠ freigegeben (Default für Besteller)
  //   mine-done  → eigene + Abo/SU, status = freigegeben
  //   all        → kein Scope-Filter (admin-only, parseScope schützt)
  if (scope === "pool") {
    dataQuery = dataQuery
      .eq("besteller_kuerzel", "UNBEKANNT")
      .eq("bestellungsart", "material");
  } else if (scope === "mine-open" && profil) {
    if (profil.rolle === "besteller") {
      dataQuery = dataQuery.or(
        `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
      );
    }
    dataQuery = dataQuery.neq("status", "freigegeben");
  } else if (scope === "mine-done" && profil) {
    if (profil.rolle === "besteller") {
      dataQuery = dataQuery.or(
        `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
      );
    }
    dataQuery = dataQuery.eq("status", "freigegeben");
  }
  // scope === "all" → keine zusätzlichen Filter; admin-only durch parseScope.

  if (projektIdParam) {
    dataQuery = dataQuery.eq("projekt_id", projektIdParam);
  }

  // 02.06.2026 (Pool Phase 2) — Scope-Counts für die Tab-Pills.
  // Vier head:true count-Queries laufen parallel — RLS filtert pro Rolle,
  // also reflektieren die Counts die tatsächliche Sichtbarkeit des Users.
  // Bei 200 Bestellungen <50ms zusätzlich, akzeptabler Trade für Pool-UX.
  const poolCountQuery = supabase
    .from("bestellungen")
    .select("id", { count: "exact", head: true })
    .is("archiviert_am", null)
    .eq("besteller_kuerzel", "UNBEKANNT")
    .eq("bestellungsart", "material");

  let mineOpenCountQuery = supabase
    .from("bestellungen")
    .select("id", { count: "exact", head: true })
    .is("archiviert_am", null)
    .neq("status", "freigegeben");
  let mineDoneCountQuery = supabase
    .from("bestellungen")
    .select("id", { count: "exact", head: true })
    .is("archiviert_am", null)
    .eq("status", "freigegeben");
  if (profil?.rolle === "besteller") {
    mineOpenCountQuery = mineOpenCountQuery.or(
      `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
    );
    mineDoneCountQuery = mineDoneCountQuery.or(
      `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
    );
  }
  const allCountQuery = supabase
    .from("bestellungen")
    .select("id", { count: "exact", head: true })
    .is("archiviert_am", null);

  const [
    { data: bestellungen },
    { data: projekte },
    { count: poolCount },
    { count: mineOpenCount },
    { count: mineDoneCount },
    { count: allCount },
  ] = await Promise.all([
    dataQuery,
    supabase
      .from("projekte")
      .select("id, name, farbe")
      .neq("status", "archiviert")
      .order("name"),
    poolCountQuery,
    mineOpenCountQuery,
    mineDoneCountQuery,
    allCountQuery,
  ]);

  // 07.05.2026 — Doku-Nummern für Such-Index aus eingebetteten dokumente-Rows
  // extrahieren. 21.05.2026 — kein separater Roundtrip mehr, embedded via
  // FK-Join in der bestellung-Query oben.
  type BestellungMitDokus = {
    id: string;
    dokumente?: Array<{
      bestellnummer_erkannt: string | null;
      auftragsnummer: string | null;
      lieferscheinnummer: string | null;
    }> | null;
  } & Record<string, unknown>;

  const bestellungenAngereichert = ((bestellungen || []) as BestellungMitDokus[]).map((b) => {
    const dokuNummern: string[] = [];
    for (const d of b.dokumente || []) {
      if (d.bestellnummer_erkannt) dokuNummern.push(d.bestellnummer_erkannt);
      if (d.auftragsnummer) dokuNummern.push(d.auftragsnummer);
      if (d.lieferscheinnummer) dokuNummern.push(d.lieferscheinnummer);
    }
    const { dokumente: _drop, ...rest } = b;
    void _drop;
    return { ...rest, doku_nummern: dokuNummern };
  });

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

      {/* 02.06.2026 (UI-Polish): Page-Header — Title links, subtile Eyebrow rechts.
          Vorher prominentes "183 GELADEN" als 2-spaltiger Header → jetzt eine
          kompakte Eyebrow-Zeile passend zur industrial-Aesthetic. Scope-Label
          unter dem Titel kontextualisiert den aktuellen Tab.  */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Bestellungen</h1>
          <p className="text-foreground-subtle text-sm mt-1">
            {scope === "pool"
              ? "Pool — alle Material-Bestellungen ohne Besteller"
              : scope === "mine-open"
                ? "Deine offenen Bestellungen"
                : scope === "mine-done"
                  ? "Von dir freigegebene Bestellungen"
                  : "Alle Bestellungen"}
          </p>
        </div>
        <div
          className="hidden md:flex items-baseline gap-1.5 shrink-0 text-[10px] font-semibold tracking-widest uppercase text-foreground-subtle"
          aria-live="polite"
        >
          <span className="font-mono-amount text-foreground text-xs tabular-nums">
            {total.toLocaleString("de-DE")}
          </span>
          <span className="text-foreground-faint">
            {reachedCap ? `≥ ${HARD_CAP}` : "geladen"}
          </span>
        </div>
      </div>

      {/* ScopeTabs als Primary-Navigation. Underline-Style + border-b bildet
          die klare Top-Hierarchie über alle Sub-Filter (ArtTabs, FilterBar).  */}
      <div className="mb-5">
        <ScopeTabs
          active={scope}
          preservedSearchParams={projektIdParam ? { projekt_id: projektIdParam } : undefined}
          tabs={[
            { key: "pool", label: "Pool", count: poolCount ?? 0 },
            { key: "mine-open", label: "Meine offen", count: mineOpenCount ?? 0 },
            { key: "mine-done", label: "Meine erledigt", count: mineDoneCount ?? 0 },
            {
              key: "all",
              label: "Alle",
              count: allCount ?? 0,
              hidden: profil?.rolle !== "admin",
            },
          ]}
        />
      </div>

      {reachedCap && (
        <div className="mb-4 rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-[12px] text-warning">
          Hard-Cap von {HARD_CAP} Bestellungen erreicht. Älteste Einträge werden nicht angezeigt — bitte archivieren oder Server-Pagination einführen.
        </div>
      )}

      <BestellungenTabelle
        bestellungen={bestellungenAngereichert as unknown as import("@/components/bestellungen/types").Bestellung[]}
        projekte={(projekte || []) as unknown as { id: string; name: string; farbe: string }[]}
        aktiverProjektFilter={projektIdParam || null}
        aktiverProjektName={aktiverProjektName}
        isAdmin={profil?.rolle === "admin"}
        scope={scope}
      />
    </div>
  );
}
