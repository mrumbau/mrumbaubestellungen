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
    haendler_id: string | null;
    haendler_name: string | null;
    vorausbezahlt: boolean | null;
  };
  const { data } = await supabase
    .from("bestellungen")
    .select(
      "bestellnummer, auftragsnummer, lieferscheinnummer, betrag, " +
      "voraussichtliche_lieferung, lieferadresse_erkannt, tracking_nummer, " +
      "bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, " +
      "haendler_id, haendler_name, vorausbezahlt",
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

  // ----- 22.09.2026 — Fehlende Haendler-Verknuepfung nachtragen -----
  //
  // haendler_id wurde bisher AUSSCHLIESSLICH beim Anlegen der Bestellung
  // gesetzt (bestellung-finden.ts). War der Haendler in diesem Moment nicht
  // aufloesbar — etwa weil die Rechnung vor der Bestaetigung eintraf oder der
  // Absender noch nicht im Stamm stand —, blieb das Feld fuer immer leer.
  // Auch dann, wenn ein spaeteres Dokument den Haendler eindeutig benennt und
  // haendler_name nachgetragen wurde.
  //
  // Das betraf 179 von 377 Bestellungen (47 %). Die Verknuepfung ist aber der
  // Anker fuer die Match-Stufen 1, 4 und 5, fuer die Haendler-Affinitaet und
  // fuer die Stammdaten (vorausbezahlt, Zahlungsziel). Fehlt sie, faellt alles
  // auf Textvergleiche zurueck — dort entstehen die Fehlzuordnungen.
  //
  // Jetzt heilt sich das bei jedem weiteren Dokument selbst.
  let haendlerId = existing.haendler_id;
  if (!haendlerId && existing.haendler_name) {
    const gefunden = await findeHaendlerId(supabase, existing.haendler_name);
    if (gefunden) {
      updateFields.haendler_id = gefunden;
      haendlerId = gefunden;
      logInfo("webhook/email/propagate", "Haendler-Verknuepfung nachgetragen", {
        bestellungId, haendler: existing.haendler_name, haendlerId: gefunden,
      });
    }
  }

  // ----- 21.09.2026 — Haendler-Stammdaten: vorausbezahlt + Zahlungsziel -----
  // Zwei Dinge, die das System bisher aus dem Belegtext zu erraten versuchte,
  // obwohl sie laengst bekannt sind:
  //
  //   1. Bei Amazon Business wurde von 44 Rechnungen KEINE als bereits bezahlt
  //      erkannt, bei Bernstein 4 von 4 — weil Bernstein "PayPal" auf die
  //      Rechnung schreibt und Amazon nicht. Wo der Haendler immer
  //      vorausbezahlt ist, gehoert das in die Stammdaten statt in die KI.
  //   2. Die meisten Vendor-Parser setzen faelligkeitsdatum hart auf null. Mit
  //      hinterlegtem Zahlungsziel laesst es sich aus dem Rechnungsdatum
  //      berechnen, auch wenn auf dem Beleg nichts steht.
  //
  // Beides nur additiv: gesetzte Werte werden nie ueberschrieben, und ein
  // fehlender Stammsatz aendert schlicht nichts.
  const stamm = await ladeHaendlerStammdaten(supabase, haendlerId, existing.haendler_name);

  // Wie ist_gutschrift eine ODER-Logik: einmal vorausbezahlt bleibt
  // vorausbezahlt. Zurueckgenommen wird das nur von Hand.
  if (stamm?.immer_vorausbezahlt && !existing.vorausbezahlt) {
    updateFields.vorausbezahlt = true;
    logInfo("webhook/email/propagate", "Bestellung als vorausbezahlt markiert (Haendler-Stammdaten)", {
      bestellungId,
      haendler: existing.haendler_name,
    });
  }

  // Rueckfall-Faelligkeit. Greift nur, wenn die Rechnung selbst keine liefert
  // (weder aus dem Beleg noch bereits gespeichert) — die echte Zahlfrist vom
  // Dokument hat immer Vorrang.
  const faelligkeitFehlt = !existing.faelligkeitsdatum && !updateFields.faelligkeitsdatum;
  if (faelligkeitFehlt && analyse.typ === "rechnung" && stamm?.zahlungsziel_tage) {
    const basis = analyse.datum ?? existing.bestelldatum;
    const berechnet = addiereTage(basis, stamm.zahlungsziel_tage);
    if (berechnet) {
      updateFields.faelligkeitsdatum = berechnet;
      logInfo("webhook/email/propagate", "Faelligkeit aus Zahlungsziel berechnet", {
        bestellungId, basis, tage: stamm.zahlungsziel_tage, ergebnis: berechnet,
      });
    }
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

/**
 * Laedt die Stammdaten des Haendlers einer Bestellung.
 *
 * Bevorzugt ueber haendler_id. Die Verknuepfung fehlt aber nicht selten — von
 * 27 Amazon-Business-Bestellungen hatten sieben gar keine haendler_id —,
 * deshalb der Rueckfall ueber den Namen. Der laeuft bewusst NUR gegen die
 * ausdruecklich als vorausbezahlt gepflegten Haendler und nicht gegen den
 * gesamten Stamm: "Amazon" soll "Amazon Business" treffen, aber kein
 * Praefix-Zufall einen fremden Haendler mitnehmen.
 *
 * Fail-soft: bei einem Fehler gibt es keine Stammdaten und damit auch keine
 * Aenderung — die Pipeline laeuft weiter.
 */
async function ladeHaendlerStammdaten(
  supabase: SupabaseClient,
  haendlerId: string | null,
  haendlerName: string | null,
): Promise<{ immer_vorausbezahlt: boolean; zahlungsziel_tage: number | null } | null> {
  try {
    if (haendlerId) {
      const { data } = await supabase
        .from("haendler").select("immer_vorausbezahlt, zahlungsziel_tage")
        .eq("id", haendlerId).maybeSingle();
      if (data) {
        return {
          immer_vorausbezahlt: data.immer_vorausbezahlt === true,
          zahlungsziel_tage: data.zahlungsziel_tage ?? null,
        };
      }
    }

    if (!haendlerName) return null;
    const { data: kandidaten } = await supabase
      .from("haendler").select("name, immer_vorausbezahlt, zahlungsziel_tage")
      .eq("immer_vorausbezahlt", true);
    const name = haendlerName.toLowerCase().trim();
    const treffer = (kandidaten ?? []).find((h) => {
      const k = String(h.name ?? "").toLowerCase().trim();
      return k.length > 0 && name.startsWith(k);
    });
    if (!treffer) return null;
    return {
      immer_vorausbezahlt: true,
      zahlungsziel_tage: treffer.zahlungsziel_tage ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Addiert Tage auf ein ISO-Datum und liefert wieder YYYY-MM-DD.
 * Unbrauchbare Eingaben ergeben null — dann bleibt die Faelligkeit leer,
 * was ehrlicher ist als ein erfundenes Datum.
 */
function addiereTage(basis: string | null | undefined, tage: number): string | null {
  if (!basis || !Number.isFinite(tage)) return null;
  const d = new Date(basis);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Sucht den Haendler-Stammsatz zu einem Haendlernamen.
 *
 * Zwei Stufen, beide case-insensitiv:
 *   1. exakter Name
 *   2. Praefix in beide Richtungen ("Amazon Business" ↔ "Amazon",
 *      "Tervex bau" ↔ "Tervex Bau – Mjaltor Zekjiri")
 *
 * Entscheidend: Es wird NUR verknuepft, wenn genau ein Stammsatz passt. In
 * den echten Daten trifft "Amazon Business" zwei Eintraege (amazon.de und
 * amazon.com) — dort waere jede Wahl geraten. Lieber keine Verknuepfung als
 * eine falsche: eine fehlende faellt beim naechsten Dokument wieder auf, eine
 * falsche zieht Affinitaet und Stammdaten dauerhaft in die Irre.
 *
 * Fail-soft: bei einem Fehler bleibt es bei null, die Pipeline laeuft weiter.
 */
async function findeHaendlerId(
  supabase: SupabaseClient,
  haendlerName: string,
): Promise<string | null> {
  const name = haendlerName.trim();
  if (name.length < 3) return null;

  try {
    const { data } = await supabase.from("haendler").select("id, name");
    const alle = (data ?? []) as Array<{ id: string; name: string | null }>;
    const ziel = name.toLowerCase();

    const exakt = alle.filter((h) => String(h.name ?? "").toLowerCase().trim() === ziel);
    if (exakt.length === 1) return exakt[0].id;
    if (exakt.length > 1) return null;

    const praefix = alle.filter((h) => {
      const k = String(h.name ?? "").toLowerCase().trim();
      if (k.length < 3) return false;
      return ziel.startsWith(k) || k.startsWith(ziel);
    });
    return praefix.length === 1 ? praefix[0].id : null;
  } catch {
    return null;
  }
}
