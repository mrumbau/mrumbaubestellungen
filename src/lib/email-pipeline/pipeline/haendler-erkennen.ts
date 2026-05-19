/**
 * Händler/Subunternehmer/Abo-Anbieter-Identifikation aus Mail-Absender.
 *
 * Zwei Phasen:
 *   • identifyHaendlerSuAbo (Schritt 9): vor Bestellungs-Match. Liefert
 *     haendler/erkannterSubunternehmer/bestellungsart aus den 3 Anbieter-
 *     Tabellen anhand absenderAdresse + absenderDomain (mit Wildcard-Support).
 *
 *   • autoErkenneNeuenHaendler (Schritt 17): nach Anlage der Bestellung.
 *     Wenn der Absender keinem bekannten Anbieter zugeordnet wurde, KI prüft
 *     ob ein neuer Händler angelegt werden soll — mit Cross-Table-Fuzzy-Match
 *     gegen alle drei Tabellen damit ein leicht abweichender SU/Abo-Absender
 *     nicht versehentlich als "Händler" angelegt wird.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { erkenneHaendlerAusEmail } from "@/lib/openai";
import { logError, logInfo } from "@/lib/logger";
import type { AnalyseErgebnis } from "./anhang-analyse";

export interface HaendlerRow {
  id: string | null;
  name: string | null;
  domain?: string | null;
  email_absender?: string[] | null;
  url_muster?: string[] | null;
  [key: string]: unknown;
}

export interface IdentifyInput {
  vorfilterHaendlerId: string | null;
  vorfilterHaendlerName: string | null;
  vorfilterSuId: string | null;
  absenderAdresse: string;
  absenderDomain: string;
}

export interface IdentifyResult {
  haendler: HaendlerRow | null;
  erkannterSubunternehmer: { id: string; firma: string } | null;
  bestellungsart: "material" | "subunternehmer" | "abo";
  haendlerDomain: string;
  haendlerName: string;
}

export async function identifyHaendlerSuAbo(
  supabase: SupabaseClient,
  input: IdentifyInput,
): Promise<IdentifyResult> {
  const { vorfilterHaendlerId, vorfilterHaendlerName, vorfilterSuId, absenderAdresse, absenderDomain } = input;
  let haendler: HaendlerRow | null = null;
  let erkannterSubunternehmer: { id: string; firma: string } | null = null;
  let bestellungsart: "material" | "subunternehmer" | "abo" = "material";

  if (vorfilterHaendlerId) {
    const { data: vfHaendler } = await supabase
      .from("haendler").select("*").eq("id", vorfilterHaendlerId).maybeSingle();
    if (vfHaendler) {
      haendler = vfHaendler as HaendlerRow;
      const bestehendeAdressen: string[] = vfHaendler.email_absender || [];
      if (absenderAdresse && !bestehendeAdressen.some((a: string) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
        await supabase.from("haendler")
          .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
          .eq("id", vfHaendler.id);
      }
    }
  } else if (vorfilterSuId) {
    const { data: vfSU } = await supabase
      .from("subunternehmer").select("id, firma").eq("id", vorfilterSuId).maybeSingle();
    if (vfSU) {
      erkannterSubunternehmer = { id: vfSU.id, firma: vfSU.firma };
      bestellungsart = "subunternehmer";
    }
  }

  if (!haendler && !erkannterSubunternehmer) {
    // F3.F13: Limit als Safety-Net (heute 74 Händler, bei >2000 muss Architektur überdacht werden)
    const { data: haendlerListe } = await supabase.from("haendler").select("*").limit(2000);

    haendler = haendlerListe?.find((h) =>
      h.email_absender?.some((addr: string) => {
        const normalized = addr.toLowerCase().trim();
        if (normalized.startsWith("*@")) return absenderAdresse.endsWith("@" + normalized.slice(2));
        return absenderAdresse === normalized;
      }),
    ) || null;

    if (!haendler && absenderDomain) {
      haendler = haendlerListe?.find((h) => {
        const hDomain = h.domain?.toLowerCase();
        if (!hDomain) return false;
        return absenderDomain === hDomain || absenderDomain.endsWith("." + hDomain);
      }) || null;

      if (haendler && absenderAdresse) {
        const bestehendeAdressen: string[] = haendler.email_absender || [];
        if (!bestehendeAdressen.some((a) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
          await supabase.from("haendler")
            .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
            .eq("id", haendler.id);
        }
      }
    }

    if (!haendler) {
      // F3.F13: Limit als Safety-Net
      const { data: suListe } = await supabase.from("subunternehmer").select("*").limit(2000);
      if (suListe && suListe.length > 0) {
        const suMatch = suListe.find((su) =>
          su.email_absender?.some((addr: string) => {
            const normalized = addr.toLowerCase().trim();
            if (normalized.startsWith("*@")) return absenderAdresse.endsWith("@" + normalized.slice(2));
            return absenderAdresse === normalized;
          }),
        );
        if (suMatch) {
          erkannterSubunternehmer = { id: suMatch.id, firma: suMatch.firma };
          bestellungsart = "subunternehmer";
        } else if (absenderDomain) {
          const suDomainMatch = suListe.find((su) => {
            const suDomainField = su.domain?.toLowerCase?.();
            if (suDomainField && (absenderDomain === suDomainField || absenderDomain.endsWith("." + suDomainField))) return true;
            const suEmailDomain = su.email?.split("@")[1]?.toLowerCase();
            if (suEmailDomain === absenderDomain) return true;
            return su.email_absender?.some((addr: string) => {
              const normalized = addr.toLowerCase().trim();
              if (normalized.startsWith("*@")) return absenderDomain === normalized.slice(2) || absenderDomain.endsWith("." + normalized.slice(2));
              return addr.split("@")[1]?.toLowerCase() === absenderDomain;
            });
          });
          if (suDomainMatch) {
            erkannterSubunternehmer = { id: suDomainMatch.id, firma: suDomainMatch.firma };
            bestellungsart = "subunternehmer";
          }
        }
      }
    }
  }

  // Plancraft-Spezialbehandlung
  if (!haendler && !erkannterSubunternehmer &&
      (absenderDomain === "plancraft.com" || absenderDomain === "mail.plancraft.com")) {
    bestellungsart = "subunternehmer";
  }

  // Abo-Anbieter
  if (bestellungsart === "material") {
    // F3.F13: Limit als Safety-Net (kleine Tabelle, aber bounded)
    const { data: aboListe } = await supabase.from("abo_anbieter").select("*").limit(500);
    if (aboListe && aboListe.length > 0) {
      const aboMatch = aboListe.find((ab) => {
        if (ab.email_absender?.some((addr: string) => addr.toLowerCase().trim() === absenderAdresse)) return true;
        if (ab.domain && (absenderDomain === ab.domain.toLowerCase() || absenderDomain.endsWith("." + ab.domain.toLowerCase()))) return true;
        return false;
      });
      if (aboMatch) {
        bestellungsart = "abo";
        if (!haendler) haendler = { id: null, name: aboMatch.name, domain: aboMatch.domain };
        logInfo("webhook/email", `Abo-Anbieter erkannt: ${aboMatch.name}`, { absenderDomain, absenderAdresse });
      }
    }
  }

  const haendlerDomain: string = haendler?.domain || absenderDomain;
  let haendlerName: string = haendler?.name || vorfilterHaendlerName || absenderDomain;
  const istAmazon = absenderDomain === "amazon.de" || absenderDomain === "amazon.com" ||
                    absenderDomain.endsWith(".amazon.de") || absenderDomain.endsWith(".amazon.com");
  if (istAmazon) haendlerName = "Amazon Business";

  return { haendler, erkannterSubunternehmer, bestellungsart, haendlerDomain, haendlerName };
}

export interface AutoErkennenInput {
  bestellungId: string;
  haendler: HaendlerRow | null;
  analyseErgebnisse: AnalyseErgebnis[];
  email_absender: string;
  email_betreff: string;
  absenderAdresse: string;
  startTime: number;
}

/**
 * Schritt 17 — Cross-Table-Fuzzy-Match VOR dem Insert eines neuen Händlers.
 *
 * Vorher wurde nur in `haendler` per exact-domain-match geprüft. Folge: ein
 * bekannter Subunternehmer oder Abo-Anbieter (Hold & Spada, Microsoft etc.),
 * der mit einer leicht abweichenden Absenderadresse mailt, wurde als neuer
 * "Händler" angelegt — und die Bestellung rutschte in eine falsche Kategorie
 * weil die Klassifikation pro Kontakt neu lief.
 * Jetzt: prüfen wir gegen alle drei Anbieter-Tabellen (haendler / subunter-
 * nehmer / abo_anbieter) auf Domain ODER Email-Adresse. Bei Match an die
 * existierende Entity andocken (email_absender-Array updaten), KEIN Insert.
 *
 * No-Op wenn der Absender bereits einem bekannten Händler zugeordnet ist oder
 * der 50s-Cutoff erreicht wurde oder keine Anhang-Analyse vorhanden ist.
 */
