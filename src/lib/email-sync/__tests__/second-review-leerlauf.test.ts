/**
 * Tests fuer die Leerlauf-Bremse des Second-Review-Re-Runs.
 *
 * Die Bremse entscheidet, ob ein teurer Pipeline-Re-Run ueberhaupt noch
 * laeuft. Zwei Fehler waeren teuer: zu frueh bremsen (Rechnung geht
 * verloren) und nie bremsen (100 ergebnislose Laeufe). Beide Richtungen
 * sind hier festgenagelt.
 */
import { describe, it, expect } from "vitest";
import {
  domainAus,
  bauLeerlaufBilanz,
  ueberspringeReRun,
  MIN_LEERLAUF,
  TREFFER_OUTCOME,
} from "../second-review-leerlauf";

const LEER = "rerun_kein_bestellung";

function zeilen(...paare: Array<[string | null, string | null]>) {
  return paare.map(([sender, second_review_rerun_outcome]) => ({
    sender,
    second_review_rerun_outcome,
  }));
}

describe("domainAus", () => {
  it("liest die Domain kleingeschrieben aus", () => {
    expect(domainAus("Info@Stark-Deutschland.DE")).toBe("stark-deutschland.de");
  });

  it("nimmt das letzte @, damit ein @ im Namensteil nicht stoert", () => {
    expect(domainAus('"a@b"@example.com')).toBe("example.com");
  });

  it("gibt null zurueck, wenn keine Domain da ist", () => {
    expect(domainAus(null)).toBeNull();
    expect(domainAus("")).toBeNull();
    expect(domainAus("ohne-at")).toBeNull();
    expect(domainAus("leer@")).toBeNull();
  });
});

describe("bauLeerlaufBilanz", () => {
  it("zaehlt Treffer und Leerlauf je Domain getrennt", () => {
    const bilanz = bauLeerlaufBilanz(
      zeilen(
        ["a@stark.de", LEER],
        ["b@stark.de", LEER],
        ["c@lexware.de", TREFFER_OUTCOME],
        ["d@lexware.de", LEER],
      ),
    );
    expect(bilanz.get("stark.de")).toEqual({ treffer: 0, leerlauf: 2 });
    expect(bilanz.get("lexware.de")).toEqual({ treffer: 1, leerlauf: 1 });
  });

  it("ignoriert Zeilen ohne Re-Run und ohne Domain", () => {
    const bilanz = bauLeerlaufBilanz(
      zeilen(["a@stark.de", null], [null, LEER], ["ohne-at", LEER]),
    );
    expect(bilanz.size).toBe(0);
  });
});

describe("ueberspringeReRun", () => {
  it("bremst erst ab MIN_LEERLAUF ergebnislosen Laeufen", () => {
    const knappDarunter = bauLeerlaufBilanz(
      zeilen(...Array.from({ length: MIN_LEERLAUF - 1 }, () => ["a@stark.de", LEER] as [string, string])),
    );
    expect(ueberspringeReRun(knappDarunter, "neu@stark.de")).toBe(false);

    const genauAufDerGrenze = bauLeerlaufBilanz(
      zeilen(...Array.from({ length: MIN_LEERLAUF }, () => ["a@stark.de", LEER] as [string, string])),
    );
    expect(ueberspringeReRun(genauAufDerGrenze, "neu@stark.de")).toBe(true);
  });

  it("ein einziger Treffer hebt die Sperre wieder auf", () => {
    const mitTreffer = bauLeerlaufBilanz(
      zeilen(
        ...Array.from({ length: 20 }, () => ["a@stark.de", LEER] as [string, string]),
        ["b@stark.de", TREFFER_OUTCOME],
      ),
    );
    expect(ueberspringeReRun(mitTreffer, "neu@stark.de")).toBe(false);
  });

  it("bremst nie ohne Historie oder ohne erkennbare Domain", () => {
    const bilanz = bauLeerlaufBilanz(
      zeilen(...Array.from({ length: 20 }, () => ["a@stark.de", LEER] as [string, string])),
    );
    expect(ueberspringeReRun(bilanz, "neu@unbekannt.de")).toBe(false);
    expect(ueberspringeReRun(bilanz, null)).toBe(false);
    expect(ueberspringeReRun(new Map(), "neu@stark.de")).toBe(false);
  });

  it("unterscheidet Domains nicht nach Schreibweise", () => {
    const bilanz = bauLeerlaufBilanz(
      zeilen(...Array.from({ length: MIN_LEERLAUF }, () => ["a@STARK.de", LEER] as [string, string])),
    );
    expect(ueberspringeReRun(bilanz, "Neu@Stark.DE")).toBe(true);
  });
});
