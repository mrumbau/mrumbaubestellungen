#!/usr/bin/env node
// 06.05.2026 — Direkt-Repair: PDFs aus Storage durch OpenAI schicken und Werte
// in dokumente + bestellungen zurückschreiben. Bypass für die Pipeline weil der
// retry-Cron diese spezifischen PDFs nicht erreicht (Mail-Hash-Idempotenz, alte
// Mails ohne Log).
//
// Usage: node scripts/repair-pdf-extraction.mjs

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

// .env.local laden
const env = readFileSync("./.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!SB_URL || !SB_KEY || !OPENAI_KEY) {
  console.error("ENV missing");
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const Schema = z.object({
  typ: z.enum(["bestellbestaetigung","lieferschein","rechnung","aufmass","leistungsnachweis","versandbestaetigung","unbekannt"]),
  vermutete_bestellungsart: z.enum(["material","subunternehmer","abo"]).nullable(),
  bestellnummer: z.string().nullable(),
  auftragsnummer: z.string().nullable(),
  lieferscheinnummer: z.string().nullable(),
  haendler: z.string().nullable(),
  datum: z.string().nullable(),
  artikel: z.array(z.object({ name: z.string(), menge: z.number(), einzelpreis: z.number(), gesamtpreis: z.number() })),
  gesamtbetrag: z.number().nullable(),
  netto: z.number().nullable(),
  mwst: z.number().nullable(),
  faelligkeitsdatum: z.string().nullable(),
  lieferdatum: z.string().nullable(),
  iban: z.string().nullable(),
  konfidenz: z.number(),
  lieferadressen: z.array(z.string()),
  volltext: z.string(),
  tracking_nummer: z.string().nullable(),
  versanddienstleister: z.string().nullable(),
  tracking_url: z.string().nullable(),
  voraussichtliche_lieferung: z.string().nullable(),
  kundennummer: z.string().nullable(),
  besteller_im_dokument: z.string().nullable(),
  projekt_referenz: z.string().nullable(),
  bestelldatum: z.string().nullable(),
});

const PROMPT = `Du analysierst Geschäftsdokumente für eine deutsche Baufirma (MR Umbau GmbH).
Extrahiere ALLE Werte präzise aus dem Dokument. Beträge als Zahl (z.B. 1999.30, kein Tausender-Punkt).
Bei Rechnungen: gesamtbetrag = Brutto-Endbetrag, netto = Netto-Summe, mwst = MwSt-Betrag.
Bei Subunternehmer-Rechnungen ohne Rechnungsnummer im klassischen Sinn: bestellnummer = die Rechnungsnummer (z.B. "309002-R").
Datum-Felder als YYYY-MM-DD.
typ-Klassifikation:
- "rechnung" wenn "Rechnung" im Header oder Brutto-Summe + Zahlungsziel
- "leistungsnachweis" wenn Anwalts/Honorar-Aufstellung
- "aufmass" wenn nur Maße/Skizzen ohne Preise
- "bestellbestaetigung" wenn "Bestellbestätigung" / "Auftragsbestätigung"
Liefere strikt JSON.`;

async function loadAndAnalyze(storagePath) {
  const { data, error } = await sb.storage.from("dokumente").download(storagePath);
  if (error || !data) throw new Error(`Storage-Download fehlgeschlagen: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  const base64 = buf.toString("base64");

  const tryModel = async (model) => {
    const completion = await openai.chat.completions.parse({
      model,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "file", file: { filename: "dokument.pdf", file_data: `data:application/pdf;base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: zodResponseFormat(Schema, "DokumentAnalyse"),
    });
    return completion.choices[0]?.message?.parsed ?? null;
  };

  let result = null;
  try { result = await tryModel("gpt-4o"); } catch (e) { console.warn(`  gpt-4o fehler: ${e.message}`); }
  if (!result || result.gesamtbetrag == null) {
    try {
      const r2 = await tryModel("gpt-5.5");
      if (r2 && (r2.gesamtbetrag != null || !result)) result = r2;
    } catch (e) { console.warn(`  gpt-5.5 fehler: ${e.message}`); }
  }
  return result;
}

