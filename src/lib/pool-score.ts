/**
 * pool-score — pure Priorisierungs-Logik für den Pool-Inbox-Feed.
 *
 * 03.06.2026 (Sprint 3): Sortiert Pool-Items nach einem Hybrid-Score in
 * [0..1], gewichtet aus Age + Urgency + Vorschlag-Konfidenz + Projekt-/
 * Vendor-Affinität pro User. Gewichte sind admin-konfigurierbar in
 * firma_einstellungen.pool_score_weights — Default deckt typische
 * Triage-Reihenfolge ab ("älteres + dringend > junges").
 *
 * Drei-Sprachen-Disziplin: Score ist KEINE eigene Sprache. Im UI wird er
 * nur als optionaler Sort-Default und subtle Pill ("↑ Priorität") für
 * Top-X% sichtbar — niemals als Color-Triplet oder Brand-Pill.
 */

export interface PoolScoreWeights {
  age: number;
  urgency: number;
  vorschlag_konf: number;
  projekt_aff: number;
  vendor_aff: number;
}

export const DEFAULT_POOL_SCORE_WEIGHTS: PoolScoreWeights = {
  age: 0.3,
  urgency: 0.25,
  vorschlag_konf: 0.2,
  projekt_aff: 0.15,
  vendor_aff: 0.1,
};

/** Maps für Affinität — Server-seitig aus vw_user_*_affinity geladen. */
export type AffinityMap = Record<string, number>;

export interface ScoreInput {
  created_at: string | null | undefined;
  vorschlag_konfidenz?: number | null;
  mahnung_am?: string | null;
  mahnung_count?: number | null;
  faelligkeitsdatum?: string | null;
  haendler_id?: string | null;
  projekt_id?: string | null;
}

export interface ScoreContext {
  now?: Date;
  weights?: Partial<PoolScoreWeights>;
  /** Map haendler_id → ratio [0..1] für den aktuellen User. */
  vendorAffinity?: AffinityMap;
  /** Map projekt_id → ratio [0..1]. */
  projektAffinity?: AffinityMap;
}

export interface ScoreBreakdown {
  total: number;
  parts: {
    age: number;
    urgency: number;
    vorschlag_konf: number;
    projekt_aff: number;
    vendor_aff: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Berechnet den Pool-Score in [0..1] mit Breakdown der Einzelkomponenten.
 */
export function computeScore(input: ScoreInput, ctx: ScoreContext = {}): ScoreBreakdown {
  const now = ctx.now ?? new Date();
  const weights: PoolScoreWeights = {
    ...DEFAULT_POOL_SCORE_WEIGHTS,
    ...(ctx.weights ?? {}),
  };

  const ageFactor = computeAgeFactor(input.created_at, now);
  const urgencyFactor = computeUrgencyFactor(input.mahnung_am, input.mahnung_count, input.faelligkeitsdatum, now);
  const konfFactor = clamp01(input.vorschlag_konfidenz ?? 0);
  const projAff = input.projekt_id ? clamp01(ctx.projektAffinity?.[input.projekt_id] ?? 0) : 0;
  const vendorAff = input.haendler_id ? clamp01(ctx.vendorAffinity?.[input.haendler_id] ?? 0) : 0;

  const parts = {
    age: weights.age * ageFactor,
    urgency: weights.urgency * urgencyFactor,
    vorschlag_konf: weights.vorschlag_konf * konfFactor,
    projekt_aff: weights.projekt_aff * projAff,
    vendor_aff: weights.vendor_aff * vendorAff,
  };
  const totalWeights = Math.max(
    weights.age + weights.urgency + weights.vorschlag_konf + weights.projekt_aff + weights.vendor_aff,
    1e-9,
  );
  const totalRaw = parts.age + parts.urgency + parts.vorschlag_konf + parts.projekt_aff + parts.vendor_aff;
  // Normalisierung damit die Skala unabhängig von der Gewichtssumme ist.
  return { total: clamp01(totalRaw / totalWeights), parts };
}

/** 1 - exp(-Δd/7) — sättigt asymptotisch bei 1, ist ~0.5 bei 5 Tagen. */
export function computeAgeFactor(createdAtIso: string | null | undefined, now: Date): number {
  if (!createdAtIso) return 0;
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return 0;
  const days = Math.max(0, (now.getTime() - t) / DAY_MS);
  return 1 - Math.exp(-days / 7);
}

/**
 * Mahnung × Stufe dominiert; sonst Fälligkeit als Linear-Decay (heute=0.5,
 * morgen=0.4, ... 5d=0). Überfällig = 1.
 */
export function computeUrgencyFactor(
  mahnungAm: string | null | undefined,
  mahnungCount: number | null | undefined,
  faelligIso: string | null | undefined,
  now: Date,
): number {
  // Mahnung > Fälligkeit
  if (mahnungAm) {
    const count = Math.max(1, Math.min(3, mahnungCount ?? 1));
    return clamp01(0.6 + (count - 1) * 0.2); // 1.: 0.6, 2.: 0.8, 3.: 1.0
  }
  if (!faelligIso) return 0;
  const due = new Date(faelligIso).getTime();
  if (Number.isNaN(due)) return 0;
  const daysToDue = (due - now.getTime()) / DAY_MS;
  if (daysToDue < 0) return 1; // überfällig
  if (daysToDue >= 5) return 0;
  // Linear-Decay 0.5 (heute) → 0 (5d) — Bereich [0..5]
  return clamp01(0.5 * (1 - daysToDue / 5));
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Sortiert Bestellungen nach Score absteigend (höchster zuerst). Stabil. */
export function sortByPoolScore<T extends ScoreInput & { id: string }>(
  items: T[],
  ctx: ScoreContext = {},
): T[] {
  const enriched = items.map((b, idx) => ({
    b,
    idx,
    score: computeScore(b, ctx).total,
  }));
  enriched.sort((a, c) => {
    if (c.score !== a.score) return c.score - a.score;
    return a.idx - c.idx;
  });
  return enriched.map((e) => e.b);
}
