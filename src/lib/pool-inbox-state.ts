/**
 * pool-inbox-state — pure helpers für PoolInbox + Reserve-Badge + Snooze-Menü.
 *
 * 03.06.2026 (Sprint 2): testbare Funktionen ohne React-Abhängigkeit.
 *   - formatReserveCountdown: Live-Anzeige der verbleibenden Reserve-TTL
 *   - smartSnoozeOptions: per-NOW berechnete Snooze-Vorschläge ("Morgen 7:00",
 *     "Nächste Woche Mo 7:00") in Europe/Berlin
 *   - readDotState: zeigt das Unread-Dot wenn `seen_at` null oder < created_at
 *     (User hat das Item seit letztem Update nicht gesehen)
 *
 * Drei-Sprachen-Disziplin-Anchor:
 *   - Reserve = neutral + Uhr-Glyph + Countdown — nicht Owner, nicht Status
 *   - Snooze = unsichtbar im Pool, nur ActionMenu-Option
 *   - Read/Unread = 6px Brand-Dot oben links der Card
 */

export type ReserveCountdownState =
  | { kind: "active"; remainingSeconds: number; label: string }
  | { kind: "expired" };

/**
 * Berechnet den verbleibenden Countdown für eine Reserve. Format:
 *   ≥ 60s : "M:SS" (z. B. "9:42")
 *   < 60s : "Xs"   (z. B. "47s")
 *   ≤ 0   : kind="expired"
 */
export function formatReserveCountdown(
  expiresAtIso: string,
  now: Date = new Date(),
): ReserveCountdownState {
  const expires = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expires)) return { kind: "expired" };
  const remainingMs = expires - now.getTime();
  if (remainingMs <= 0) return { kind: "expired" };
  const remainingSeconds = Math.floor(remainingMs / 1000);
  if (remainingSeconds < 60) {
    return {
      kind: "active",
      remainingSeconds,
      label: `${remainingSeconds}s`,
    };
  }
  const mm = Math.floor(remainingSeconds / 60);
  const ss = remainingSeconds % 60;
  return {
    kind: "active",
    remainingSeconds,
    label: `${mm}:${String(ss).padStart(2, "0")}`,
  };
}

export interface SnoozeOption {
  key: string;
  label: string;
  /** ISO-8601 UTC. */
  until: string;
}

/**
 * Berechnet sinnvolle Snooze-Optionen relativ zu `now` in Europe/Berlin.
 * Die TZ ist hier hartcodiert weil alle 4 User in DE arbeiten — eine
 * Internationalisierung kommt im Multi-Tenant-Sprint (deferred).
 *
 * Optionen:
 *   - "In 2 Stunden"        (heute Nachmittag, falls noch Arbeitszeit)
 *   - "Morgen 7:00"          (Tagesstart)
 *   - "Übermorgen 7:00"      (wenn morgen sowieso schon weit)
 *   - "Nächste Woche Mo 7:00"
 *
 * Custom kommt im UI als 4. Option (öffnet Datepicker — kein Eintrag hier).
 */
export function smartSnoozeOptions(now: Date = new Date()): SnoozeOption[] {
  const opts: SnoozeOption[] = [];

  // 1) In 2h — sinnvoll wenn jetzt zwischen 7-19 Uhr lokal
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const localHourNow = getBerlinHour(now);
  if (localHourNow >= 7 && localHourNow < 19) {
    opts.push({
      key: "in-2h",
      label: "In 2 Stunden",
      until: in2h.toISOString(),
    });
  }

  // 2) Morgen 7:00 Europe/Berlin
  opts.push({
    key: "tomorrow-7am",
    label: "Morgen 7:00",
    until: berlinTimeOn(addDays(now, 1), 7, 0).toISOString(),
  });

  // 3) Übermorgen 7:00 — nur wenn morgen Wochenende
  const tomorrowDow = getBerlinDayOfWeek(addDays(now, 1));
  if (tomorrowDow === 6 || tomorrowDow === 0) {
    opts.push({
      key: "monday-7am",
      label: "Montag 7:00",
      until: berlinTimeOn(nextMonday(now), 7, 0).toISOString(),
    });
  } else {
    // 4) Nächste Woche Mo 7:00
    opts.push({
      key: "next-monday-7am",
      label: "Nächste Woche Mo 7:00",
      until: berlinTimeOn(nextMonday(now), 7, 0).toISOString(),
    });
  }

  return opts;
}

