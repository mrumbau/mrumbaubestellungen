/**
 * R5c — Bestellung-Match-Logik
 *
 * Aus webhook/email/route.ts (Z. 800-1140) extrahiert + R5c-Bugfix.
 *
 * **Match-Logic-Bug aus 2026-04-29 (CHECK24-Beispiel):**
 * - Existierende Bestellung: bestellnummer="CBEPFVF", haendler_name="CHECK24"
 * - Neue Rechnung-Mail: bestellnummer="CP-CBEPFVF-128671457-1",
 *   haendler_name="CHECK24 Vergleichsportal Autoteile GmbH"
 * - Match-Pipeline machte nur exakten String-Vergleich → Mismatch → 2 Bestellungen
 *
 * **Fix in `findByFuzzyNumber`:**
 * - Substring-Match in beide Richtungen (DB.nr ⊂ extracted ODER extracted ⊂ DB.nr)
 * - Plus Händler-Token-Match (gemeinsame Tokens ≥4 chars als zusätzlicher Anker)
 * - Mindest-Länge der gemeinsamen Substring: 4 chars (verhindert "AB" matched alles)
 *
 * Match-Order:
 * 1. findByExactNumber — exakter Nummern-Match × Händler-Filter
 * 2. **findByFuzzyNumber** — NEU R5c — Substring + Token-Match
 * 3. findByCrossMatch — exakter Nummern-Match in allen Spalten ohne Händler
 * 4. findByBetragMatch — Händler + Betrag + 14d (gleiche Bestellung andere Nummer)
 * 5. findByErweiterterMatch — Händler + offen + Typ-noch-nicht-da + 14d
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logInfo } from "@/lib/logger";

export type BestellungRow = {
  id: string;
  bestellnummer?: string | null;
  auftragsnummer?: string | null;
  lieferscheinnummer?: string | null;
  betrag?: number | string | null;
  haendler_name?: string | null;
  hat_bestellbestaetigung?: boolean;
  hat_lieferschein?: boolean;
  hat_rechnung?: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  hat_versandbestaetigung?: boolean;
};

export interface MatchContext {
  /** Volles haendler-Objekt aus DB oder null */
  haendler: { id?: string | null; name?: string | null } | null;
  /** Subunternehmer-Match aus discover-step */
  subunternehmer: { id: string; firma: string } | null;
  /** Aufgelöster Händlername (für Name-basierte Suche) */
  haendlerName: string | null;
}

const STUFE1_SELECT =
  "id, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung";

// =====================================================================
// 1. EXAKTE NUMMER × HÄNDLER
// =====================================================================
export async function findByExactNumber(
  supabase: SupabaseClient,
  suchNummern: string[],
  ctx: MatchContext,
): Promise<BestellungRow | null> {
  for (const suchNr of suchNummern) {
    if (ctx.haendler?.id) {
      const { data: d1 } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("bestellnummer", suchNr).eq("haendler_id", ctx.haendler.id)
        .limit(1).maybeSingle();
      if (d1) return d1 as BestellungRow;

      const { data: d2 } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("auftragsnummer", suchNr).eq("haendler_id", ctx.haendler.id)
        .limit(1).maybeSingle();
      if (d2) return d2 as BestellungRow;

      const { data: d2b } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("lieferscheinnummer", suchNr).eq("haendler_id", ctx.haendler.id)
        .limit(1).maybeSingle();
      if (d2b) return d2b as BestellungRow;
    }
    if (ctx.haendlerName) {
      const { data: d3 } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("bestellnummer", suchNr).eq("haendler_name", ctx.haendlerName)
        .limit(1).maybeSingle();
      if (d3) return d3 as BestellungRow;

      const { data: d4 } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("auftragsnummer", suchNr).eq("haendler_name", ctx.haendlerName)
        .limit(1).maybeSingle();
      if (d4) return d4 as BestellungRow;

      const { data: d4b } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("lieferscheinnummer", suchNr).eq("haendler_name", ctx.haendlerName)
        .limit(1).maybeSingle();
      if (d4b) return d4b as BestellungRow;
    }
    if (ctx.subunternehmer) {
      const { data: d5 } = await supabase
        .from("bestellungen").select(STUFE1_SELECT)
        .eq("bestellnummer", suchNr).eq("subunternehmer_id", ctx.subunternehmer.id)
        .limit(1).maybeSingle();
      if (d5) return d5 as BestellungRow;
    }
  }
  return null;
}

