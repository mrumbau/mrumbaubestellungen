/**
 * Pure-State-Resolver für BestellerCell. In separater .ts ausgelagert, damit
 * vitest die State-Logik isoliert testen kann ohne TSX-/JSX-Setup
 * (vitest.config include-Pattern matcht nur .ts-Dateien).
 *
 * 02.06.2026 (Pool Phase 1).
 */

import { bestellerDisplay, type Bestellungsart } from "@/lib/besteller-display";

export type BestellerCellKind = "owner" | "vorschlag" | "geteilt" | "unzugeordnet";

export interface BestellerStateInput {
  besteller_kuerzel: string | null | undefined;
  besteller_name: string | null | undefined;
  bestellungsart?: Bestellungsart;
  vorschlag_kuerzel?: string | null;
  vorschlag_konfidenz?: number | null;
}

export interface BestellerState {
  kind: BestellerCellKind;
  kuerzel: string;
  name: string;
  /** Tooltip-Text (Konfidenz/Quelle/Hinweis). */
  title: string;
  /** Screen-Reader-Präfix vor dem Kürzel. */
  srPrefix: string;
}

export function resolveBestellerState(props: BestellerStateInput): BestellerState {
  const bd = bestellerDisplay(
    props.besteller_kuerzel,
    props.besteller_name,
    props.bestellungsart,
  );

  // 1) Geteilt (SU/Abo, bestehender Pfad — höchste Priorität)
  if (bd.isShared) {
    return {
      kind: "geteilt",
      kuerzel: bd.kuerzel,
      name: bd.name,
      title: "Geteilte Bestellung — alle Besteller dürfen freigeben",
      srPrefix: "Geteilt:",
    };
  }

  // 2) Echter Owner
  const isUnbekannt =
    !props.besteller_kuerzel ||
    props.besteller_kuerzel === "UNBEKANNT" ||
    props.besteller_kuerzel === "";

  if (!isUnbekannt) {
    return {
      kind: "owner",
      kuerzel: bd.kuerzel,
      name: bd.name,
      title: bd.name,
      srPrefix: "Besteller:",
    };
  }

  // 3) UNBEKANNT mit Pipeline-Vorschlag
  if (props.vorschlag_kuerzel && props.vorschlag_kuerzel !== "UNBEKANNT") {
    const confidencePart =
      typeof props.vorschlag_konfidenz === "number"
        ? ` · Konfidenz ${Math.round(props.vorschlag_konfidenz * 100)} %`
        : "";
    return {
      kind: "vorschlag",
      kuerzel: props.vorschlag_kuerzel,
      name: `Vorschlag: ${props.vorschlag_kuerzel}`,
      title: `Pipeline-Vorschlag: ${props.vorschlag_kuerzel}${confidencePart}. Noch niemand hat übernommen.`,
      srPrefix: "Vorschlag:",
    };
  }

  // 4) UNBEKANNT ohne Vorschlag
  return {
    kind: "unzugeordnet",
    kuerzel: "?",
    name: "Nicht zugeordnet",
    title: "Nicht zugeordnet — Pipeline konnte keinen Besteller bestimmen.",
    srPrefix: "Nicht zugeordnet:",
  };
}
