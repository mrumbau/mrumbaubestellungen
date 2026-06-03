/**
 * Lane-Config — Posteingang-IA für /bestellungen (UX-R2, 03.06.2026).
 *
 * Drei Lanes ersetzen die alte 4-Tab-Scope-Architektur (Pool / Meine offen /
 * Meine erledigt / Alle). Pro Lane sind die Server-Filter, die Layout-DNA
 * (Inbox vs Tabelle), die Page-Hero-Texte und die Empty-State-Texte
 * deklarativ definiert. Single-Source-of-Truth — die LaneNav, die Page-Loader
 * und die Workspace-Shell konsumieren alle dieselbe Tabelle.
 *
 * **Hinter den Kulissen:** Pool-Lane = UNBEKANNT-Material. In-Arbeit-Lane =
 * eigene + Abo/SU, status ≠ freigegeben. Archiv-Lane = eigene + Abo/SU,
 * status = freigegeben PLUS verworfen/storniert (Archiv ist Endzustand,
 * nicht nur Freigegeben).
 *
 * **Admin-View:** "In Arbeit" enthält alle aktiven Bestellungen über alle
 * Besteller (nicht nur eigene). "Archiv" enthält alle freigegebenen über
 * alle Besteller. Owner-Spalte erscheint in der Tabelle. Das deckt den
 * heutigen "Alle"-Tab ab.
 */

export type Lane = "pool" | "in-arbeit" | "archiv";

export const LANES: ReadonlyArray<Lane> = ["pool", "in-arbeit", "archiv"];

/**
 * Legacy Pool-Layout Type (Sprint-2-Inbox vs Tabelle).
 * UX-R2 ersetzt das Toggle durch die Lane (Pool=inbox, In-Arbeit/Archiv=table).
 * Type bleibt als interner Adapter für BestellungenTabelle, bis der Shrink
 * in einer späteren Welle die Inbox-Branch ganz aus der Tabelle zieht.
 */
export type PoolLayout = "inbox" | "table";

/**
 * Layout-DNA pro Lane.
 *
 * Pool = Inbox (Card-Feed, editorial-DNA mit Vendor-Hero, Score, Reserve).
 * In-Arbeit = Tabelle (dichte Datentabelle, Bulk-Edit, Sortierung).
 * Archiv = Tabelle (gleiche DNA wie In-Arbeit + CSV-Export).
 *
 * **Kein Toggle.** Die Lane bestimmt das Layout. Das alte Inbox-vs-Tabelle-
 * Switching war Quelle des Layout-Dualismus (Inbox zeigte ungefiltert,
 * Tabelle filtert — bei Toggle änderte sich die Datenmenge, audit-Wurzel #2).
 */
export type LaneLayout = "inbox" | "table";

export const LANE_LAYOUT: Record<Lane, LaneLayout> = {
  pool: "inbox",
  "in-arbeit": "table",
  archiv: "table",
};

export interface LaneCopy {
  /** Display-Label in der LaneNav. */
  label: string;
  /** Eyebrow im PageHero. */
  eyebrow: string;
  /** Page-Headline. */
  title: string;
  /** Description-Text unterm PageHero-Title (rolle-spezifisch ergänzt). */
  description: string;
  /** Sub-Label in der LaneNav (z.B. "13 warten") — wird mit Count befüllt. */
  subLabelFor: (count: number) => string;
  /** Empty-State-Text wenn die Lane wirklich leer ist (nicht filter-zero). */
  emptyTitle: string;
  emptyDescription: string;
}

export const LANE_COPY: Record<Lane, LaneCopy> = {
  pool: {
    label: "Pool",
    eyebrow: "Posteingang",
    title: "Pool",
    description:
      "Material-Bestellungen ohne Besteller. Beide Besteller können übernehmen und freigeben.",
    subLabelFor: (count) =>
      count === 0 ? "leer" : count === 1 ? "1 wartet" : `${count} warten`,
    emptyTitle: "Pool ist leer.",
    emptyDescription:
      "Sobald eine Material-Mail ankommt, taucht sie hier auf. Du musst nichts tun.",
  },
  "in-arbeit": {
    label: "In Arbeit",
    eyebrow: "Workflow",
    title: "In Arbeit",
    description:
      "Deine aktiven Bestellungen — Material, Subunternehmer, Abo. Filter und Bulk-Aktionen via Toolbar.",
    subLabelFor: (count) =>
      count === 0 ? "alles erledigt" : count === 1 ? "1 offen" : `${count} offen`,
    emptyTitle: "Keine offenen Bestellungen.",
    emptyDescription:
      "Du hast alles erledigt. Neue Bestellungen tauchen automatisch hier auf, sobald sie dir zugeordnet werden.",
  },
  archiv: {
    label: "Archiv",
    eyebrow: "Historie",
    title: "Archiv",
    description:
      "Freigegebene, verworfene und stornierte Bestellungen. CSV-Export für die Buchhaltung verfügbar.",
    subLabelFor: (count) => (count === 0 ? "leer" : `${count} Einträge`),
    emptyTitle: "Archiv ist leer.",
    emptyDescription:
      "Freigegebene Bestellungen landen hier — entweder von dir oder via Bulk-Freigabe.",
  },
};

/**
 * Default-Lane je Rolle.
 *
 * Besteller landen im Pool (Triage-First), Admins ebenso (sie überwachen
 * den Pool für die anderen). Buchhaltung kommt eh nicht in /bestellungen,
 * sondern in /buchhaltung.
 */
export function defaultLaneForRolle(rolle: string | undefined): Lane {
  return rolle === "buchhaltung" ? "in-arbeit" : "pool";
}

/**
 * Type-Guard. Verwendet in middleware/layouts um URL-Param zu validieren.
 */
export function isLane(value: string | undefined | null): value is Lane {
  return value === "pool" || value === "in-arbeit" || value === "archiv";
}

/**
 * Legacy-URL-Mapping. Alte `?view=...`-Routes redirected auf die neuen
 * Lane-Routes. Wird in /bestellungen/page.tsx als Server-Redirect angewandt.
 *
 *   ?view=pool      → /bestellungen/pool
 *   ?view=mine-open → /bestellungen/in-arbeit
 *   ?view=mine-done → /bestellungen/archiv
 *   ?view=all       → /bestellungen/in-arbeit?owner=alle  (Admin-Mode)
 */
export function laneFromLegacyView(view: string | undefined | null): {
  lane: Lane;
  extraParams?: Record<string, string>;
} {
  switch (view) {
    case "pool":
      return { lane: "pool" };
    case "mine-open":
      return { lane: "in-arbeit" };
    case "mine-done":
      return { lane: "archiv" };
    case "all":
      return { lane: "in-arbeit", extraParams: { owner: "alle" } };
    default:
      return { lane: "pool" };
  }
}