// =====================================================================
// 2. FUZZY NUMMER (R5c — neuer Bugfix)
// =====================================================================

/**
 * Tokenisiert einen Händlernamen in normalisierte Wörter.
 * Filtert: Wörter <4 chars (zu generisch), reine Zahlen, Stop-Words.
 */
function tokenizeHaendler(name: string | null | undefined): Set<string> {
  if (!name) return new Set();
  const STOP = new Set(["gmbh", "kg", "ohg", "ag", "der", "die", "das", "und", "vergleichsportal", "service", "online", "shop", "store"]);
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-zäöüß0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

/**
 * Prüft ob zwei Händlernamen "ähnlich genug" sind (≥1 gemeinsames Token).
 * Beispiel: "CHECK24" vs "CHECK24 Vergleichsportal Autoteile GmbH" →
 * gemeinsames Token "check24" → true.
 */
export function haendlerNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const an = a.toLowerCase().trim();
  const bn = b.toLowerCase().trim();
  if (an === bn) return true;
  // Substring-Check (kurzer Name in langem)
  if (an.length >= 4 && bn.includes(an)) return true;
  if (bn.length >= 4 && an.includes(bn)) return true;
  // Token-Match
  const tokensA = tokenizeHaendler(a);
  const tokensB = tokenizeHaendler(b);
  for (const t of tokensA) {
    if (tokensB.has(t)) return true;
  }
  return false;
}

/**
 * Prüft ob zwei Bestellnummern "fuzzy gleich" sind: exakter Match,
 * oder eine ist Substring der anderen (Mindest-Länge 4 chars).
 * Beispiel: "CBEPFVF" ⊂ "CP-CBEPFVF-128671457-1" → true.
 */
export function bestellnummernFuzzyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const an = a.trim();
  const bn = b.trim();
  if (an === bn) return true;
  if (an.length < 4 || bn.length < 4) return false;
  return an.includes(bn) || bn.includes(an);
}

/**
 * R5c-Bugfix: Findet Bestellungen wo eine der erkannten Nummern als
 * Substring in DB-Nummer steht (oder vice versa) UND der Händler-Token-
 * Match passt.
 *
 * Lädt Kandidaten der letzten 30 Tage des erkannten Händlers, dann
 * JS-side Substring-Check (PostgREST kann column-side LIKE nicht direkt).
 * Bei mehreren Kandidaten: nimmt den jüngsten.
 */
