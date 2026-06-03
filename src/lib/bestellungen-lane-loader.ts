/**
 * Bestellungen Lane-Loader (UX-R2, 03.06.2026).
 *
 * Eine Server-Funktion, die für eine gegebene Lane (`pool`, `in-arbeit`,
 * `archiv`) und URL-Params alle nötigen Daten lädt: Bestellungen, drei
 * Lane-Counts, Projekte, Besteller-Optionen, plus Pool-spezifische
 * Sprint-2/3-Daten wenn die Lane = Pool ist.
 *
 * Die 3 Lane-Pages (`/bestellungen/pool`, `/bestellungen/in-arbeit`,
 * `/bestellungen/archiv`) rufen diese Funktion auf und reichen das Result
 * an die Workspace-Shell durch. Single-Source-of-Truth für Server-Queries —
 * keine 3-fache Duplikation des großen page.tsx-Codes.
 *
 * **Filter-Schichtung:**
 *   1. Lane (server) — bestimmt besteller_kuerzel + status + bestellungsart-Default
 *   2. Art-Chips (server) — `?art=material,abo` schmälert bestellungsart
 *   3. Projekt (server) — `?projekt_id=...` schmälert auf Projekt
 *   4. Status (client) — `?status=offen` schmälert weiter (nur In-Arbeit relevant)
 *   5. Suche (client) — fuzzy-match auf Bestellnr/Vendor/Projekt
 *
 * Schichten 1-3 sind Server-Filter (PostgreSQL macht die Arbeit), Schichten
 * 4-5 sind Client-Filter (kein extra Roundtrip nötig). Lane-Counts werden
 * IMMER mit nur Schicht-1-Filter berechnet — sie sind die "globale Sicht"
 * für die LaneNav, nicht die "wieviel zeigt grade meine Tabelle".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { type Lane, isLane } from "@/components/bestellungen/lane-config";
import {
  type Bestellungsart,
  parseArtFilter,
} from "@/components/bestellungen/art-filter-chips";

// Reuse den Bestellungs-Type aus dem existing Modul
import type { Bestellung, ProjektOption } from "@/components/bestellungen/types";

export const HARD_CAP = 500;

const BESTELLUNG_SELECT =
  "id, bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name, haendler_id, besteller_kuerzel, besteller_name, vorschlag_kuerzel, vorschlag_konfidenz, zuordnung_methode, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_versandbestaetigung, projekt_id, projekt_name, mahnung_am, mahnung_count, created_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, ist_gutschrift, updated_at, dokumente(bestellnummer_erkannt, auftragsnummer, lieferscheinnummer)";

export interface LaneLoadParams {
  lane: Lane;
  art?: string | null;
  projektId?: string | null;
  /** Admin-only: "alle" zeigt Bestellungen aller Owner (für Admin-In-Arbeit). */
  owner?: string | null;
}

export interface UserProfil {
  user_id: string;
  kuerzel: string;
  rolle: string;
  name: string;
}

export interface LaneLoadResult {
  bestellungen: Bestellung[];
  projekte: ProjektOption[];
  bestellerOptions: Array<{ kuerzel: string; name: string }>;
  counts: Record<Lane, number>;
  reachedCap: boolean;
  total: number;
  aktiverProjektName: string | null;
  // Pool-Sprint-2/3-Daten (nur befüllt wenn lane="pool")
  poolUserStateById?: Record<string, { seen: boolean; deferred: boolean }>;
  poolReservationsById?: Record<
    string,
    { user_kuerzel: string; user_name: string; expires_at: string; bestellung_id: string }
  >;
  vendorDomainById?: Record<string, string | null>;
  haendlerIdByBestellungId?: Record<string, string | null>;
  isAutoClaimedById?: Record<string, boolean>;
  scoreWeights?: import("@/lib/pool-score").PoolScoreWeights;
  vendorAffinity?: Record<string, number>;
  projektAffinity?: Record<string, number>;
  scoreTopXThreshold?: number;
}

