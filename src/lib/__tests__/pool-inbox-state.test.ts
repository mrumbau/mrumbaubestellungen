import { describe, it, expect } from "vitest";
import {
  formatReserveCountdown,
  smartSnoozeOptions,
  isUnread,
} from "../pool-inbox-state";

const NOW = new Date("2026-06-03T12:00:00Z");

function isoIn(minutes: number, ms = 0): string {
  return new Date(NOW.getTime() + minutes * 60 * 1000 + ms).toISOString();
}

describe("formatReserveCountdown", () => {
  it("9:42 für 9 Minuten 42 Sekunden in der Zukunft", () => {
    const expires = new Date(NOW.getTime() + (9 * 60 + 42) * 1000).toISOString();
    const r = formatReserveCountdown(expires, NOW);
    expect(r.kind).toBe("active");
    if (r.kind === "active") {
      expect(r.label).toBe("9:42");
      expect(r.remainingSeconds).toBe(9 * 60 + 42);
    }
  });

  it("formatiert <60s als Xs", () => {
    const r = formatReserveCountdown(new Date(NOW.getTime() + 47 * 1000).toISOString(), NOW);
    expect(r.kind).toBe("active");
    if (r.kind === "active") {
      expect(r.label).toBe("47s");
    }
  });

  it("liefert 'expired' bei <=0", () => {
    expect(formatReserveCountdown(NOW.toISOString(), NOW).kind).toBe("expired");
    expect(formatReserveCountdown(isoIn(-5), NOW).kind).toBe("expired");
  });

  it("liefert 'expired' für ungültige ISO", () => {
    expect(formatReserveCountdown("blubb", NOW).kind).toBe("expired");
  });

  it("padded Sekunden mit führender 0", () => {
    const expires = new Date(NOW.getTime() + (5 * 60 + 3) * 1000).toISOString();
    const r = formatReserveCountdown(expires, NOW);
    if (r.kind === "active") expect(r.label).toBe("5:03");
  });
});

describe("smartSnoozeOptions", () => {
  it("liefert mindestens 'Morgen 7:00'", () => {
    const opts = smartSnoozeOptions(NOW);
    expect(opts.some((o) => o.key === "tomorrow-7am")).toBe(true);
  });

  it("zeigt 'In 2 Stunden' wenn 7≤Berlin-Stunde<19", () => {
    // 2026-06-03 12:00 UTC = 14:00 Berlin (Sommerzeit) → in-Arbeitszeit
    const opts = smartSnoozeOptions(NOW);
    expect(opts.some((o) => o.key === "in-2h")).toBe(true);
  });

  it("blendet 'In 2 Stunden' aus außerhalb der Arbeitszeit", () => {
    // 23:00 UTC = 01:00 Berlin Sommer → vor 7am
    const lateNight = new Date("2026-06-03T23:00:00Z");
    const opts = smartSnoozeOptions(lateNight);
    expect(opts.some((o) => o.key === "in-2h")).toBe(false);
  });

  it("liefert 'Nächste Woche Mo 7:00' an Wochentagen (nicht Wochenende)", () => {
    // 2026-06-03 ist Mittwoch
    const opts = smartSnoozeOptions(NOW);
    expect(opts.some((o) => o.key === "next-monday-7am")).toBe(true);
  });

  it("liefert 'Montag 7:00' wenn morgen Sonntag (Samstag)", () => {
    // 2026-06-06 ist ein Samstag, morgen Sonntag
    const saturday = new Date("2026-06-06T10:00:00Z");
    const opts = smartSnoozeOptions(saturday);
    expect(opts.some((o) => o.key === "monday-7am")).toBe(true);
  });

  it("alle Optionen haben gültige ISO-Strings", () => {
    const opts = smartSnoozeOptions(NOW);
    opts.forEach((o) => {
      expect(() => new Date(o.until).toISOString()).not.toThrow();
      expect(new Date(o.until).getTime()).toBeGreaterThan(NOW.getTime());
    });
  });
});

describe("isUnread", () => {
  it("seen_at=null → unread", () => {
    expect(isUnread("2026-06-01T00:00:00Z", null)).toBe(true);
    expect(isUnread("2026-06-01T00:00:00Z", undefined)).toBe(true);
  });

  it("seen_at vor created_at → unread (Item wurde nach Besuch geupdated)", () => {
    expect(isUnread("2026-06-03T10:00:00Z", "2026-06-02T10:00:00Z")).toBe(true);
  });

  it("seen_at nach created_at → read", () => {
    expect(isUnread("2026-06-02T10:00:00Z", "2026-06-03T10:00:00Z")).toBe(false);
  });

  it("seen_at exakt = created_at → read (defensive)", () => {
    expect(isUnread("2026-06-03T10:00:00Z", "2026-06-03T10:00:00Z")).toBe(false);
  });
});
