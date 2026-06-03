import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";
import { ScopeTabs, type PoolScope } from "@/components/bestellungen/scope-tabs";
import { PageHeader, PageHeaderCount } from "@/components/ui/page-header";
import { InboxLayoutToggle, type PoolLayout } from "@/components/bestellungen/inbox-layout-toggle";

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
      // 03.06.2026 (Pool 2.0 Sprint 3) — haendler_id + zuordnung_methode
      // zusätzlich für Score-Affinity bzw. Auto-Claim-Pin in der UI.
      "id, bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name, haendler_id, besteller_kuerzel, besteller_name, vorschlag_kuerzel, vorschlag_konfidenz, zuordnung_methode, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_versandbestaetigung, projekt_id, projekt_name, mahnung_am, mahnung_count, created_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, ist_gutschrift, dokumente(bestellnummer_erkannt, auftragsnummer, lieferscheinnummer)",
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
    { data: bestellerRollen },
    { data: poolUserStateRows },
    { data: reservationRows },
    { data: haendlerRows },
    { data: userConfigRow },
    { data: vendorAffRows },
    { data: projektAffRows },
    { data: poolScoreSettings },
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
    // 03.06.2026 (Pool 2.0 Sprint 1) — Besteller-Optionen für den PoolQuickDrawer.
    // OwnerLane braucht Reassign-Targets; ohne diese Liste fehlt der CTA.
    // Kleine Query (≤ 4 Rows), parallel zu den Count-Queries, vernachlässigbarer
    // Cost.
    supabase
      .from("benutzer_rollen")
      .select("kuerzel, name, rolle")
      .in("rolle", ["besteller", "admin"])
      .order("kuerzel"),
    // 03.06.2026 (Pool 2.0 Sprint 2) — eigener Pool-State (seen/snoozed/
    // deferred). Wir filtern client-side, weil wir sowieso die ganze
    // Pool-Liste laden — der Server-side-Join würde nichts sparen, und
    // ein clientseitiges-Snoozen ohne Refresh ist UX-Vorteil.
    profil
      ? supabase
          .from("pool_user_state")
          .select("bestellung_id, seen_at, snoozed_until, deferred_today")
          .eq("user_id", profil.user_id)
      : Promise.resolve({ data: [] }),
    // Snapshot der aktiven Reservations für Realtime-Hydration.
    supabase
      .from("pool_reservations")
      .select("bestellung_id, user_kuerzel, user_name, expires_at")
      .gt("expires_at", new Date().toISOString()),
    // Vendor-Domain-Map für VendorFavicon — kommt aus haendler-Tabelle,
    // gejoined via haendler_name (Pool-Items haben oft noch keine
    // haendler_id, aber der Pipeline-Defensiv-Fall hat den Namen).
    supabase.from("haendler").select("name, domain"),
    // User-Layout-Pref aus dashboard_config (Sprint 2 — Inbox vs Tabelle).
    // profil.user_id existiert wenn profil gesetzt; sonst skip.
    profil
      ? supabase
          .from("benutzer_rollen")
          .select("dashboard_config")
          .eq("user_id", profil.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // 03.06.2026 (Pool 2.0 Sprint 3) — Affinity-Views für Pool-Score.
    // Schmale Maps (~10-30 Rows): pro Vendor/Projekt der Anteil dieses Users.
    // Score-Lib in pool-inbox.tsx mischt sie mit Age/Urgency/Vorschlag.
    profil
      ? supabase
          .from("vw_user_vendor_affinity")
          .select("haendler_id, ratio")
          .eq("besteller_kuerzel", profil.kuerzel)
      : Promise.resolve({ data: [] }),
    profil
      ? supabase
          .from("vw_user_projekt_affinity")
          .select("projekt_id, ratio")
          .eq("besteller_kuerzel", profil.kuerzel)
      : Promise.resolve({ data: [] }),
    // Score-Gewichte + Top-X-Schwelle aus firma_einstellungen.
    supabase
      .from("firma_einstellungen")
      .select("schluessel, wert")
      .in("schluessel", ["pool_score_weights", "pool_score_top_x_threshold"]),
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

  // 03.06.2026 (Pool 2.0 Sprint 2) — Pool-User-State Map.
  //   userState[id] = { seen, deferred } pro Pool-Item
  //   snoozedUntilNow = Set der IDs die aktuell snoozed sind (aus Pool ausblenden)
  type PoolUserStateRow = {
    bestellung_id: string;
    seen_at: string | null;
    snoozed_until: string | null;
    deferred_today: boolean | null;
  };
  const nowIso = new Date().toISOString();
  const userState: Record<string, { seen: boolean; deferred: boolean }> = {};
  const snoozedActive = new Set<string>();
  for (const row of (poolUserStateRows ?? []) as PoolUserStateRow[]) {
    if (row.snoozed_until && row.snoozed_until > nowIso) {
      snoozedActive.add(row.bestellung_id);
      continue; // snoozed IDs werden gar nicht erst in userState gelegt
    }
    userState[row.bestellung_id] = {
      seen: !!row.seen_at,
      deferred: !!row.deferred_today,
    };
  }

  // 03.06.2026 (Pool 2.0 Sprint 2) — Reservation-Snapshot für Inbox-Hydration.
  type ReservationRow = {
    bestellung_id: string;
    user_kuerzel: string;
    user_name: string;
    expires_at: string;
  };
  const initialReservations: Record<string, ReservationRow> = {};
  for (const row of (reservationRows ?? []) as ReservationRow[]) {
    initialReservations[row.bestellung_id] = row;
  }

  // 03.06.2026 (Pool 2.0 Sprint 2) — Vendor-Domain-Lookup via haendler_name.
  // Case-insensitive Match damit die Pipeline-Defensive ("Unbekannter
  // Lieferant (X)") trotzdem mit der haendler-Tabelle joined.
  const haendlerDomainByName = new Map<string, string>();
  for (const h of (haendlerRows ?? []) as Array<{ name: string; domain: string }>) {
    haendlerDomainByName.set(h.name.toLowerCase(), h.domain);
  }
  const vendorDomainById: Record<string, string | null> = {};

  // Snooze-Filter: nur im Pool-Scope aktiv (in anderen Scopes sind
  // Bestellungen schon zugewiesen, Snooze irrelevant).
  const bestellungenAfterSnooze =
    scope === "pool"
      ? bestellungenAngereichert.filter((b) => !snoozedActive.has(b.id as string))
      : bestellungenAngereichert;

  // 03.06.2026 (Pool 2.0 Sprint 3) — pro-Bestellung haendler_id-Map +
  // Auto-Claim-Set basierend auf zuordnung_methode.
  const haendlerIdByBestellungId: Record<string, string | null> = {};
  const isAutoClaimedById: Record<string, boolean> = {};
  for (const b of bestellungenAfterSnooze) {
    const bAny = b as Record<string, unknown>;
    const name = (bAny.haendler_name as string | null | undefined) ?? "";
    // Pipeline-Defensive entfernen für Match
    const cleanName = name.replace(/^Unbekannter Lieferant \((.+)\)$/, "$1").toLowerCase().trim();
    vendorDomainById[bAny.id as string] = haendlerDomainByName.get(cleanName) ?? null;
    haendlerIdByBestellungId[bAny.id as string] = (bAny.haendler_id as string | null | undefined) ?? null;
    const zMethode = (bAny.zuordnung_methode as string | null | undefined) ?? "";
    isAutoClaimedById[bAny.id as string] = zMethode.startsWith("auto_high_confidence:");
  }

  // 03.06.2026 (Pool 2.0 Sprint 3) — Affinity-Maps für Pool-Score.
  const vendorAffinity: Record<string, number> = {};
  for (const row of (vendorAffRows ?? []) as Array<{ haendler_id: string | null; ratio: number | null }>) {
    if (row.haendler_id && typeof row.ratio === "number") {
      vendorAffinity[row.haendler_id] = row.ratio;
    }
  }
  const projektAffinity: Record<string, number> = {};
  for (const row of (projektAffRows ?? []) as Array<{ projekt_id: string | null; ratio: number | null }>) {
    if (row.projekt_id && typeof row.ratio === "number") {
      projektAffinity[row.projekt_id] = row.ratio;
    }
  }

  // 03.06.2026 (Pool 2.0 Sprint 3) — Score-Gewichte + Top-X-Threshold aus
  // firma_einstellungen mit Defaults aus der Lib falls Settings leer.
  const scoreSettingsMap = new Map(
    ((poolScoreSettings ?? []) as Array<{ schluessel: string; wert: string }>).map(
      (s) => [s.schluessel, s.wert] as const,
    ),
  );
  let scoreWeights: import("@/lib/pool-score").PoolScoreWeights | undefined;
  try {
    const raw = scoreSettingsMap.get("pool_score_weights");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Nur known-Keys übernehmen, Rest defaultet aus der Lib
      scoreWeights = {
        age: typeof parsed.age === "number" ? parsed.age : 0.3,
        urgency: typeof parsed.urgency === "number" ? parsed.urgency : 0.25,
        vorschlag_konf: typeof parsed.vorschlag_konf === "number" ? parsed.vorschlag_konf : 0.2,
        projekt_aff: typeof parsed.projekt_aff === "number" ? parsed.projekt_aff : 0.15,
        vendor_aff: typeof parsed.vendor_aff === "number" ? parsed.vendor_aff : 0.1,
      };
    }
  } catch {
    // Defekte JSON → undefined → Lib-Defaults greifen
  }
  const scoreTopXThreshold = parseFloat(
    scoreSettingsMap.get("pool_score_top_x_threshold") ?? "0.8",
  );

  // 03.06.2026 (Pool 2.0 Sprint 2) — Layout-Pref aus dashboard_config lesen.
  const userConfig = (userConfigRow?.dashboard_config as { pool_layout?: PoolLayout } | null) ?? null;
  const poolLayoutDefault: PoolLayout = userConfig?.pool_layout === "table" ? "table" : "inbox";

  const scopeDescription =
    scope === "pool"
      ? "Pool — Material-Bestellungen ohne Besteller. Jeder kann übernehmen."
      : scope === "mine-open"
        ? "Deine offenen Bestellungen"
        : scope === "mine-done"
          ? "Von dir freigegebene Bestellungen"
          : "Alle Bestellungen";

  const breadcrumbs =
    projektIdParam && aktiverProjektName
      ? [
          { label: "Bestellungen", href: "/bestellungen" },
          { label: aktiverProjektName },
        ]
      : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workflow"
        title="Bestellungen"
        description={scopeDescription}
        breadcrumbs={breadcrumbs}
        actions={
          <PageHeaderCount
            count={total}
            label={reachedCap ? `≥ ${HARD_CAP} geladen` : "geladen"}
            pluralLabel={reachedCap ? `≥ ${HARD_CAP} geladen` : "geladen"}
          />
        }
      />

      {/* ScopeTabs als Primary-Navigation. Underline-Style + border-b bildet
          die klare Top-Hierarchie über alle Sub-Filter (ArtTabs, FilterBar).
          Im Pool-Scope sitzt rechts der Layout-Toggle (Inbox vs Tabelle). */}
      <div className="flex items-end justify-between gap-3">
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
        {scope === "pool" && profil && (
          <InboxLayoutToggle initial={poolLayoutDefault} />
        )}
      </div>

      {reachedCap && (
        <div className="mb-4 rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-[12px] text-warning">
          Hard-Cap von {HARD_CAP} Bestellungen erreicht. Älteste Einträge werden nicht angezeigt — bitte archivieren oder Server-Pagination einführen.
        </div>
      )}

      <BestellungenTabelle
        bestellungen={bestellungenAfterSnooze as unknown as import("@/components/bestellungen/types").Bestellung[]}
        projekte={(projekte || []) as unknown as { id: string; name: string; farbe: string }[]}
        aktiverProjektFilter={projektIdParam || null}
        aktiverProjektName={aktiverProjektName}
        isAdmin={profil?.rolle === "admin"}
        scope={scope}
        profil={profil ? { kuerzel: profil.kuerzel, rolle: profil.rolle, name: profil.name } : null}
        bestellerOptions={(bestellerRollen || []).map((b) => ({ kuerzel: b.kuerzel, name: b.name }))}
        poolLayout={scope === "pool" ? poolLayoutDefault : "table"}
        poolUserStateById={userState}
        poolReservationsById={initialReservations}
        vendorDomainById={vendorDomainById}
        haendlerIdByBestellungId={haendlerIdByBestellungId}
        isAutoClaimedById={isAutoClaimedById}
        scoreWeights={scoreWeights}
        vendorAffinity={vendorAffinity}
        projektAffinity={projektAffinity}
        scoreTopXThreshold={Number.isFinite(scoreTopXThreshold) ? scoreTopXThreshold : 0.8}
      />
    </div>
  );
}