export async function findByFuzzyNumber(
  supabase: SupabaseClient,
  suchNummern: string[],
  ctx: MatchContext,
): Promise<BestellungRow | null> {
  if (suchNummern.length === 0) return null;
  if (!ctx.haendler?.id && !ctx.haendlerName && !ctx.subunternehmer) return null;

  const dreissigTageZurueck = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("bestellungen")
    .select(`${STUFE1_SELECT}, bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name`)
    .gte("created_at", dreissigTageZurueck)
    .order("created_at", { ascending: false })
    .limit(30);

  if (ctx.haendler?.id) {
    q = q.eq("haendler_id", ctx.haendler.id);
  } else if (ctx.subunternehmer) {
    q = q.eq("subunternehmer_id", ctx.subunternehmer.id);
  } else if (ctx.haendlerName) {
    // Name-Filter: ilike mit Wildcards für Token-Match
    // (z.B. extracted="CHECK24 Vergleichsportal..." sucht "%CHECK24%")
    const tokens = [...tokenizeHaendler(ctx.haendlerName)];
    if (tokens.length > 0) {
      // Längster Token als ilike-Filter (reduziert Kandidaten-Set)
      const longest = tokens.sort((a, b) => b.length - a.length)[0];
      q = q.ilike("haendler_name", `%${longest}%`);
    } else {
      // Keine sinnvollen Tokens → fall through, full scan zu teuer
      return null;
    }
  }

  const { data: kandidaten } = await q;
  if (!kandidaten || kandidaten.length === 0) return null;

  for (const kandidat of kandidaten) {
    // Händler-Token-Match prüfen wenn nur via Name gefiltert wurde
    if (!ctx.haendler?.id && !ctx.subunternehmer) {
      if (!haendlerNamesMatch(ctx.haendlerName, kandidat.haendler_name)) continue;
    }

    // Nummern-Fuzzy-Match
    const dbNummern = [kandidat.bestellnummer, kandidat.auftragsnummer, kandidat.lieferscheinnummer].filter(
      (n): n is string => !!n,
    );
    for (const suchNr of suchNummern) {
      for (const dbNr of dbNummern) {
        if (bestellnummernFuzzyMatch(suchNr, dbNr)) {
          logInfo("webhook/email/match", "Fuzzy-Number-Match gefunden (R5c)", {
            bestellungId: kandidat.id,
            db_nummer: dbNr,
            erkannte_nummer: suchNr,
            haendler_kandidat: kandidat.haendler_name,
            haendler_email: ctx.haendlerName,
          });
          return kandidat as BestellungRow;
        }
      }
    }
  }

  return null;
}

// =====================================================================
// 3. CROSS-MATCH (Nummer in ALLEN Spalten ohne Händler-Filter)
// =====================================================================
export async function findByCrossMatch(
  supabase: SupabaseClient,
  suchNummern: string[],
): Promise<BestellungRow | null> {
  for (const suchNr of suchNummern) {
    const { data: crossMatch } = await supabase
      .from("bestellungen")
      .select(STUFE1_SELECT)
      .or(`bestellnummer.eq.${suchNr},auftragsnummer.eq.${suchNr},lieferscheinnummer.eq.${suchNr}`)
      .limit(1)
      .maybeSingle();
    if (crossMatch) {
      logInfo("webhook/email/match", "Cross-Match gefunden (ohne Händler-Filter)", { suchNr, bestellungId: crossMatch.id });
      return crossMatch as BestellungRow;
    }
  }
  return null;
}

// =====================================================================
// 4. BETRAG-MATCH (gleicher Händler + Betrag, 14 Tage)
// =====================================================================
export interface BetragMatchInput {
  betrag: number;
  hauptTyp: string;
  ctx: MatchContext;
}

export interface BetragMatchResult {
  bestellungId: string;
  alteNr: string | null;
  bestehendeBestellnummer: string | null;
  bestehendeAuftragsnummer: string | null;
}

export async function findByBetragMatch(
  supabase: SupabaseClient,
  input: BetragMatchInput,
): Promise<BetragMatchResult | null> {
  const { betrag, hauptTyp, ctx } = input;
  const TYP_FLAG: Record<string, string> = {
    bestellbestaetigung: "hat_bestellbestaetigung",
    lieferschein: "hat_lieferschein",
    rechnung: "hat_rechnung",
    aufmass: "hat_aufmass",
    leistungsnachweis: "hat_leistungsnachweis",
  };
  const flag = TYP_FLAG[hauptTyp];
  if (!flag) return null;

  const vierzehnTageZurueck = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("bestellungen")
    .select("id, bestellnummer, auftragsnummer, betrag")
    .eq("betrag", betrag)
    .gte("created_at", vierzehnTageZurueck)
    .in("status", ["offen", "vollstaendig"])
    .limit(1);

  if (ctx.haendler?.id) {
    q = q.eq("haendler_id", ctx.haendler.id);
  } else if (ctx.haendlerName) {
    q = q.eq("haendler_name", ctx.haendlerName);
  } else {
    return null;
  }

  const { data: match } = await q.maybeSingle();
  if (!match) return null;

  return {
    bestellungId: match.id,
    alteNr: match.bestellnummer || null,
    bestehendeBestellnummer: match.bestellnummer || null,
    bestehendeAuftragsnummer: match.auftragsnummer || null,
  };
}

