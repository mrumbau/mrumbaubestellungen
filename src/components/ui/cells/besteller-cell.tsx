/**
 * BestellerCell — Owner-Pill mit 4 semantischen States.
 *
 * Phase 1 Pool-Foundation (02.06.2026). Ersetzt das bisher inline gerenderte
 * `bestellerDisplay()`-Pattern in DataTable, archiv-order-row und DetailHeader.
 * Einziger Render-Pfad für Owner-Visualisierung — verhindert Inline-Klone, die
 * die Drei-Sprachen-Disziplin der Pool-UX brechen würden.
 *
 * Drei-Sprachen-Regel (siehe DESIGN.md):
 *   1. **Owner** — solid `bg-brand text-foreground-inverse`. Authority-Marker
 *      für „Mensch hat sich gebunden". Verwendet MR-Red als Brand-Anker.
 *   2. **Vorschlag** — ghost-Style: `bg-canvas border-dashed`, gedimmte Schrift
 *      mit dotted-underline auf dem Kürzel. Pipeline-Vorschlag ist NIE eine
 *      Authority-Aussage — der visuelle Weight muss leiser sein als Owner.
 *   3. **Geteilt** (SU/Abo) — bestehender Sentinel-Pfad mit `bg-foreground-muted`.
 *      Keine Brand-Färbung, weil hier weder Mensch noch Maschine claim.
 *   4. **Unzugeordnet** (UNBEKANNT-Material ohne Vorschlag) — `bg-warning-bg
 *      text-warning border-warning-border` + `?`-Glyph. Bewusst auffällig als
 *      Signal „hier braucht es eine Entscheidung".
 *
 * color-not-only (WCAG): jeder State hat Symbol + Farbe + Label im Tooltip.
 * Mobile: keine zusätzlichen Spalten — der Chip ist immer 20×20px (h-5 w-5).
 *
 * Konfidenz wird ausschließlich als native `title`-Tooltip gerendert. Kein
 * eigenes Pill, kein eigener Float — die Hover-UI ist genug.
 */

import { type Bestellungsart } from "@/lib/besteller-display";
import { resolveBestellerState, type BestellerCellKind } from "./besteller-cell-state";

export type BestellerVariant = "pill-only" | "with-name";

export interface BestellerCellProps {
  besteller_kuerzel: string | null | undefined;
  besteller_name: string | null | undefined;
  bestellungsart?: Bestellungsart;
  /** Pipeline-Vorschlag (z.B. "MT"). Wird nur in UNBEKANNT-State angezeigt. */
  vorschlag_kuerzel?: string | null;
  /** Pipeline-Konfidenz 0..1. NUR als Tooltip. */
  vorschlag_konfidenz?: number | null;
  /**
   * Render-Variante:
   *   - "pill-only" (Default): nur 20×20-Pill mit Kürzel. Für DataTable + Mobile.
   *   - "with-name":  Pill + Name daneben (`text-foreground-muted`). Für DetailHeader.
   */
  variant?: BestellerVariant;
  /** Optionaler Wrapper-Class für Layout-Anpassungen. */
  className?: string;
}

const PILL_BASE =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold font-mono-amount shrink-0";

const PILL_BY_KIND: Record<BestellerCellKind, string> = {
  // Brand-Anker: Authority-Signal
  owner: "bg-brand text-foreground-inverse",
  // Ghost-Style: bewusst leiser als Owner
  vorschlag:
    "bg-canvas border border-dashed border-line-strong text-foreground-muted",
  // Geteilt: neutral, kein Brand
  geteilt: "bg-foreground-muted text-white",
  // Warning-Token: signalisiert „Entscheidung nötig"
  unzugeordnet:
    "bg-warning-bg text-warning border border-warning-border",
};

export function BestellerCell(props: BestellerCellProps) {
  const state = resolveBestellerState(props);
  const variant: BestellerVariant = props.variant ?? "pill-only";

  const pill = (
    <span
      aria-hidden="true"
      className={`${PILL_BASE} ${PILL_BY_KIND[state.kind]}`}
      data-state={state.kind}
    >
      {state.kuerzel}
    </span>
  );

  if (variant === "pill-only") {
    return (
      <span
        className={`inline-flex items-center ${props.className ?? ""}`}
        title={state.title}
      >
        {pill}
        <span className="sr-only">
          {state.srPrefix} {state.name}
        </span>
      </span>
    );
  }

  // with-name variant: Pill + Label nebeneinander
  // Vorschlag bekommt zusätzlich dotted-underline auf dem Label, damit auch
  // ohne Hover klar ist: das ist eine Vermutung, kein Fakt.
  const nameClass =
    state.kind === "vorschlag"
      ? "text-foreground-muted underline decoration-dotted decoration-line-strong underline-offset-2"
      : state.kind === "unzugeordnet"
        ? "text-warning font-medium"
        : "text-foreground-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${props.className ?? ""}`}
      title={state.title}
    >
      {pill}
      <span className="sr-only">{state.srPrefix} </span>
      <span className={nameClass}>{state.name}</span>
    </span>
  );
}