/**
 * Read/Unread State pro Pool-Item.
 *
 * unread = ich habe es noch nie gesehen ODER das Item wurde nach meinem
 *          letzten Besuch aktualisiert (events haben Geräusch verursacht).
 *
 * Sprint 2: nutzt nur seen_at vs created_at. Sprint 3+ wird die
 * latest-event-timestamp einbeziehen.
 */
export function isUnread(
  createdAtIso: string,
  seenAtIso: string | null | undefined,
): boolean {
  if (!seenAtIso) return true;
  return new Date(seenAtIso).getTime() < new Date(createdAtIso).getTime();
}

// ─── Berlin-TZ helpers (rein arithmetisch, ohne Intl-Roundtrip) ────────

/**
 * Berechnet die Stunde in Europe/Berlin für ein UTC-Date.
 *
 * Implementierung via Intl.DateTimeFormat um die Sommer/Winter-Zeit
 * korrekt zu behandeln. Akzeptiert in Tests mockbare `now`.
 */
function getBerlinHour(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hour12: false,
  });
  // hour als "00".."23"
  return parseInt(fmt.format(d), 10) || 0;
}

function getBerlinDayOfWeek(d: Date): number {
  // 0=Sun .. 6=Sat
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  });
  const label = fmt.format(d);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[label] ?? 0;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function nextMonday(now: Date): Date {
  const dow = getBerlinDayOfWeek(now);
  // Mo=1; offset = (8 - dow) % 7, mindestens 1
  const offset = ((8 - dow) % 7) || 7;
  return addDays(now, offset);
}

/**
 * Gibt ein UTC-Date zurück das in Europe/Berlin die gewünschte Uhrzeit hat.
 *
 * Strategie: nutze Berlin-noon des Ziel-Tages als "stabilen TZ-Probepunkt"
 * (kein DST-Sprung um Mittag). Aus Berlin-Hour von 12:00 UTC ergibt sich
 * Offset (1h Winter / 2h Sommer). Damit lässt sich die gewünschte
 * Berlin-Uhrzeit in UTC zurückrechnen.
 */
function berlinTimeOn(refDate: Date, hour: number, minute: number): Date {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dateFmt.formatToParts(refDate);
  const yyyy = parts.find((p) => p.type === "year")!.value;
  const mm = parts.find((p) => p.type === "month")!.value;
  const dd = parts.find((p) => p.type === "day")!.value;

  const noonUtc = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  const berlinHourFromNoonUtc = getBerlinHour(noonUtc); // 13 Winter, 14 Sommer
  const tzOffsetHours = berlinHourFromNoonUtc - 12;

  // gewünschte Berlin-Stunde → UTC = local - offset
  const totalMinutesUtc = hour * 60 + minute - tzOffsetHours * 60;
  const utcDayOffset = Math.floor(totalMinutesUtc / (24 * 60));
  const utcMinutesInDay = ((totalMinutesUtc % (24 * 60)) + 24 * 60) % (24 * 60);
  const utcHour = Math.floor(utcMinutesInDay / 60);
  const utcMinute = utcMinutesInDay % 60;
  const base = new Date(`${yyyy}-${mm}-${dd}T${pad(utcHour)}:${pad(utcMinute)}:00Z`);
  return new Date(base.getTime() + utcDayOffset * 24 * 60 * 60 * 1000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
