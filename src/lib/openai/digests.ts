/**
 * KI-Operations für textuelle Zusammenfassungen und Priorisierungen:
 * Erinnerungs-Mail, Wochen-Zusammenfassung, Fälligkeits-Priorisierung,
 * Bestellung-Zusammenfassung.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import { chatCompletion, safeParseGptJson } from "./client";
import type {
  PriorisierungErgebnis,
  WochenzusammenfassungErgebnis,
} from "./prompts";

// 2. Lieferschein-Erinnerung generieren
export async function generiereErinnerungsmail(
  bestellungen: { bestellnummer: string; haendler: string; besteller: string; tage_alt: number; betrag: number }[]
): Promise<string> {
  const response = await chatCompletion({
    // R2/F4.2: gpt-4o-mini ausreichend für simple Text-Generation; ~5x günstiger
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein freundlicher Assistent der kurze, professionelle Erinnerungsmails auf Deutsch schreibt.
Schreibe eine kurze E-Mail an den Besteller mit der Aufforderung den fehlenden Lieferschein einzuscannen.
Tonfall: freundlich, direkt, kurz. Keine Anrede mit "Sehr geehrter". Duzen ist OK.
Format: Nur den E-Mail-Body, kein Betreff.`,
      },
      {
        role: "user",
        content: `Folgende Bestellungen haben seit mehreren Tagen keinen Lieferschein:
${bestellungen.map((b) => `- ${b.bestellnummer} bei ${b.haendler} (${b.tage_alt} Tage, ${b.betrag}€)`).join("\n")}`,
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || "";
}

// 5. Wochen-/Dashboard-Zusammenfassung
export async function generiereWochenzusammenfassung(
  stats: {
    gesamt: number;
    offen: number;
    abweichungen: number;
    ls_fehlt: number;
    freigegeben: number;
    vollstaendig: number;
    freigegebenes_volumen: number;
    ueberfaellige_rechnungen: { bestellnummer: string; haendler: string; faellig: string; betrag: number }[];
    abweichende_bestellungen: { bestellnummer: string; haendler: string; problem: string }[];
  }
): Promise<WochenzusammenfassungErgebnis> {
  const response = await chatCompletion({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Management-Assistent für eine deutsche Baufirma.
Erstelle eine kurze, prägnante Zusammenfassung der aktuellen Bestellsituation.
Schreibe auf Deutsch, maximal 3-4 Sätze für die Zusammenfassung.
Markiere dringende Punkte klar.

Gib NUR ein JSON-Objekt zurück:
{
  "zusammenfassung": "Aktuell 15 Bestellungen, davon 3 offen. 2 Abweichungen müssen geprüft werden. Freigegebenes Volumen: 12.500€.",
  "dringend": ["Würth #91023 ist überfällig (seit 3 Tagen)", "Bauhaus #45231: Mengenabweichung bei Dübeln"],
  "highlights": ["5 Rechnungen diese Woche freigegeben", "Keine neuen Abweichungen seit Dienstag"]
}`,
      },
      {
        role: "user",
        content: `Aktuelle Statistiken:
- Gesamt: ${stats.gesamt} Bestellungen
- Offen: ${stats.offen}
- Abweichungen: ${stats.abweichungen}
- LS fehlt: ${stats.ls_fehlt}
- Freigegeben: ${stats.freigegeben}
- Vollständig (bereit zur Freigabe): ${stats.vollstaendig}
- Freigegebenes Volumen: ${stats.freigegebenes_volumen.toFixed(2)}€

Überfällige Rechnungen:
${stats.ueberfaellige_rechnungen.length > 0
  ? stats.ueberfaellige_rechnungen.map((r) => `- ${r.bestellnummer} (${r.haendler}): Fällig ${r.faellig}, ${r.betrag}€`).join("\n")
  : "Keine"}

Abweichende Bestellungen:
${stats.abweichende_bestellungen.length > 0
  ? stats.abweichende_bestellungen.map((a) => `- ${a.bestellnummer} (${a.haendler}): ${a.problem}`).join("\n")
  : "Keine"}`,
      },
    ],
    max_tokens: 800,
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<WochenzusammenfassungErgebnis>(text, { zusammenfassung: "Zusammenfassung konnte nicht erstellt werden.", dringend: [], highlights: [] });
}

// 8. Fälligkeits-Priorisierung
export async function priorisiereBestellungen(
  bestellungen: {
    bestellnummer: string;
    haendler: string;
    status: string;
    betrag: number | null;
    tage_alt: number;
    hat_rechnung: boolean;
    hat_lieferschein: boolean;
    faelligkeitsdatum: string | null;
  }[]
): Promise<PriorisierungErgebnis> {
  // F4.10 Fix: Pre-Filter Top-15 nach Heuristik (überfällig + älteste + höchste Beträge),
  // Rest als Statistik. Verhindert Token-Explosion bei vielen offenen Bestellungen.
  const TOP_N = 15;
  const heuteISO = new Date().toISOString().slice(0, 10);
  const scored = bestellungen.map((b) => {
    let score = 0;
    if (b.faelligkeitsdatum && b.faelligkeitsdatum < heuteISO) score += 50; // überfällig
    if (b.status === "abweichung") score += 30;
    score += Math.min(b.tage_alt, 30);
    if (b.betrag && b.betrag > 1000) score += 10;
    if (!b.hat_rechnung) score += 5;
    return { b, score };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, TOP_N).map((s) => s.b);
  const restCount = Math.max(0, bestellungen.length - top.length);
  const restSummary = restCount > 0 ? `\n\nWeitere ${restCount} offene Bestellungen (niedrigere Priorität, nicht im Detail).` : "";

  const response = await chatCompletion({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Priorisierungsassistent für eine deutsche Baufirma.
Bewerte welche offenen Bestellungen am dringendsten bearbeitet werden müssen.

Kriterien (Gewichtung):
- Hoher Betrag = dringender
- Nahe/überschrittene Fälligkeit = sehr dringend
- Abweichung-Status = dringend (muss geprüft werden)
- Alter der Bestellung = je älter desto dringender
- Fehlende Dokumente = relevant

Gib NUR ein JSON-Objekt zurück:
{
  "bestellungen": [
    {
      "bestellnummer": "#45231",
      "prioritaet": "hoch",
      "score": 92,
      "grund": "Rechnung überfällig seit 3 Tagen, Betrag 2.450€"
    }
  ],
  "zusammenfassung": "3 Bestellungen mit hoher Priorität."
}

Sortiere nach Score absteigend. Maximal 10 Bestellungen.`,
      },
      {
        role: "user",
        content: `Offene Bestellungen (Top ${top.length} nach Pre-Filter):\n${top.map((b) =>
          `- ${b.bestellnummer} bei ${b.haendler}: Status=${b.status}, Betrag=${b.betrag ?? "?"}€, ${b.tage_alt} Tage alt, Fällig=${b.faelligkeitsdatum || "unbekannt"}, Rechnung=${b.hat_rechnung ? "ja" : "nein"}, LS=${b.hat_lieferschein ? "ja" : "nein"}`
        ).join("\n")}${restSummary}`,
      },
    ],
    max_tokens: 1500,
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<PriorisierungErgebnis>(text, { bestellungen: [], zusammenfassung: "Priorisierung konnte nicht durchgeführt werden." });
}

// 10. Kommentar-Zusammenfassung für eine Bestellung
export async function fasseBestellungZusammen(
  bestellung: { bestellnummer: string; haendler: string; status: string; betrag: number },
  abweichungen: { feld: string; artikel?: string; erwartet: string | number; gefunden: string | number }[],
  kommentare: { autor: string; text: string; datum: string }[]
): Promise<string> {
  const response = await chatCompletion({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Zusammenfassungs-Assistent für eine deutsche Baufirma.
Fasse den aktuellen Stand einer Bestellung in 2-3 prägnanten Sätzen auf Deutsch zusammen.
Berücksichtige Abweichungen und Kommentare. Schreibe so, dass die Buchhaltung sofort versteht was los ist.
Gib NUR den Text zurück, kein JSON.`,
      },
      {
        role: "user",
        content: `Bestellung: ${bestellung.bestellnummer} bei ${bestellung.haendler}
Status: ${bestellung.status}, Betrag: ${bestellung.betrag}€

Abweichungen:
${abweichungen.length > 0
  ? abweichungen.map((a) => `- ${a.feld}${a.artikel ? ` (${a.artikel})` : ""}: Erwartet ${a.erwartet}, gefunden ${a.gefunden}`).join("\n")
  : "Keine Abweichungen"}

Kommentare:
${kommentare.length > 0
  ? kommentare.map((k) => `- ${k.autor} (${k.datum}): ${k.text}`).join("\n")
  : "Keine Kommentare"}`,
      },
    ],
    max_tokens: 600,
  });

  return response.choices[0]?.message?.content || "Zusammenfassung konnte nicht erstellt werden.";
}