/**
 * Builds the server-side WHERE-Clauses für eine Lane.
 *
 * - **pool:** besteller_kuerzel='UNBEKANNT' AND bestellungsart='material'.
 *   Status ist nicht gefiltert (Pool kann offen/abweichung sein).
 * - **in-arbeit:** Besteller sieht eigene + Abo/SU, status ≠ freigegeben +
 *   archiv-states. Admin sieht alle aktiven (oder via `?owner=alle` explizit).
 * - **archiv:** Besteller sieht eigene + Abo/SU, status IN
 *   (freigegeben, verworfen, storniert). Admin sieht alle.
 *
 * Hinweis: Supabase-Filter-Builder-Types sind 6-Level-deep verschachtelt
 * (PostgrestQuery → PostgrestFilter mit Schema-Shape). Hier pragmatisch
 * `any` als Type, da die Helper-Funktion sowohl auf die select-Query (für
 * head:true count) als auch die select(...).is(...).order(...)-Query
 * (für Daten) angewandt wird — beide Branches der fluent API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLaneFilter(query: any, lane: Lane, profil: UserProfil | null, owner?: string | null): any {
  if (lane === "pool") {
    return query
      .eq("besteller_kuerzel", "UNBEKANNT")
      .eq("bestellungsart", "material");
  }

  const isAdmin = profil?.rolle === "admin";
  const showAllOwners = isAdmin && owner === "alle";

  if (lane === "in-arbeit") {
    let q = query;
    if (profil && !showAllOwners) {
      q = q.or(
        `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
      );
    }
    q = q.not("status", "in", "(freigegeben,verworfen,storniert)");
    return q;
  }

  if (lane === "archiv") {
    let q = query;
    if (profil && !showAllOwners) {
      q = q.or(
        `besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`,
      );
    }
    q = q.in("status", ["freigegeben", "verworfen", "storniert"]);
    return q;
  }

  return query;
}

export async function loadLaneData(
  supabase: SupabaseClient,
  params: LaneLoadParams,
  profil: UserProfil | null,
): Promise<LaneLoadResult> {
  const lane = isLane(params.lane) ? params.lane : "pool";
  const artFilter = parseArtFilter(params.art);

  // Hauptquery — bestellungen für die aktuelle Lane
  let dataQuery = supabase
    .from("bestellungen")
    .select(BESTELLUNG_SELECT)
    .is("archiviert_am", null)
    .order("created_at", { ascending: false })
    .limit(HARD_CAP);

  dataQuery = applyLaneFilter(dataQuery, lane, profil, params.owner ?? null);

  // Art-Filter (Quick-Chips)
  if (artFilter.size > 0) {
    const arten = Array.from(artFilter);
    dataQuery = dataQuery.in("bestellungsart", arten as Bestellungsart[]);
  }

  // Projekt-Filter
  if (params.projektId) {
    dataQuery = dataQuery.eq("projekt_id", params.projektId);
  }

  // Lane-Counts — drei head:true count-queries parallel, NUR Schicht-1-Filter
  const poolCountQuery = applyLaneFilter(
    supabase
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("archiviert_am", null),
    "pool",
    profil,
    null,
  );
  const inArbeitCountQuery = applyLaneFilter(
    supabase
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("archiviert_am", null),
    "in-arbeit",
    profil,
    params.owner ?? null,
  );
  const archivCountQuery = applyLaneFilter(
    supabase
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("archiviert_am", null),
    "archiv",
    profil,
    params.owner ?? null,
  );

  // Pool-Sprint-2/3-Queries (nur relevant für die Pool-Lane). 03.06.2026 —
  // Defensive: jede Sub-Query wird mit safeData() gewrapped damit eine
  // fehlende Tabelle/View oder ein RLS-Fail nicht die komplette Pool-Lane
  // killt. Promise.all rejected sonst hart, was zum error.tsx-Fallback führt
  // und PageHero + LaneNav verschwinden lässt.
  const safeData = <T>(p: PromiseLike<{ data: T | null }>): Promise<{ data: T | null }> =>
    Promise.resolve(p).then(
      (r) => r ?? { data: null },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[lane-loader] sub-query failed:", err);
        return { data: null };
      },
    );

  const isPool = lane === "pool";
  const poolUserStateQuery: Promise<{ data: unknown }> =
    isPool && profil
      ? safeData(
          supabase
            .from("pool_user_state")
            .select("bestellung_id, seen_at, snoozed_until, deferred_today")
            .eq("user_id", profil.user_id),
        )
      : Promise.resolve({ data: [] });
  const reservationQuery: Promise<{ data: unknown }> = isPool
    ? safeData(
        supabase
          .from("pool_reservations")
          .select("bestellung_id, user_kuerzel, user_name, expires_at")
          .gt("expires_at", new Date().toISOString()),
      )
    : Promise.resolve({ data: [] });
  const haendlerQuery: Promise<{ data: unknown }> = isPool
    ? safeData(supabase.from("haendler").select("name, domain"))
    : Promise.resolve({ data: [] });
  const vendorAffinityQuery: Promise<{ data: unknown }> =
    isPool && profil
      ? safeData(
          supabase
            .from("vw_user_vendor_affinity")
            .select("haendler_id, ratio")
            .eq("besteller_kuerzel", profil.kuerzel),
        )
      : Promise.resolve({ data: [] });
  const projektAffinityQuery: Promise<{ data: unknown }> =
    isPool && profil
      ? safeData(
          supabase
            .from("vw_user_projekt_affinity")
            .select("projekt_id, ratio")
            .eq("besteller_kuerzel", profil.kuerzel),
        )
      : Promise.resolve({ data: [] });
  const scoreSettingsQuery: Promise<{ data: unknown }> = isPool
    ? safeData(
        supabase
          .from("firma_einstellungen")
          .select("schluessel, wert")
          .in("schluessel", ["pool_score_weights", "pool_score_top_x_threshold"]),
      )
    : Promise.resolve({ data: [] });

  const [
    { data: bestellungenRaw },
    { data: projekteRaw },
    { data: bestellerRollenRaw },
    { count: poolCount },
    { count: inArbeitCount },
    { count: archivCount },
    { data: poolUserStateRows },
    { data: reservationRows },
    { data: haendlerRows },
    { data: vendorAffRows },
    { data: projektAffRows },
    { data: poolScoreSettings },
  ] = await Promise.all([
    dataQuery,
    supabase
      .from("projekte")
      .select("id, name, farbe")
      .neq("status", "archiviert")
      .order("name"),
    supabase
      .from("benutzer_rollen")
      .select("kuerzel, name, rolle")
      .in("rolle", ["besteller", "admin"])
      .order("kuerzel"),
    poolCountQuery,
    inArbeitCountQuery,
    archivCountQuery,
    poolUserStateQuery,
    reservationQuery,
    haendlerQuery,
    vendorAffinityQuery,
    projektAffinityQuery,
    scoreSettingsQuery,
  ]);

  // Doku-Nummern-Aufbereitung (gleicher Pattern wie alte page.tsx)
  type BestellungMitDokus = {
    id: string;
    dokumente?: Array<{
      bestellnummer_erkannt: string | null;
      auftragsnummer: string | null;
      lieferscheinnummer: string | null;
    }> | null;
  } & Record<string, unknown>;

  const bestellungenAngereichert = ((bestellungenRaw || []) as BestellungMitDokus[]).map(
    (b) => {
      const dokuNummern: string[] = [];
      for (const d of b.dokumente || []) {
        if (d.bestellnummer_erkannt) dokuNummern.push(d.bestellnummer_erkannt);
        if (d.auftragsnummer) dokuNummern.push(d.auftragsnummer);
        if (d.lieferscheinnummer) dokuNummern.push(d.lieferscheinnummer);
      }
      const { dokumente: _drop, ...rest } = b;
      void _drop;
      return { ...rest, doku_nummern: dokuNummern };
    },
  );

  const total = bestellungenRaw?.length ?? 0;
  const reachedCap = total >= HARD_CAP;

  const projekte = (projekteRaw || []) as unknown as ProjektOption[];
  const aktiverProjektName = params.projektId
    ? projekte.find((p) => p.id === params.projektId)?.name || null
    : null;

  const bestellerOptions = ((bestellerRollenRaw || []) as Array<{
    kuerzel: string;
    name: string;
  }>).map((b) => ({ kuerzel: b.kuerzel, name: b.name }));

  const counts: Record<Lane, number> = {
    pool: poolCount ?? 0,
    "in-arbeit": inArbeitCount ?? 0,
    archiv: archivCount ?? 0,
  };

  const result: LaneLoadResult = {
    bestellungen: bestellungenAngereichert as unknown as Bestellung[],
    projekte,
    bestellerOptions,
    counts,
    reachedCap,
    total,
    aktiverProjektName,
  };

  if (!isPool) return result;

  // Pool-Spezifika ergänzen
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
      continue;
    }
    userState[row.bestellung_id] = {
      seen: !!row.seen_at,
      deferred: !!row.deferred_today,
    };
  }

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

  const haendlerDomainByName = new Map<string, string>();
  for (const h of (haendlerRows ?? []) as Array<{ name: string; domain: string }>) {
    haendlerDomainByName.set(h.name.toLowerCase(), h.domain);
  }

  const bestellungenAfterSnooze = result.bestellungen.filter(
    (b) => !snoozedActive.has(b.id),
  );
  result.bestellungen = bestellungenAfterSnooze;

  const vendorDomainById: Record<string, string | null> = {};
  const haendlerIdByBestellungId: Record<string, string | null> = {};
  const isAutoClaimedById: Record<string, boolean> = {};
  for (const b of bestellungenAfterSnooze) {
    const bAny = b as unknown as Record<string, unknown>;
    const name = (bAny.haendler_name as string | null | undefined) ?? "";
    const cleanName = name
      .replace(/^Unbekannter Lieferant \((.+)\)$/, "$1")
      .toLowerCase()
      .trim();
    vendorDomainById[bAny.id as string] = haendlerDomainByName.get(cleanName) ?? null;
    haendlerIdByBestellungId[bAny.id as string] =
      (bAny.haendler_id as string | null | undefined) ?? null;
    const zMethode = (bAny.zuordnung_methode as string | null | undefined) ?? "";
    isAutoClaimedById[bAny.id as string] = zMethode.startsWith("auto_high_confidence:");
  }

  const vendorAffinity: Record<string, number> = {};
  for (const row of (vendorAffRows ?? []) as Array<{
    haendler_id: string | null;
    ratio: number | null;
  }>) {
    if (row.haendler_id && typeof row.ratio === "number") {
      vendorAffinity[row.haendler_id] = row.ratio;
    }
  }
  const projektAffinity: Record<string, number> = {};
  for (const row of (projektAffRows ?? []) as Array<{
    projekt_id: string | null;
    ratio: number | null;
  }>) {
    if (row.projekt_id && typeof row.ratio === "number") {
      projektAffinity[row.projekt_id] = row.ratio;
    }
  }

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
  const scoreTopXThresholdRaw = parseFloat(
    scoreSettingsMap.get("pool_score_top_x_threshold") ?? "0.8",
  );
  const scoreTopXThreshold = Number.isFinite(scoreTopXThresholdRaw)
    ? scoreTopXThresholdRaw
    : 0.8;

  return {
    ...result,
    poolUserStateById: userState,
    poolReservationsById: initialReservations,
    vendorDomainById,
    haendlerIdByBestellungId,
    isAutoClaimedById,
    scoreWeights,
    vendorAffinity,
    projektAffinity,
    scoreTopXThreshold,
  };
}
