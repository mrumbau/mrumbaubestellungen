/**
 * Field-Propagation: Analyse-Result → bestellungen-Tabelle.
 *
 * Eine Function `propagateAnalyseFields` mit zwei Modi:
 *   mode="document"  → setzt hat_*-Flag, RG überschreibt betrag (= applyAnalyse)
 *   mode="body"      → keine Flags (Body ist kein Doku), kein betrag-overwrite
 *
 * Beide Modi propagieren ALLE übrigen Felder fill-if-empty. Identische Lese-
 * Query (1 SELECT statt 2). Verhindert Drift bei künftigen neuen Feldern.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DokumentAnalyse } from "@/lib/openai";
import { buildTrackingUrl } from "@/lib/tracking-urls";
import { logInfo } from "@/lib/logger";
import { FLAG_MAP } from "./constants";

export interface PropagateOptions {
  /** "document" = Doku-basiert (mit FLAG-Set + RG-Betrag-Overwrite). "body" = Body-Analyse (nur fill-if-empty). */
  mode: "document" | "body";
  /** Händler-Kontext für haendler_name-Auto-Fill (wenn aktueller Wert leer/Domain). */
  haendlerContext?: { current: string; absenderDomain: string };
}

export async function propagateAnalyseFields(
  supabase: SupabaseClient,
  bestellungId: string,
  analyse: DokumentAnalyse,
  options: PropagateOptions,
): Promise<{ haendlerName: string | null }> {
  // Lese-Query: 1 SELECT mit allen propagierbaren Feldern.
  type ExistingRow = {
    bestellnummer: string | null;
    auftragsnummer: string | null;
    lieferscheinnummer: string | null;
    betrag: number | null;
    voraussichtliche_lieferung: string | null;
    lieferadresse_erkannt: string | null;
    tracking_nummer: string | null;
    bestelldatum: string | null;
    faelligkeitsdatum: string | null;
    kundennummer: string | null;
    projekt_referenz: string | null;
  };
  const { data } = await supabase
    .from("bestellungen")
    .select(
      "bestellnummer, auftragsnummer, lieferscheinnummer, betrag, " +
      "voraussichtliche_lieferung, lieferadresse_erkannt, tracking_nummer, " +
      "bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz",
    )
    .eq("id", bestellungId)
    .maybeSingle();
  const existing = data as ExistingRow | null;
  if (!existing) return { haendlerName: null };

  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // hat_*-Flag (nur bei Doku-Mode)
  if (options.mode === "document" && FLAG_MAP[analyse.typ]) {
    updateFields[FLAG_MAP[analyse.typ]] = true;
  }

  // ----- Identifikatoren — fill-if-empty + LS-Upgrade-Logik -----
  // 07./08.05.2026 — fill-if-empty in beiden Modi (Doku + Body). Plus:
  // bestellnummer wird **upgegradet** wenn aktueller Wert eine Lieferschein-
  // nummer ist (= identisch mit existing.lieferscheinnummer) und ein besserer
  // Wert verfügbar ist (Auftrags-/Bestell-/Rechnungsnummer aus dem Doku).
  // Begründung: Pipeline-Vorgänger setzte bei Lieferschein-Mails die LS-Nr
  // als bestellnummer — semantisch falsch, weil eine Bestellung mehrere LS
  // haben kann und die LS-Nr keine stabile Bestell-Identität ist.
  if (analyse.typ !== "versandbestaetigung") {
    const fillIfEmpty = (field: keyof ExistingRow, value: string | null | undefined) => {
      if (!value) return;
      if (existing[field]) {
        if (existing[field] !== value) {
          logInfo("webhook/email/propagate", `Konflikt ${field}: existing="${existing[field]}" vs neu="${value}" — bleibt existing`, {
            bestellungId, doku_typ: analyse.typ,
          });
        }
        return;
      }
      updateFields[field] = value;
    };

    // bestellnummer-Upgrade: wenn aktueller Wert die LS-Nr ist, eine bessere
    // Identifikation einsetzen (Auftragsnummer > Bestellnr > Rechnungsnr).
    const aktBestellnr = existing.bestellnummer;
    const ls = existing.lieferscheinnummer;
    const istBestellnummerLsNr = !!aktBestellnr && !!ls && aktBestellnr === ls;
    if (istBestellnummerLsNr) {
      const besserNr = analyse.auftragsnummer || analyse.bestellnummer;
      if (besserNr && besserNr !== aktBestellnr) {
        updateFields.bestellnummer = besserNr;
        logInfo("webhook/email/propagate", `bestellnummer upgegradet: LS-Nr "${aktBestellnr}" → "${besserNr}"`, {
          bestellungId, doku_typ: analyse.typ,
        });
      }
    } else {
      fillIfEmpty("bestellnummer", analyse.bestellnummer);
    }

    fillIfEmpty("auftragsnummer", analyse.auftragsnummer);
    fillIfEmpty("lieferscheinnummer", analyse.lieferscheinnummer);
  }

  // ----- Betrag — RG überschreibt im Doku-Mode, sonst fill-if-empty -----
  // (DB-Trigger sync_bestellung_betrag_from_rechnungen liefert finale RG-Summe)
  const effektiverBetrag = analyse.gesamtbetrag != null ? analyse.gesamtbetrag : (analyse.netto ?? null);
  const istNetto = !analyse.gesamtbetrag && !!analyse.netto;
  if (effektiverBetrag != null && analyse.typ !== "versandbestaetigung") {
    const istRgOverwrite = options.mode === "document" && analyse.typ === "rechnung";
    if (istRgOverwrite || !existing.betrag) {
      updateFields.betrag = effektiverBetrag;
      if (istNetto) updateFields.betrag_ist_netto = true;
    }
  }

  // ----- Tracking-Felder (auch BB/RG können Tracking liefern) -----
  if (analyse.tracking_nummer && (options.mode === "document" || !existing.tracking_nummer)) {
    updateFields.tracking_nummer = analyse.tracking_nummer;
    if (analyse.versanddienstleister) updateFields.versanddienstleister = analyse.versanddienstleister;
    if (analyse.tracking_url) {
      updateFields.tracking_url = analyse.tracking_url;
    } else if (analyse.versanddienstleister) {
      const autoUrl = buildTrackingUrl(analyse.versanddienstleister, analyse.tracking_nummer);
      if (autoUrl) updateFields.tracking_url = autoUrl;
    }
  }

  // ----- Liefertermin (VB liefert voraussichtliche_lieferung, BB lieferdatum) -----
  const lieferterminKandidat = analyse.voraussichtliche_lieferung ?? analyse.lieferdatum;
  if (lieferterminKandidat && !existing.voraussichtliche_lieferung) {
    updateFields.voraussichtliche_lieferung = lieferterminKandidat;
  }

  // ----- Lieferadresse, Bestelldatum, Kundennummer, Projekt-Referenz — fill-if-empty -----
  if (analyse.lieferadressen && analyse.lieferadressen.length > 0
      && analyse.lieferadressen[0] && !existing.lieferadresse_erkannt) {
    updateFields.lieferadresse_erkannt = analyse.lieferadressen[0];
  }
  if (analyse.bestelldatum && !existing.bestelldatum) {
    updateFields.bestelldatum = analyse.bestelldatum;
  }
  // Fälligkeit NUR aus Rechnung (= echte Zahlfrist; BB-Liefertermin wäre falsch)
  if (analyse.faelligkeitsdatum && analyse.typ === "rechnung" && !existing.faelligkeitsdatum) {
    updateFields.faelligkeitsdatum = analyse.faelligkeitsdatum;
  }
  if (analyse.kundennummer && !existing.kundennummer) {
    updateFields.kundennummer = analyse.kundennummer;
  }
  if (analyse.projekt_referenz && !existing.projekt_referenz) {
    updateFields.projekt_referenz = analyse.projekt_referenz;
  }

  // ----- 17.05.2026 — Gutschrift-Flag — ODER-Logik, einmal true bleibt true.
  // Wenn IRGENDEIN Doku der Bestellung eine Gutschrift ist, ist die ganze
  // Bestellung eine Gutschrift (= keine Freigabe nötig, direkt in Buchhaltung).
  // Wir lesen den existing-Wert nicht extra aus, weil es ODER ist: false→true
  // schadet nicht, true→true ist No-Op. Andere Richtung verhindern via Skip.
  if (analyse.ist_gutschrift === true) {
    updateFields.ist_gutschrift = true;
  }

  // ----- Händlername — fallback wenn Domain-Pseudo / leer -----
  let haendlerNameAfter: string | null = null;
  if (options.haendlerContext && analyse.haendler) {
    const ctx = options.haendlerContext;
    if (!ctx.current || ctx.current === ctx.absenderDomain || ctx.current === "") {
      updateFields.haendler_name = analyse.haendler;
      haendlerNameAfter = analyse.haendler;
      logInfo("webhook/email", `Händlername aus ${options.mode}-Analyse übernommen: ${analyse.haendler}`);
    }
  }

  await supabase.from("bestellungen").update(updateFields).eq("id", bestellungId);
  return { haendlerName: haendlerNameAfter };
}

// Backward-compat-Wrapper: alte Signatur für die existing Call-Sites
export async function applyAnalyseToBestellung(
  supabase: SupabaseClient,
  bestellungId: string,
  analyse: DokumentAnalyse,
  ctx?: { haendlerName: string; absenderDomain: string },
): Promise<string | null> {
  const result = await propagateAnalyseFields(supabase, bestellungId, analyse, {
    mode: "document",
    haendlerContext: ctx ? { current: ctx.haendlerName, absenderDomain: ctx.absenderDomain } : undefined,
  });
  return result.haendlerName;
}

export async function ergaenzeFelder(
  supabase: SupabaseClient,
  bestellungId: string,
  bodyAnalyse: DokumentAnalyse,
  haendlerName: string,
  absenderDomain: string,
): Promise<void> {
  await propagateAnalyseFields(supabase, bestellungId, bodyAnalyse, {
    mode: "body",
    haendlerContext: { current: haendlerName, absenderDomain },
  });
}
