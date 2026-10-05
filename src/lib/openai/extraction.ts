/**
 * KI-Operations zur Inline-Extraktion aus E-Mail-/Dokument-Text:
 * Besteller, Händler, Preis-Anomalien.
 *
 * 05.10.2026 — Subunternehmer-Erkennung, Besteller-Hinweise und Projekt-Match
 * entfernt: nirgends aufgerufen, nur Prompts ohne Leser.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import { openai, withRetry, chatCompletion, safeParseGptJson } from "./client";
import type { BestellerErkennungErgebnis, PreisAnomalieErgebnis } from "./prompts";

// 1. Intelligente Besteller-Erkennung anhand historischer Bestellmuster
export async function erkenneBestellerIntelligent(
  artikelAusEmail: { name: string; menge: number; einzelpreis: number }[],
  haendlerName: string,
  bestellerHistorie: { kuerzel: string; name: string; artikel_namen: string[]; haendler: string[] }[]
): Promise<BestellerErkennungErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Zuordnungsassistent für eine deutsche Baufirma.
Anhand der Artikel in einer neuen Bestellung und der Bestellhistorie der Mitarbeiter sollst du erkennen, wer wahrscheinlich bestellt hat.

Gib NUR ein JSON-Objekt zurück:
{
  "kuerzel": "MT",
  "konfidenz": 0.85,
  "begruendung": "Marlon bestellt regelmäßig Bosch-Werkzeug bei Bauhaus"
}

Falls du dir sehr unsicher bist (konfidenz < 0.4), setze kuerzel auf "UNBEKANNT".`,
      },
      {
        role: "user",
        // F4.11 Fix: Pre-Trim der Artikel- und Händler-Listen pro Besteller.
        // Top-5 Artikel + Top-5 Händler reichen für Profil-Erkennung; volle
        // Liste hätte Token-Verbrauch unnötig getrieben.
        content: `Neue Bestellung bei ${haendlerName}:
Artikel: ${JSON.stringify(artikelAusEmail.slice(0, 10))}

Bestellhistorie der Mitarbeiter:
${bestellerHistorie.map((b) => `${b.kuerzel} (${b.name}): Bestellt oft: ${b.artikel_namen.slice(0, 5).join(", ")} | Händler: ${b.haendler.slice(0, 5).join(", ")}`).join("\n")}`,
      },
    ],
    max_tokens: 500,
  })
  );

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<BestellerErkennungErgebnis>(text, { kuerzel: "UNBEKANNT", konfidenz: 0, begruendung: "Parsing fehlgeschlagen" });
}

// 3. Anomalie-Erkennung bei Preisen
export async function pruefePreisanomalien(
  aktuelleArtikel: { name: string; einzelpreis: number; menge: number }[],
  historischePreise: { name: string; preise: number[] }[]
): Promise<PreisAnomalieErgebnis> {
  const response = await chatCompletion({
    // R2/F4.2: numerischer Vergleich, kein Reasoning nötig — gpt-4o-mini reicht
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Preisüberwachungsassistent für eine deutsche Baufirma.
Vergleiche aktuelle Artikelpreise mit historischen Durchschnittspreisen.
Melde Abweichungen über 30% als Warnung.

Gib NUR ein JSON-Objekt zurück:
{
  "hat_anomalie": true,
  "warnungen": [
    {
      "artikel": "Bosch Bohrmaschine",
      "aktueller_preis": 890.00,
      "historischer_durchschnitt": 149.99,
      "abweichung_prozent": 493,
      "bewertung": "Preis fast 5x höher als üblich – bitte prüfen!"
    }
  ],
  "zusammenfassung": "1 Preiswarnung: Bosch Bohrmaschine deutlich teurer als üblich."
}

Falls alles normal ist: hat_anomalie false, warnungen leer.`,
      },
      {
        role: "user",
        content: `Aktuelle Rechnung/Bestellung:
${JSON.stringify(aktuelleArtikel)}

Historische Preise (letzte Einkäufe):
${historischePreise.map((h) => `${h.name}: ${h.preise.map((p) => p.toFixed(2) + "€").join(", ")}`).join("\n") || "Keine historischen Daten vorhanden."}`,
      },
    ],
    max_tokens: 1000,
  });

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<PreisAnomalieErgebnis>(text, { hat_anomalie: false, warnungen: [], zusammenfassung: "Preisanalyse konnte nicht durchgeführt werden." });
}

// 4. Automatische Händler-Erkennung aus E-Mail
export async function erkenneHaendlerAusEmail(
  emailAbsender: string,
  emailBetreff: string,
  erkannterHaendlerName: string | null
): Promise<{ name: string; domain: string; email_muster: string } | null> {
  const response = await chatCompletion({
    // R2/F4.2: einfache Domain-/Namens-Extraktion — gpt-4o-mini ausreichend
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Assistent der Händler/Lieferanten anhand von E-Mail-Daten erkennt.
Extrahiere den Firmennamen, die Domain und das E-Mail-Muster.

Gib NUR ein JSON-Objekt zurück:
{
  "name": "Bauhaus",
  "domain": "bauhaus.de",
  "email_muster": "noreply@bauhaus.de"
}

Falls du den Händler nicht erkennen kannst, gib null zurück.`,
      },
      {
        role: "user",
        // F4.9 Fix: User-Input via JSON-Encoding gegen Prompt-Injection
        content: `Analysiere folgenden Input (JSON):\n\`\`\`json\n${JSON.stringify({
          email_absender: emailAbsender,
          email_betreff: emailBetreff,
          erkannter_haendler_name: erkannterHaendlerName ?? null,
        })}\n\`\`\``,
      },
    ],
    max_tokens: 300,
  });

  const text = response.choices[0]?.message?.content || "null";
  if (text.trim() === "null") return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
