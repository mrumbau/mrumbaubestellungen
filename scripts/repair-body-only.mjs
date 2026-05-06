#!/usr/bin/env node
// Body-only Repair: für Dokumente ohne PDF aber mit ki_roh_daten.email_text
// 06.05.2026

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const env = readFileSync("./.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

const PROMPT = `Du analysierst E-Mails (Body-Text) für eine deutsche Baufirma (MR Umbau GmbH).
Extrahiere ALLE Werte präzise. Beträge als Zahl (z.B. 36.39, kein Tausender-Punkt).
Bei Amazon-Bestellbestätigungen ist der Gesamtbetrag oft als "Bestellsumme:" oder "Total:" markiert.
Bei Bestellbestätigungen mit nur Brutto: gesamtbetrag = das, netto/mwst = NULL.
Datum-Felder als YYYY-MM-DD.
Liefere strikt JSON.`;

async function analyseText(text) {
  const tryModel = async (model) => {
    const completion = await openai.chat.completions.parse({
      model,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: text.slice(0, 15000) },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: zodResponseFormat(Schema, "DokumentAnalyse"),
    });
    return completion.choices[0]?.message?.parsed ?? null;
  };
  let r = null;
  try { r = await tryModel("gpt-4o"); } catch (e) { console.warn(`  gpt-4o: ${e.message}`); }
  return r;
}

async function repairDoc(doc, body) {
  console.log(`\n→ ${doc.typ} (${doc.id.slice(0,8)}) bestellung=${doc.bestellung_id.slice(0,8)} body=${body.length}`);
  const a = await analyseText(body);
  if (!a) { console.error("  ✗ KI null"); return false; }
  console.log(`  ki: typ=${a.typ} bn=${a.bestellnummer} brutto=${a.gesamtbetrag} netto=${a.netto}`);

  await sb.from("dokumente").update({
    bestellnummer_erkannt: a.bestellnummer,
    auftragsnummer: a.auftragsnummer || null,
    lieferscheinnummer: a.lieferscheinnummer || null,
    artikel: a.artikel ?? null,
    gesamtbetrag: a.gesamtbetrag,
    netto: a.netto,
    mwst: a.mwst,
    faelligkeitsdatum: a.faelligkeitsdatum,
    lieferdatum: a.lieferdatum,
    iban: a.iban,
    kundennummer: a.kundennummer || null,
    besteller_im_dokument: a.besteller_im_dokument || null,
    projekt_referenz: a.projekt_referenz || null,
    bestelldatum: a.bestelldatum || null,
    ki_roh_daten: a,
  }).eq("id", doc.id);

  // Bestellung-Felder ergänzen, nur wenn null
  const upd = {};
  if (a.gesamtbetrag != null) upd.betrag = a.gesamtbetrag;
  if (a.bestellnummer) upd.bestellnummer = a.bestellnummer;
  if (a.faelligkeitsdatum) upd.faelligkeitsdatum = a.faelligkeitsdatum;
  if (a.bestelldatum) upd.bestelldatum = a.bestelldatum;
  if (a.kundennummer) upd.kundennummer = a.kundennummer;
  if (a.auftragsnummer) upd.auftragsnummer = a.auftragsnummer;

  if (Object.keys(upd).length > 0) {
    const { data: bRow } = await sb.from("bestellungen").select("betrag, bestellnummer, faelligkeitsdatum, bestelldatum, kundennummer, auftragsnummer").eq("id", doc.bestellung_id).single();
    const fin = {};
    for (const [k, v] of Object.entries(upd)) {
      if (bRow?.[k] == null || bRow?.[k] === "") fin[k] = v;
    }
    if (Object.keys(fin).length > 0) {
      await sb.from("bestellungen").update(fin).eq("id", doc.bestellung_id);
      console.log(`  ✓ bestellung: ${JSON.stringify(fin)}`);
    }
  }
  return true;
}

async function main() {
  // alle dokumente mit ki_roh_daten.email_text und null gesamtbetrag (typischerweise Body-only)
  const ids = [
    'd1af5bc6-455a-415a-966e-e668bffa09f7', // 35de0712 Amazon DE6CG33VAEUR rechnung
    'ae45e14a-d858-4d96-a3ba-2a8eb68ce83d', // 53d52ee1 Amazon 302-4659087 BB
    'cef0d735-7680-4490-bce3-1cbd1cb20af7', // 6a1e0b18 Megabad MPQHSB5 BB
    '94118de7-2310-47f2-bfe2-abea3c923681', // 9c59d7a2 Amazon 302-9734775 BB
    '22a68c4e-8f8a-4b05-a7a1-76c5082463d2', // b2831e91 Steuerkanzlei 260122 RG
  ];
  const { data: docs } = await sb.from("dokumente").select("id, bestellung_id, typ, ki_roh_daten").in("id", ids);
  console.log(`Found ${docs.length} body-only docs`);
  let ok = 0, fail = 0;
  for (const d of docs) {
    const body = d.ki_roh_daten?.email_text;
    if (!body || body.length < 50) { console.log(`  skip ${d.id.slice(0,8)}: kein body`); continue; }
    const r = await repairDoc(d, body);
    if (r) ok++; else fail++;
  }
  console.log(`\n=== ${ok} ok, ${fail} fail ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
