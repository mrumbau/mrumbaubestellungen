/**
 * R5c — Versand-Email-Handler
 *
 * Aus webhook/email/route.ts (Z. 1919-2094) extrahiert.
 *
 * Versand-Mails kommen in der Regel vom Carrier (DHL/DPD/Hermes etc.),
 * nicht vom Händler. Sie werden NIE als neue Bestellung erstellt — nur
 * an existierende Bestellungen angehängt. Wenn keine zugehörige Bestellung
 * findbar ist, wird die Mail verworfen.
 *
 * Tracking-Erkennung: Tracking-Nummer + Carrier + URL aus dem Body via
 * Regex. Kein OpenAI-Call (Versand-Mails sind strukturell einfach).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logError, logInfo } from "@/lib/logger";
import { buildTrackingUrl } from "@/lib/tracking-urls";
import { updateBestellungStatus } from "@/lib/bestellung-utils";
import type { NormalizedAnhang } from "./anhang-handling";

export interface VersandHandlerInput {
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  emailText: string;
  anhaenge: NormalizedAnhang[];
  absenderDomain: string;
  startTime: number;
}

export interface VersandHandlerResult {
  success: true;
  bestellung_id?: string;
  skipped?: true;
  reason?: string;
  versand?: {
    tracking_nummer: string | null;
    versanddienstleister: string | null;
    tracking_url: string | null;
  };
}

const CARRIERS = [
  { name: "DHL", pattern: /\bDHL\b/i },
  { name: "DPD", pattern: /\bDPD\b/i },
  { name: "Hermes", pattern: /\bHermes\b/i },
  { name: "UPS", pattern: /\bUPS\b/i },
  { name: "GLS", pattern: /\bGLS\b/i },
  { name: "FedEx", pattern: /\bFedEx\b/i },
  { name: "Deutsche Post", pattern: /\bDeutsche Post\b/i },
];

function detectCarrier(emailText: string, absenderDomain: string): string | null {
  const carrier = CARRIERS.find((c) => c.pattern.test(emailText));
  if (carrier) return carrier.name;
  if (absenderDomain.includes("dhl")) return "DHL";
  if (absenderDomain.includes("dpd")) return "DPD";
  if (absenderDomain.includes("hermes")) return "Hermes";
  if (absenderDomain.includes("ups")) return "UPS";
  if (absenderDomain.includes("gls")) return "GLS";
  return null;
}

export async function handleVersandEmail(
  supabase: SupabaseClient,
  input: VersandHandlerInput,
): Promise<VersandHandlerResult> {
  const { email_betreff, email_absender, email_datum, emailText, anhaenge, absenderDomain, startTime } = input;

  logInfo("webhook/email/versand", `Versand-Email von ${absenderDomain}`, { email_betreff });

  // Tracking-Daten extrahieren
  let trackingNummer: string | null = null;
  let trackingUrl: string | null = null;
  const trackingMatch = emailText.match(/(?:sendungsnummer|tracking[- ]?(?:nr|nummer|number|id|code)|paketnummer|shipment)[:\s]*([A-Z0-9]{8,30})/i);
  if (trackingMatch) trackingNummer = trackingMatch[1];

  const versanddienstleister = detectCarrier(emailText, absenderDomain);

  const urlMatch = emailText.match(/https?:\/\/[^\s"'<>]+(?:track|sendung|parcel|verfolg)[^\s"'<>]*/i);
  if (urlMatch) {
    trackingUrl = urlMatch[0];
  } else if (versanddienstleister && trackingNummer) {
    trackingUrl = buildTrackingUrl(versanddienstleister, trackingNummer) || null;
  }

  // Bestellnummer aus Betreff oder Body
  const bestellnrMatch =
    emailText.match(/(?:bestellnummer|bestellung|order|auftrag)[:\s#]*([A-Z0-9-]{4,30})/i)
    || (email_betreff || "").match(/(?:bestellnummer|bestellung|order|auftrag)[:\s#]*([A-Z0-9-]{4,30})/i);

  let bestellungId: string | null = null;

  if (bestellnrMatch) {
    const { data } = await supabase
      .from("bestellungen")
      .select("id")
      .eq("bestellnummer", bestellnrMatch[1])
      .limit(1)
      .maybeSingle();
    if (data) bestellungId = data.id;
  }

  if (!bestellungId) {
    // Fallback: Letzte offene Material-Bestellung der letzten 7 Tage ohne Versand
    const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: kandidaten } = await supabase
      .from("bestellungen")
      .select("id, hat_versandbestaetigung, hat_bestellbestaetigung")
      .in("status", ["offen", "erwartet", "vollstaendig"])
      .eq("bestellungsart", "material")
      .eq("hat_versandbestaetigung", false)
      .gte("created_at", siebenTageZurueck)
      .order("created_at", { ascending: false })
      .limit(5);

    if (kandidaten && kandidaten.length === 1) {
      bestellungId = kandidaten[0].id;
    } else if (kandidaten && kandidaten.length > 1) {
      const mitBestaetigung = kandidaten.find((k) => k.hat_bestellbestaetigung);
      if (mitBestaetigung) bestellungId = mitBestaetigung.id;
    }
  }

  if (!bestellungId) {
    logInfo("webhook/email/versand", "Versand-Email ohne zugehörige Bestellung verworfen", {
      tracking: trackingNummer,
      carrier: versanddienstleister,
    });
    return { success: true, skipped: true, reason: "versand_ohne_bestellung" };
  }

  // Tracking-Daten in Bestellung speichern
  const update: Record<string, unknown> = {
    hat_versandbestaetigung: true,
    updated_at: new Date().toISOString(),
  };
  if (trackingNummer) update.tracking_nummer = trackingNummer;
  if (versanddienstleister) update.versanddienstleister = versanddienstleister;
  if (trackingUrl) update.tracking_url = trackingUrl;

  await supabase.from("bestellungen").update(update).eq("id", bestellungId);

  // Dokument-Eintrag
  await supabase.from("dokumente").insert({
    bestellung_id: bestellungId,
    typ: "versandbestaetigung",
    quelle: "email",
    storage_pfad: null,
    email_betreff,
    email_absender,
    email_datum,
    ki_roh_daten: { typ: "versandbestaetigung", tracking_nummer: trackingNummer, versanddienstleister, tracking_url: trackingUrl },
    bestellnummer_erkannt: bestellnrMatch?.[1] || null,
    artikel: null,
    gesamtbetrag: null,
    netto: null,
    mwst: null,
    faelligkeitsdatum: null,
    lieferdatum: null,
    iban: null,
  });

  // Anhänge (Versandlabels) hochladen
  for (const anhang of anhaenge.slice(0, 1)) {
    const storagePfad = `${bestellungId}/versand_${Date.now()}_${anhang.name}`;
    const buffer = Buffer.from(anhang.base64, "base64");
    const { error: uploadErr } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: anhang.mime_type, upsert: true });
    if (uploadErr) {
      logError("webhook/email/versand", `Versand-Anhang Upload fehlgeschlagen: ${anhang.name}`, uploadErr);
    } else {
      await supabase.from("dokumente")
        .update({ storage_pfad: storagePfad })
        .eq("bestellung_id", bestellungId)
        .eq("typ", "versandbestaetigung")
        .is("storage_pfad", null);
    }
  }

  await updateBestellungStatus(supabase, bestellungId);

  logInfo("webhook/email/versand", "Versand-Info gespeichert", {
    bestellungId,
    tracking: trackingNummer,
    carrier: versanddienstleister,
    dauer_ms: Date.now() - startTime,
  });

  return {
    success: true,
    bestellung_id: bestellungId,
    versand: {
      tracking_nummer: trackingNummer,
      versanddienstleister,
      tracking_url: trackingUrl,
    },
  };
}