// =====================================================================
// 5. ERWEITERTER MATCH (Händler + offen + Typ-noch-nicht-da + 14d)
// =====================================================================
export interface ErweiterterMatchInput {
  /** Erkannte Dokument-Typen aus den Anhang-Analysen */
  analyseTypen: string[];
  /** Erkannte Nummern (für Cross-Validation) */
  dokumentNummern: string[];
  /** Erkannter Betrag (für ±15%-Validation) */
  erkannterBetrag: number | null;
  ctx: MatchContext;
  bestellerKuerzel: string;
}

export async function findByErweiterterMatch(
  supabase: SupabaseClient,
  input: ErweiterterMatchInput,
): Promise<{ bestellungId: string; hauptTyp: string } | null> {
  const { analyseTypen, dokumentNummern, erkannterBetrag, ctx, bestellerKuerzel } = input;
  if (analyseTypen.length === 0) return null;

  const TYP_FLAG: Record<string, string> = {
    bestellbestaetigung: "hat_bestellbestaetigung",
    lieferschein: "hat_lieferschein",
    rechnung: "hat_rechnung",
    aufmass: "hat_aufmass",
    leistungsnachweis: "hat_leistungsnachweis",
    versandbestaetigung: "hat_versandbestaetigung",
  };

  const vierzehnTageZurueck = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("bestellungen")
    .select("id, bestellnummer, auftragsnummer, betrag, haendler_name, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung")
    .in("status", ["offen", "erwartet", "vollstaendig", "abweichung"])
    .gte("created_at", vierzehnTageZurueck);

  if (ctx.haendler?.id) {
    q = q.eq("haendler_id", ctx.haendler.id);
  } else if (ctx.subunternehmer) {
    q = q.eq("subunternehmer_id", ctx.subunternehmer.id);
  } else if (ctx.haendlerName) {
    q = q.ilike("haendler_name", ctx.haendlerName);
  } else {
    return null;
  }

  if (bestellerKuerzel && bestellerKuerzel !== "UNBEKANNT") {
    q = q.eq("besteller_kuerzel", bestellerKuerzel);
  }

  const { data: kandidaten } = await q.order("created_at", { ascending: false }).limit(5);
  if (!kandidaten || kandidaten.length === 0) return null;

  const hauptTyp = analyseTypen[0];
  const flag = TYP_FLAG[hauptTyp];
  if (!flag) return null;

  const match = kandidaten.find((k) => {
    if ((k as Record<string, unknown>)[flag]) return false;

    // R5c: Cross-Number-Validation jetzt FUZZY (war exakt)
    const kandidatNummern = [k.bestellnummer, k.auftragsnummer].filter((n): n is string => !!n);
    if (kandidatNummern.length > 0 && dokumentNummern.length > 0) {
      const hatUebereinstimmung = dokumentNummern.some((dn) =>
        kandidatNummern.some((kn) => bestellnummernFuzzyMatch(dn, kn)),
      );
      if (!hatUebereinstimmung) return false;
    }
    // Betrag-Validation (max 15% Abweichung)
    if (erkannterBetrag && k.betrag) {
      const abweichung = Math.abs(Number(k.betrag) - erkannterBetrag) / Math.max(Number(k.betrag), erkannterBetrag);
      if (abweichung > 0.15) return false;
    }
    return true;
  });

  if (match) {
    logInfo("webhook/email/match", "Erweiterter Match gefunden", {
      bestellungId: match.id, typ: hauptTyp,
    });
    return { bestellungId: match.id, hauptTyp };
  }
  return null;
}
