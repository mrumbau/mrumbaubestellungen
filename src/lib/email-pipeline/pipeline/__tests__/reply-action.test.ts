/**
 * Tests für reply-action.ts pure-Helpers.
 *
 * Fokus:
 *  - TOKEN_RE: nur exaktes UUID-Format wird erkannt
 *  - stripQuotedReply: Outlook / Apple Mail / Gmail / Plain-Quote-Marker
 *  - findActionKeyword: nur am Zeilenanfang matchen, drei Action-Types,
 *    Quote-Resistance via stripQuotedReply
 */

import { describe, it, expect } from "vitest";
import {
  TOKEN_RE,
  stripQuotedReply,
  findActionKeyword,
} from "../reply-action";

const SAMPLE_TOKEN = "01234567-89ab-cdef-0123-456789abcdef";

describe("TOKEN_RE", () => {
  it("erkennt korrektes UUID-Format in [REF:...]", () => {
    const m = `Hallo,\nFREIGEBEN [REF:${SAMPLE_TOKEN}]`.match(TOKEN_RE);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(SAMPLE_TOKEN);
  });

  it("ist case-insensitive", () => {
    const upper = SAMPLE_TOKEN.toUpperCase();
    const m = `Subject: BEZAHLT [REF:${upper}]`.match(TOKEN_RE);
    expect(m).not.toBeNull();
    expect(m![1].toLowerCase()).toBe(SAMPLE_TOKEN);
  });

  it("verweigert Falsch-Format (kein UUID)", () => {
    expect("FREIGEBEN [REF:not-a-uuid]".match(TOKEN_RE)).toBeNull();
    expect("FREIGEBEN [REF:12345678]".match(TOKEN_RE)).toBeNull();
    expect("FREIGEBEN [REF:01234567-89ab-cdef-0123-XXXXXXXXXXXX]".match(TOKEN_RE)).toBeNull();
  });

  it("verweigert ohne Klammern", () => {
    expect(`FREIGEBEN REF:${SAMPLE_TOKEN}`.match(TOKEN_RE)).toBeNull();
    expect(`FREIGEBEN ${SAMPLE_TOKEN}`.match(TOKEN_RE)).toBeNull();
  });

  it("greift nur den ersten Token bei mehreren", () => {
    const second = "fedcba98-7654-3210-fedc-ba9876543210";
    const body = `[REF:${SAMPLE_TOKEN}] und [REF:${second}]`;
    const m = body.match(TOKEN_RE);
    expect(m![1]).toBe(SAMPLE_TOKEN);
  });
});

describe("stripQuotedReply", () => {
  it("entfernt Outlook 'Original-Nachricht' Marker", () => {
    const body = [
      "FREIGEBEN",
      "Mein Kommentar.",
      "",
      "----- Original-Nachricht -----",
      "Von: info@mrumbau.de",
      "An: mt@mrumbau.de",
      "Betreff: Erinnerung",
      "",
      "Du hast 3 offene Bestellungen.",
    ].join("\n");
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("FREIGEBEN");
    expect(stripped).not.toContain("Original-Nachricht");
    expect(stripped).not.toContain("offene Bestellungen");
  });

  it("entfernt deutsche 'Am … schrieb' Quote", () => {
    const body = [
      "BEZAHLT",
      "",
      "Am Mi., 6. Mai 2026 um 12:34 Uhr schrieb info@mrumbau.de:",
      "> FREIGEBEN [REF:abc]",
      "> Bitte freigeben.",
    ].join("\n");
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("BEZAHLT");
    expect(stripped).not.toContain("Bitte freigeben");
    // Stripped body should be empty of FREIGEBEN from the quoted block
    expect(stripped.indexOf("FREIGEBEN")).toBe(-1);
  });

  it("entfernt englischen Apple-Mail 'On … wrote:' Quote", () => {
    const body = [
      "ABLEHNEN",
      "",
      "On May 6, 2026, at 10:00, info@mrumbau.de wrote:",
      "> FREIGEBEN should be triggered",
    ].join("\n");
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("ABLEHNEN");
    expect(stripped).not.toContain("should be triggered");
  });

  it("entfernt Outlook 'Von: ...' header", () => {
    const body = [
      "FREIGEBEN",
      "",
      "Von: info@mrumbau.de",
      "Gesendet: Mittwoch, 6. Mai 2026 12:00",
      "An: mt@mrumbau.de",
      "Betreff: Erinnerung",
      "",
      "Quote-content with FREIGEBEN here too",
    ].join("\n");
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("FREIGEBEN");
    // Quote-FREIGEBEN must be gone
    const matches = stripped.match(/FREIGEBEN/g);
    expect(matches).toHaveLength(1);
  });

  it("entfernt plain '> ' quote-prefix", () => {
    const body = "FREIGEBEN\n\n> alte Mail mit FREIGEBEN-Verweis\n> mehr quotes";
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("FREIGEBEN");
    expect(stripped).not.toContain("alte Mail");
  });

  it("lässt Body unverändert wenn kein Quote-Marker", () => {
    const body = "FREIGEBEN\nMein Kommentar dazu.";
    expect(stripQuotedReply(body)).toBe(body);
  });

  it("nimmt den frühesten Marker bei mehreren", () => {
    // 'Von:' kommt vor 'Original-Nachricht' im Body — beide müssen gehen
    const body = [
      "FREIGEBEN",
      "",
      "Von: x@y.de",
      "Sent: Mo",
      "Andere Zeile",
      "----- Original-Nachricht -----",
    ].join("\n");
    const stripped = stripQuotedReply(body);
    expect(stripped).toContain("FREIGEBEN");
    expect(stripped).not.toContain("Andere Zeile");
    expect(stripped).not.toContain("Original-Nachricht");
  });
});

