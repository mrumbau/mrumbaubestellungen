/**
 * Status-Machine Tests.
 *
 * Sicherheitskritisch (F5.1 + F3.F9): freigegeben muss Endzustand bleiben,
 * sonst kann eine bereits freigegebene Rechnung zurück nach offen / vollstaendig
 * gesetzt werden — Audit-Spur weg, Buchhaltung sieht sie evtl. nicht mehr.
 */

import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminalStatus,
  checkTransition,
  assertValidTransition,
  BESTELL_STATUS,
  type BestellStatus,
} from "../status-machine";

describe("Status-Machine — freigegeben ist Endzustand", () => {
  it("freigegeben → freigegeben (idempotent) ist erlaubt", () => {
    expect(isValidTransition("freigegeben", "freigegeben")).toBe(true);
  });

  it("freigegeben → ANY ist verboten (kein Rollback)", () => {
    const allOthers = BESTELL_STATUS.filter((s) => s !== "freigegeben");
    for (const target of allOthers) {
      expect(isValidTransition("freigegeben", target as BestellStatus)).toBe(false);
    }
  });

  it("isTerminalStatus erkennt nur freigegeben", () => {
    for (const s of BESTELL_STATUS) {
      expect(isTerminalStatus(s)).toBe(s === "freigegeben");
    }
  });
});

describe("Status-Machine — idempotente Selbst-Übergänge", () => {
  it("X → X ist immer erlaubt (Pipeline macht idempotente UPDATEs)", () => {
    for (const s of BESTELL_STATUS) {
      expect(isValidTransition(s, s)).toBe(true);
    }
  });
});

describe("Status-Machine — typische Pipeline-Pfade", () => {
  it("erwartet → offen (erste Mail trifft ein)", () => {
    expect(isValidTransition("erwartet", "offen")).toBe(true);
  });

  it("offen → vollstaendig (alle Dokumente da)", () => {
    expect(isValidTransition("offen", "vollstaendig")).toBe(true);
  });

  it("vollstaendig → freigegeben (User klickt freigeben)", () => {
    expect(isValidTransition("vollstaendig", "freigegeben")).toBe(true);
  });

  it("vollstaendig → offen (Doku gelöscht — bewusst Backwards-Compat)", () => {
    expect(isValidTransition("vollstaendig", "offen")).toBe(true);
  });

  it("abweichung → vollstaendig (User korrigiert Doku)", () => {
    expect(isValidTransition("abweichung", "vollstaendig")).toBe(true);
  });

  it("abweichung → freigegeben (User akzeptiert Abweichung)", () => {
    expect(isValidTransition("abweichung", "freigegeben")).toBe(true);
  });

  it("ls_fehlt → vollstaendig (Lieferschein eingescannt)", () => {
    expect(isValidTransition("ls_fehlt", "vollstaendig")).toBe(true);
  });
});

describe("Status-Machine — checkTransition() Soft-Audit", () => {
  it("liefert valid=true bei NULL-Ausgangsstatus (Initial-State)", () => {
    expect(checkTransition(null, "erwartet").valid).toBe(true);
    expect(checkTransition(undefined, "offen").valid).toBe(true);
    expect(checkTransition("", "offen").valid).toBe(true);
  });

  it("liefert valid=false + reason bei unbekanntem Ziel-Status", () => {
    const result = checkTransition("offen", "garbage_status");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unbekannter Ziel-Status");
  });

  it("liefert valid=false + reason bei verbotenem Übergang", () => {
    const result = checkTransition("freigegeben", "offen");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Ungültiger Status-Übergang");
  });
});

describe("Status-Machine — assertValidTransition wirft bei Verstoß", () => {
  it("wirft bei freigegeben → offen", () => {
    expect(() => assertValidTransition("freigegeben", "offen")).toThrow(/Ungültiger Status-Übergang/);
  });

  it("wirft NICHT bei vollstaendig → freigegeben", () => {
    expect(() => assertValidTransition("vollstaendig", "freigegeben")).not.toThrow();
  });
});

describe("BESTELL_STATUS — Schema-Konsistenz mit DB", () => {
  it("enthält genau die 6 Status aus schema.sql / CHECK-Constraint", () => {
    expect([...BESTELL_STATUS].sort()).toEqual([
      "abweichung",
      "erwartet",
      "freigegeben",
      "ls_fehlt",
      "offen",
      "vollstaendig",
    ]);
  });
});
