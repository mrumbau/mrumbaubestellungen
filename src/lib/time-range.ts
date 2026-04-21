/**
 * Zeitraum-Berechnung für Dashboard-Filter (shared Server + Client).
 *
 * Jeder Range hat eine Start/Ende, einen Vergleichs-Zeitraum (für MoM-Delta)
 * und eine Sparkline-Bucket-Struktur. Zentrale Logik damit Server-Query-Filter
 * und Client-Aggregation identisch sind.
 */
export type TimeRange = "7d" | "30d" | "90d" | "month" | "prev-month";

export interface RangeBounds {
  /** ISO-Datum: Beginn des aktuellen Zeitraums */
  start: Date;
  /** ISO-Datum: Ende des aktuellen Zeitraums (inklusiv — jetzt bzw. Monatsende) */
  end: Date;
  /** Vergleichs-Zeitraum für MoM-Delta: gleich lange Periode davor */
  previousStart: Date;
  previousEnd: Date;
  /** Menschenlesbares Label für UI ("Letzte 30 Tage", "März 2026", …) */
  label: string;
  /** Zahl der Tage im aktuellen Zeitraum (für Sparkline-Bucket-Count-Entscheidung) */
  durationDays: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isValidTimeRange(v: unknown): v is TimeRange {
  return v === "7d" || v === "30d" || v === "90d" || v === "month" || v === "prev-month";
}

export function parseTimeRange(raw: string | null | undefined): TimeRange {
  return isValidTimeRange(raw) ? raw : "30d";
}

export function computeRangeBounds(range: TimeRange, now: Date = new Date()): RangeBounds {
  const today = startOfDay(now);
  const endNow = new Date(now.getTime());

  if (range === "7d") {
    const start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      start,
      end: endNow,
      previousStart: new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000),
      previousEnd: new Date(start.getTime() - 1),
      label: "Letzte 7 Tage",
      durationDays: 7,
    };
  }
  if (range === "30d") {
    const start = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      start,
      end: endNow,
      previousStart: new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000),
      previousEnd: new Date(start.getTime() - 1),
      label: "Letzte 30 Tage",
      durationDays: 30,
    };
  }
  if (range === "90d") {
    const start = new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000);
    return {
      start,
      end: endNow,
      previousStart: new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000),
      previousEnd: new Date(start.getTime() - 1),
      label: "Letzte 90 Tage",
      durationDays: 90,
    };
  }
  if (range === "month") {
    const start = startOfMonth(now);
    const previousStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const previousEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const monthName = start.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const daysElapsed = Math.max(1, Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    return {
      start,
      end: endNow,
      previousStart,
      previousEnd,
      label: monthName,
      durationDays: daysElapsed,
    };
  }
  // prev-month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = startOfMonth(prevMonth);
  const end = endOfMonth(prevMonth);
  const previousStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const previousEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const monthName = start.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const daysInMonth = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return {
    start,
    end,
    previousStart,
    previousEnd,
    label: monthName,
    durationDays: daysInMonth,
  };
}

/**
 * Sparkline-Buckets für einen Zeitraum berechnen.
 * 7d+30d+month = tägliche Buckets, 90d = wöchentliche (13 statt 90 Buckets — lesbarer).
 */
export function sparklineBuckets(bounds: RangeBounds): { start: Date; end: Date }[] {
  const { start, end, durationDays } = bounds;
  const useWeekly = durationDays > 45;
  const bucketDays = useWeekly ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(durationDays / bucketDays));
  const buckets: { start: Date; end: Date }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bStart = new Date(start.getTime() + i * bucketDays * 24 * 60 * 60 * 1000);
    const bEnd = new Date(Math.min(bStart.getTime() + bucketDays * 24 * 60 * 60 * 1000, end.getTime() + 1));
    buckets.push({ start: bStart, end: bEnd });
  }
  return buckets;
}