export async function autoErkenneNeuenHaendler(
  supabase: SupabaseClient,
  input: AutoErkennenInput,
): Promise<void> {
  const { bestellungId, haendler, analyseErgebnisse, email_absender, email_betreff, absenderAdresse, startTime } = input;

  if (haendler || analyseErgebnisse.length === 0 || Date.now() - startTime >= 50_000) return;

  try {
    const erkannterHaendlerName = analyseErgebnisse.find((e) => e.analyse.haendler)?.analyse.haendler || null;
    const neuerHaendler = await erkenneHaendlerAusEmail(email_absender, email_betreff, erkannterHaendlerName);
    if (!neuerHaendler) return;

    const cleanDomain = neuerHaendler.domain.toLowerCase();
    const cleanAbsender = absenderAdresse.toLowerCase();

    // Cross-Table-Match: prüft Domain, exact-Adresse und *@domain-Wildcards
    // in haendler, subunternehmer und abo_anbieter parallel.
    const matchesEmailArray = (arr: string[] | null | undefined): boolean =>
      (arr || []).some((entry) => {
        const e = entry.toLowerCase().trim();
        if (e.startsWith("*@")) return cleanAbsender.endsWith("@" + e.slice(2));
        return e === cleanAbsender || e === cleanDomain;
      });

    const [haendlerCheck, suCheck, aboCheck] = await Promise.all([
      supabase.from("haendler").select("id, name, domain, email_absender").eq("domain", cleanDomain).limit(5),
      supabase.from("subunternehmer").select("id, firma, email_absender").limit(500),
      supabase.from("abo_anbieter").select("id, name, domain, email_absender").limit(500),
    ]);

    const existingHaendler = (haendlerCheck.data || [])[0]
      ?? (haendlerCheck.data || []).find((h) => matchesEmailArray(h.email_absender));
    const existingSu = (suCheck.data || []).find((s) => matchesEmailArray(s.email_absender));
    const existingAbo = (aboCheck.data || []).find((a) =>
      a.domain?.toLowerCase() === cleanDomain || matchesEmailArray(a.email_absender)
    );

    if (existingSu) {
      logInfo("webhook/email", `Cross-Match: bekannter Subunternehmer (${existingSu.firma}) — keine neue Händler-Anlage`, {
        absender: cleanAbsender, domain: cleanDomain,
      });
      // bestellungsart auf SU korrigieren falls KI sie als material klassifiziert hat
      await supabase.from("bestellungen")
        .update({
          bestellungsart: "subunternehmer",
          subunternehmer_id: existingSu.id,
          haendler_name: existingSu.firma,
        })
        .eq("id", bestellungId);
      // Plus: neuen Absender in das email_absender-Array des SU mergen,
      // damit künftige Mails sofort gematcht werden.
      if (!matchesEmailArray(existingSu.email_absender)) {
        const next = Array.from(new Set([...(existingSu.email_absender || []), cleanAbsender]));
        await supabase.from("subunternehmer").update({ email_absender: next }).eq("id", existingSu.id);
      }
    } else if (existingAbo) {
      logInfo("webhook/email", `Cross-Match: bekannter Abo-Anbieter (${existingAbo.name}) — keine neue Händler-Anlage`, {
        absender: cleanAbsender, domain: cleanDomain,
      });
      await supabase.from("bestellungen")
        .update({ bestellungsart: "abo", haendler_name: existingAbo.name })
        .eq("id", bestellungId);
      if (!matchesEmailArray(existingAbo.email_absender)) {
        const next = Array.from(new Set([...(existingAbo.email_absender || []), cleanAbsender]));
        await supabase.from("abo_anbieter").update({ email_absender: next }).eq("id", existingAbo.id);
      }
    } else if (existingHaendler) {
      // Bekannter Händler — Absender ergänzen, kein neuer Insert
      if (!matchesEmailArray(existingHaendler.email_absender)) {
        const next = Array.from(new Set([...(existingHaendler.email_absender || []), cleanAbsender]));
        await supabase.from("haendler").update({ email_absender: next }).eq("id", existingHaendler.id);
        logInfo("webhook/email", `Existing Händler ${existingHaendler.name} um Absender ${cleanAbsender} ergänzt`, {});
      }
    } else {
      // Wirklich neu — anlegen
      await supabase.from("haendler").insert({
        name: neuerHaendler.name,
        domain: cleanDomain,
        email_absender: [neuerHaendler.email_muster],
        url_muster: [],
      });
      await supabase.from("bestellungen")
        .update({ haendler_name: neuerHaendler.name })
        .eq("id", bestellungId);
      logInfo("webhook/email", `Neuer Händler: ${neuerHaendler.name}`, { domain: cleanDomain });
    }
  } catch (err) {
    logError("webhook/email", "Händler-Erkennung fehlgeschlagen", err);
  }
}