describe("findActionKeyword", () => {
  it("erkennt FREIGEBEN am Zeilenanfang (case-insensitive)", () => {
    expect(findActionKeyword("freigeben\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("FREIGEBEN\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("Freigegeben\nbla")?.action).toBe("freigeben");
  });

  it("erkennt deutsche Bestätigungs-Synonyme als freigeben", () => {
    expect(findActionKeyword("ja\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("ok\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("bestätigung\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("bestaetige\nbla")?.action).toBe("freigeben");
    expect(findActionKeyword("approved\nbla")?.action).toBe("freigeben");
  });

  it("erkennt BEZAHLT-Varianten", () => {
    expect(findActionKeyword("bezahlt\nbla")?.action).toBe("bezahlt");
    expect(findActionKeyword("gezahlt\nbla")?.action).toBe("bezahlt");
    expect(findActionKeyword("paid\nbla")?.action).toBe("bezahlt");
    expect(findActionKeyword("überwiesen\nbla")?.action).toBe("bezahlt");
    expect(findActionKeyword("ueberwiesen\nbla")?.action).toBe("bezahlt");
  });

  it("erkennt ABLEHNEN-Varianten", () => {
    expect(findActionKeyword("nein\nbla")?.action).toBe("ablehnen");
    expect(findActionKeyword("ablehnen\nbla")?.action).toBe("ablehnen");
    expect(findActionKeyword("abgelehnt\nbla")?.action).toBe("ablehnen");
    expect(findActionKeyword("rejected\nbla")?.action).toBe("ablehnen");
    expect(findActionKeyword("stornieren\nbla")?.action).toBe("ablehnen");
  });

  it("matched NICHT mitten im Wort (Word-Boundary)", () => {
    expect(findActionKeyword("freigegebenwurde\nbla")).toBeNull();
    // "ok" ist Substring vieler Wörter, aber Pattern hat \b
    expect(findActionKeyword("oktober\nbla")).toBeNull();
    expect(findActionKeyword("paint\nbla")).toBeNull();
  });

  it("matched NICHT wenn Keyword nicht am Zeilenanfang steht", () => {
    expect(findActionKeyword("Bitte FREIGEBEN")).toBeNull();
    expect(findActionKeyword("Hallo, BEZAHLT die Rechnung")).toBeNull();
    expect(findActionKeyword("    nein wirklich nicht")?.action).toBe("ablehnen"); // leading whitespace ist OK (\s*)
  });

  it("erkennt mehrzeiligen Body und matched ab erster gültiger Zeile", () => {
    const body = "Hallo zusammen,\n\nFREIGEBEN bitte.\nDanke!";
    const result = findActionKeyword(body);
    expect(result?.action).toBe("freigeben");
  });

  it("returnt null bei leerem Body", () => {
    expect(findActionKeyword("")).toBeNull();
  });

  it("returnt null wenn nur Original-Mail-Footer (Token-Hint, kein Keyword)", () => {
    const body = "Antwort-Aktionen:\n  Bestellung 123 → FREIGEBEN [REF:abc]";
    // FREIGEBEN steht nicht am Zeilenanfang (nur whitespace + Pfeil davor)
    expect(findActionKeyword(body)).toBeNull();
  });

  it("priorisiert deterministisch wenn beide Keywords vorhanden (freigeben kommt zuerst in Iteration)", () => {
    // Beide am Zeilenanfang — Iteration über Object.entries respektiert Insertion-Order:
    // freigeben → bezahlt → ablehnen → uebernehmen. Erstes Match wins.
    const body = "FREIGEBEN\nBEZAHLT\nNEIN";
    const result = findActionKeyword(body);
    expect(result?.action).toBe("freigeben");
  });

  it("erkennt UEBERNEHMEN-Varianten (Pool Phase 5)", () => {
    expect(findActionKeyword("uebernehmen\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("übernehmen\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("UEBERNEHMEN\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("claim\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("nehme\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("ich mache\nbla")?.action).toBe("uebernehmen");
    expect(findActionKeyword("machen wir\nbla")?.action).toBe("uebernehmen");
  });

  it("UEBERNEHMEN matched nicht mitten im Wort (Word-Boundary)", () => {
    // 02.06.2026 (Pool Phase 5) — Schutz gegen Substring-Treffer in
    // beliebigen deutschen Body-Texten. "übernehmenswert" / "claimed" sollten
    // NICHT triggern.
    expect(findActionKeyword("übernehmenswert\nbla")).toBeNull();
    expect(findActionKeyword("nehmenswert\nbla")).toBeNull();
  });

  it("UEBERNEHMEN matched nur am Zeilenanfang (kein Quote-Trigger)", () => {
    // Token-Hint im Original-Footer darf nicht versehentlich triggern.
    const body = "Antwort-Aktionen:\n  Bestellung X → UEBERNEHMEN [REF:abc]";
    expect(findActionKeyword(body)).toBeNull();
  });
});

describe("Integration: stripQuotedReply + findActionKeyword (Quote-Resistance)", () => {
  it("verhindert dass FREIGEBEN aus dem zitierten Original-Footer triggert", () => {
    // User antwortet nur mit "BEZAHLT" auf eine Mahnung. Der Original-Footer
    // enthält die Token-Liste mit "FREIGEBEN [REF:...]". Ohne Quote-Strip
    // würde fälschlich FREIGEBEN matchen.
    const body = [
      "BEZAHLT",
      "Ich habe heute überwiesen.",
      "",
      "Am Mi., 6. Mai 2026 um 09:00 Uhr schrieb info@mrumbau.de:",
      "> Erinnerung: 1 Lieferschein fehlt noch",
      "> Antwort-Aktionen:",
      "> FREIGEBEN [REF:01234567-89ab-cdef-0123-456789abcdef]",
    ].join("\n");
    const cleanBody = stripQuotedReply(body);
    const action = findActionKeyword(cleanBody);
    expect(action?.action).toBe("bezahlt");
  });

  it("erkennt FREIGEBEN wenn User es bewusst am Anfang seines Replies schreibt", () => {
    const body = [
      "FREIGEBEN",
      "",
      "Liebe Grüße",
      "MT",
      "",
      "Am Mi., 6. Mai 2026 um 09:00 Uhr schrieb info@mrumbau.de:",
      "> alter Mahnungs-Body",
    ].join("\n");
    const cleanBody = stripQuotedReply(body);
    const action = findActionKeyword(cleanBody);
    expect(action?.action).toBe("freigeben");
    expect(action?.matchedKeyword.toLowerCase()).toBe("freigeben");
  });

  it("erkennt nichts wenn User nur Original-Mail zitiert ohne neue Aktion", () => {
    const body = [
      "",
      "Am Mi., 6. Mai 2026 um 09:00 Uhr schrieb info@mrumbau.de:",
      "> FREIGEBEN [REF:abc]",
      "> BEZAHLT [REF:def]",
    ].join("\n");
    const cleanBody = stripQuotedReply(body);
    expect(findActionKeyword(cleanBody)).toBeNull();
  });
});
