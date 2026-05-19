/**
 * KI-Operations zur Inline-Extraktion aus E-Mail-/Dokument-Text:
 * Besteller, Händler, Subunternehmer, Projekt-Match, Preis-Anomalien,
 * Besteller-Hinweise.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import { openai, withRetry, chatCompletion, safeParseGptJson } from "./client";
import type {
  BestellerErkennungErgebnis,
  BestellerHinweiseErgebnis,
  PreisAnomalieErgebnis,
  ProjektMatchErgebnis,
} from "./prompts";

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

// 4b. Automatische Subunternehmer-Erkennung aus E-Mail/Rechnung
export async function erkenneSubunternehmerAusEmail(
  emailAbsender: string,
  emailBetreff: string,
  erkannterName: string | null,
  dokumentText: string | null
): Promise<{ firma: string; gewerk: string | null; email_muster: string; steuer_nr: string | null; iban: string | null } | null> {
  const response = await chatCompletion({
    // R2/F4.2: Text-Matching für SU-Firmen-Erkennung — gpt-4o-mini ausreichend
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `Du bist ein Assistent der Subunternehmer anhand von E-Mail-Daten und Rechnungsinhalten erkennt.
Dies ist eine deutsche Baufirma (Innenausbau). Subunternehmer sind Handwerksbetriebe die Arbeitsleistungen erbringen.

Extrahiere:
- firma: Firmenname des Subunternehmers
- gewerk: Das Gewerk/die Branche (eines von: Elektro, Sanitär/Heizung, Trockenbau, Maler/Lackierer, Estrich, Fliesen, Bodenbelag, Schreiner/Tischler, Schlosser/Metallbau, Fenster/Türen, Dachdecker, Reinigung, Abbruch/Entsorgung, Sonstiges)
- email_muster: Die E-Mail-Adresse des Absenders
- steuer_nr: Steuer-Nr oder USt-ID falls im Dokument erkennbar
- iban: IBAN falls im Dokument erkennbar

Gib NUR ein JSON-Objekt zurück:
{
  "firma": "Elektro Müller GmbH",
  "gewerk": "Elektro",
  "email_muster": "rechnung@elektro-mueller.de",
  "steuer_nr": "DE123456789",
  "iban": "DE89 3704 0044 0532 0130 00"
}

Falls du den Subunternehmer nicht erkennen kannst, gib null zurück.`,
      },
      {
        role: "user",
        // F4.9 Fix: User-Input via JSON-Encoding gegen Prompt-Injection
        content: `Analysiere folgenden Input (JSON):\n\`\`\`json\n${JSON.stringify({
          email_absender: emailAbsender,
          email_betreff: emailBetreff,
          erkannter_firmenname: erkannterName ?? null,
          dokument_text_auszug: dokumentText ? dokumentText.slice(0, 2000) : null,
        })}\n\`\`\``,
      },
    ],
    max_tokens: 400,
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

// 9. Besteller-Hinweise aus E-Mail-Text und Dokumenten extrahieren
export async function extrahiereBestellerHinweise(
  emailText: string,
  emailBetreff: string,
  dokumentTexte: string[],
  bekannteBenutzer: { kuerzel: string; name: string; email: string }[]
): Promise<BestellerHinweiseErgebnis> {
  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `Du bist ein Zuordnungsassistent für eine deutsche Baufirma (MR Umbau GmbH).
Analysiere E-Mail-Text und Dokumentinhalte nach Hinweisen, wer die Bestellung aufgegeben hat.

Suche nach:
- Personennamen (Ansprechpartner, Besteller, "Bestellt von", "Aufgegeben von")
- Lieferadressen mit Personennamen ("z.Hd.", "c/o", "Empfänger")
- Kundennummern die einem Mitarbeiter zugeordnet werden können
- Telefonnummern oder E-Mail-Adressen im Dokument
- Abteilungshinweise oder Kostenstellen

Bekannte Mitarbeiter:
${bekannteBenutzer.map((b) => `- ${b.kuerzel}: ${b.name} (${b.email})`).join("\n")}

Gib NUR ein JSON-Objekt zurück:
{
  "gefundene_hinweise": [
    { "typ": "name", "wert": "Marlon Tschon", "quelle": "Lieferadresse" },
    { "typ": "kundennummer", "wert": "KD-4812", "quelle": "E-Mail-Text" }
  ],
  "vorgeschlagenes_kuerzel": "MT",
  "konfidenz": 0.75,
  "begruendung": "Name 'Marlon Tschon' in Lieferadresse gefunden, passt zu Mitarbeiter MT"
}

Falls keine Hinweise gefunden: vorgeschlagenes_kuerzel null, konfidenz 0.`,
        },
        {
          role: "user",
          content: `E-Mail-Betreff: ${emailBetreff}
E-Mail-Text (Auszug): ${emailText.slice(0, 2000)}

Dokumentinhalte:
${dokumentTexte.map((t, i) => `--- Dokument ${i + 1} ---\n${t.slice(0, 1500)}`).join("\n\n")}`,
        },
      ],
      max_tokens: 800,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  return safeParseGptJson<BestellerHinweiseErgebnis>(text, { gefundene_hinweise: [], vorgeschlagenes_kuerzel: null, konfidenz: 0, begruendung: "Parsing fehlgeschlagen" });
}

// 11. Projekt-Erkennung aus E-Mail + Dokumenten (GPT-4o, Stufen 1-3)
export async function erkenneProjektAusInhalt(params: {
  email_betreff: string;
  email_body: string;
  dokument_texte: string[];
  lieferadressen: string[];
  buero_adresse: string;
  aktive_projekte: {
    id: string;
    name: string;
    beschreibung: string | null;
    adresse: string | null;
    adresse_keywords: string[];
    kunden_name: string | null;
  }[];
}): Promise<ProjektMatchErgebnis | null> {
  if (params.aktive_projekte.length === 0) return null;

  const bueroHinweis = params.buero_adresse
    ? `Ignoriere die Büro-Adresse: ${params.buero_adresse}`
    : "Keine Büro-Adresse konfiguriert — überspringe diesen Filter.";

  const projekteListe = params.aktive_projekte.map((p) =>
    `- ID: ${p.id} | Name: "${p.name}" | Adresse: ${p.adresse || "keine"} | Keywords: [${p.adresse_keywords.join(", ")}] | Kunde: ${p.kunden_name || "keiner"} | Beschreibung: ${p.beschreibung || "keine"}`
  ).join("\n");

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `Du bist ein Assistent der Bestellungen Baustellen zuordnet.

Analysiere E-Mail und PDF-Inhalt und bestimme welche Baustelle/Projekt gemeint ist. Nutze diese Signale:

1. LIEFERADRESSE: Suche nach Lieferadressen im Text. Vergleiche mit den Baustellen-Adressen der Projekte. Fuzzy-Matching: "Kernstr. 14" = "Kernstraße 14". ${bueroHinweis}

2. PROJEKTNAME/BAUSTELLE: Suche nach direkten Erwähnungen von Projektnamen, Baustellen-Bezeichnungen, Objektnamen, BV-Nummern, Auftragsnummern. Vergleiche mit den Projektnamen und Beschreibungen.

3. KUNDENNAME: Suche nach Auftraggeber, Rechnungsempfänger, Auftraggeber-Adresse. Vergleiche mit Kundennamen der Projekte.

Wichtig: Artikelnamen sind KEIN Erkennungsmerkmal. Nur Adressen, Namen und Projektreferenzen zählen.

Antworte NUR als JSON:
{
  "projekt_id": "uuid oder null",
  "konfidenz": 0.0-1.0,
  "methode": "lieferadresse|projektname_text|kundenname|unbekannt",
  "begruendung": "Kurze deutsche Erklärung",
  "extrahierte_lieferadresse": "Adresse oder null",
  "extrahierter_projektname": "Name oder null"
}

Wenn kein Projekt passt: projekt_id=null, methode="unbekannt", konfidenz=0.`,
        },
        {
          role: "user",
          content: `AKTIVE PROJEKTE:
${projekteListe}

E-MAIL-BETREFF: ${params.email_betreff || "(leer)"}

E-MAIL-TEXT:
${(params.email_body || "").slice(0, 2000)}

EXTRAHIERTE LIEFERADRESSEN:
${params.lieferadressen.length > 0 ? params.lieferadressen.join("\n") : "(keine)"}

DOKUMENT-TEXTE:
${params.dokument_texte.length > 0
  ? params.dokument_texte.map((t, i) => `--- Dokument ${i + 1} ---\n${t.slice(0, 1500)}`).join("\n\n")
  : "(keine Dokument-Texte verfügbar)"}`,
        },
      ],
      max_tokens: 500,
    })
  );

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!parsed.projekt_id || parsed.methode === "unbekannt" || parsed.konfidenz <= 0) {
      return null;
    }
    return {
      projekt_id: parsed.projekt_id,
      konfidenz: Math.max(0, Math.min(1, Number(parsed.konfidenz) || 0)),
      methode: parsed.methode || "unbekannt",
      begruendung: parsed.begruendung || "",
      extrahierte_lieferadresse: parsed.extrahierte_lieferadresse || null,
      extrahierter_projektname: parsed.extrahierter_projektname || null,
    };
  } catch {
    return null;
  }
}