async function repairDoc(doc) {
  console.log(`\n→ ${doc.haendler_name} ${doc.typ} (${doc.id.slice(0,8)})`);
  let analyse;
  try {
    analyse = await loadAndAnalyze(doc.storage_pfad);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    return { ok: false, reason: e.message };
  }
  if (!analyse) {
    console.error(`  ✗ KI lieferte null`);
    return { ok: false, reason: "ki_null" };
  }
  console.log(`  ki: typ=${analyse.typ} bn=${analyse.bestellnummer} brutto=${analyse.gesamtbetrag} netto=${analyse.netto}`);

  // dokumente updaten
  const updateDoc = {
    bestellnummer_erkannt: analyse.bestellnummer ?? null,
    auftragsnummer: analyse.auftragsnummer || null,
    lieferscheinnummer: analyse.lieferscheinnummer || null,
    artikel: analyse.artikel ?? null,
    gesamtbetrag: analyse.gesamtbetrag ?? null,
    netto: analyse.netto ?? null,
    mwst: analyse.mwst ?? null,
    faelligkeitsdatum: analyse.faelligkeitsdatum || null,
    lieferdatum: analyse.lieferdatum || null,
    iban: analyse.iban || null,
    kundennummer: analyse.kundennummer || null,
    besteller_im_dokument: analyse.besteller_im_dokument || null,
    projekt_referenz: analyse.projekt_referenz || null,
    bestelldatum: analyse.bestelldatum || null,
    ki_roh_daten: analyse,
  };
  const { error: dErr } = await sb.from("dokumente").update(updateDoc).eq("id", doc.id);
  if (dErr) {
    console.error(`  ✗ DB-Update Doku: ${dErr.message}`);
    return { ok: false, reason: dErr.message };
  }

  // bestellungen-Aggregat: Brutto > Netto + MwSt > BB-Betrag — NUR überschreiben wenn null
  const bestUpdate = {};
  if (analyse.gesamtbetrag != null) bestUpdate.betrag = analyse.gesamtbetrag;
  if (analyse.bestellnummer) bestUpdate.bestellnummer = analyse.bestellnummer;
  if (analyse.faelligkeitsdatum) bestUpdate.faelligkeitsdatum = analyse.faelligkeitsdatum;
  if (analyse.bestelldatum) bestUpdate.bestelldatum = analyse.bestelldatum;
  if (analyse.kundennummer) bestUpdate.kundennummer = analyse.kundennummer;
  if (analyse.auftragsnummer) bestUpdate.auftragsnummer = analyse.auftragsnummer;

  if (Object.keys(bestUpdate).length > 0) {
    // Vorher prüfen welche Felder schon gesetzt sind, um nicht zu überschreiben
    const { data: bRow } = await sb.from("bestellungen").select("betrag, bestellnummer, faelligkeitsdatum, bestelldatum, kundennummer, auftragsnummer").eq("id", doc.bestellung_id).single();
    const finalUpd = {};
    for (const [k, v] of Object.entries(bestUpdate)) {
      if (bRow?.[k] == null || bRow?.[k] === "") finalUpd[k] = v;
    }
    if (Object.keys(finalUpd).length > 0) {
      const { error: bErr } = await sb.from("bestellungen").update(finalUpd).eq("id", doc.bestellung_id);
      if (bErr) console.error(`  ✗ DB-Update Bestellung: ${bErr.message}`);
      else console.log(`  ✓ Bestellung gefüllt: ${JSON.stringify(finalUpd)}`);
    }
  }

  console.log(`  ✓ Doku-Felder gespeichert`);
  return { ok: true, analyse };
}

async function main() {
  const { data: docs, error } = await sb
    .from("dokumente")
    .select("id, bestellung_id, typ, storage_pfad, bestellungen!inner(haendler_name)")
    .not("storage_pfad", "is", null)
    .is("gesamtbetrag", null)
    .is("netto", null);
  if (error) { console.error(error); process.exit(1); }

  const filtered = (docs || []).filter(d => d.bestellungen?.haendler_name);
  console.log(`Found ${filtered.length} dokumente mit storage_pfad und null Werten`);

  const targets = filtered.map(d => ({
    id: d.id, bestellung_id: d.bestellung_id, typ: d.typ,
    storage_pfad: d.storage_pfad, haendler_name: d.bestellungen.haendler_name,
  }));

  let success = 0, failed = 0;
  for (const doc of targets) {
    const r = await repairDoc(doc);
    if (r.ok) success++; else failed++;
  }
  console.log(`\n=== ${success} erfolgreich, ${failed} fehlgeschlagen ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
