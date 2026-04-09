import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { analysiereDokument, fuehreAbgleichDurch } from "@/lib/openai";
import { isValidUUID, isAllowedMimeType, isFileSizeOk, sanitizeFilename } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { updateBestellungStatus } from "@/lib/bestellung-utils";

// Body-Limit auf 6 MB erhöhen (Base64 ist ~33% größer als die Originaldatei)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// POST /api/scan – Foto/PDF hochladen und per GPT-4o analysieren
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    // Rate-Limit: max 10 Scans pro Minute pro IP
    const rlKey = getRateLimitKey(request, "scan");
    const rl = checkRateLimit(rlKey, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte warten." }, { status: 429 });
    }

    // Auth-Check
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const body = await request.json();
    const { bestellung_id, base64, mime_type, datei_name } = body;

    if (!bestellung_id || !base64 || !mime_type) {
      return NextResponse.json(
        { error: "bestellung_id, base64 und mime_type erforderlich" },
        { status: 400 }
      );
    }

    // Input-Validierung
    if (!isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültiges bestellung_id Format" }, { status: 400 });
    }

    if (!isAllowedMimeType(mime_type)) {
      return NextResponse.json(
        { error: "Nur PDF, JPEG, PNG und WebP Dateien erlaubt" },
        { status: 400 }
      );
    }

    if (!isFileSizeOk(base64)) {
      return NextResponse.json(
        { error: "Datei zu groß (max. 4 MB)" },
        { status: 413 }
      );
    }

    const supabase = createServiceClient();

    // Besitzer-Prüfung: Nur eigene Bestellungen oder Admin
    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("kuerzel, rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
    }

    const { data: bestellungCheck } = await supabase
      .from("bestellungen")
      .select("besteller_kuerzel")
      .eq("id", bestellung_id)
      .single();

    if (!bestellungCheck) {
      return NextResponse.json({ error: "Bestellung nicht gefunden" }, { status: 404 });
    }

    if (profil.rolle !== "admin" && bestellungCheck.besteller_kuerzel !== profil.kuerzel) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Bestellung" }, { status: 403 });
    }

    // GPT-4o Analyse
    let analyse;
    try {
      analyse = await analysiereDokument(base64, mime_type);
    } catch (err) {
      logError("/api/scan", "OpenAI Analyse-Fehler", err);
      return NextResponse.json(
        { error: "KI-Analyse fehlgeschlagen. Bitte erneut versuchen." },
        { status: 502 }
      );
    }

    // GPT-Ergebnisse sanitizen (ungültige Daten/Zahlen → null)
    const safeDate = (v: unknown): string | null => {
      if (!v || typeof v !== "string") return null;
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
    };
    const safeNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const safeTyp = (v: unknown): string | null => {
      const allowed = ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis", "versandbestaetigung"];
      return typeof v === "string" && allowed.includes(v) ? v : null;
    };

    // Dokumenttyp validieren — bei unbekanntem Typ abbrechen statt falsch zuzuordnen
    const erkannterTyp = safeTyp(analyse.typ);
    if (!erkannterTyp) {
      return NextResponse.json(
        { error: "Dokumenttyp konnte nicht erkannt werden. Bitte prüfen Sie das Dokument.", analyse },
        { status: 422 }
      );
    }

    // Datei in Storage hochladen (Dateinamen sanitizen)
    const safeName = sanitizeFilename(datei_name || "dokument");
    const storagePfad = `${bestellung_id}/scan_${Date.now()}_${safeName}`;
    const buffer = Buffer.from(base64, "base64");
    const { error: uploadError } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: mime_type, upsert: true });

    if (uploadError) {
      logError("/api/scan", "Storage Upload-Fehler", uploadError);
      // Weiter ohne Storage – Dokument trotzdem in DB speichern
    }

    // Dokument in DB speichern
    const { data: dokument, error: dokError } = await supabase
      .from("dokumente")
      .insert({
        bestellung_id,
        typ: erkannterTyp,
        quelle: mime_type.startsWith("image/") ? "scan_foto" : "scan_upload",
        storage_pfad: uploadError ? null : storagePfad,
        ki_roh_daten: analyse,
        bestellnummer_erkannt: analyse.bestellnummer || null,
        auftragsnummer: analyse.auftragsnummer || null,
        lieferscheinnummer: analyse.lieferscheinnummer || null,
        artikel: analyse.artikel || null,
        gesamtbetrag: safeNum(analyse.gesamtbetrag),
        netto: safeNum(analyse.netto),
        mwst: safeNum(analyse.mwst),
        faelligkeitsdatum: safeDate(analyse.faelligkeitsdatum),
        lieferdatum: safeDate(analyse.lieferdatum),
        iban: typeof analyse.iban === "string" ? analyse.iban : null,
      })
      .select()
      .single();

    if (dokError) {
      logError("/api/scan", "Dokument DB-Fehler", dokError);
      return NextResponse.json({ error: "Dokument konnte nicht gespeichert werden" }, { status: 500 });
    }

    // Bestellung aktualisieren
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (erkannterTyp === "bestellbestaetigung") {
      updateFields.hat_bestellbestaetigung = true;
    } else if (erkannterTyp === "lieferschein") {
      updateFields.hat_lieferschein = true;
      updateFields.lieferschein_physisch = true;
    } else if (erkannterTyp === "rechnung") {
      updateFields.hat_rechnung = true;
    } else if (erkannterTyp === "aufmass") {
      updateFields.hat_aufmass = true;
    } else if (erkannterTyp === "leistungsnachweis") {
      updateFields.hat_leistungsnachweis = true;
    }

    // Nummern setzen
    if (analyse.bestellnummer) updateFields.bestellnummer = analyse.bestellnummer;
    if (analyse.auftragsnummer) updateFields.auftragsnummer = analyse.auftragsnummer;
    if (analyse.lieferscheinnummer) updateFields.lieferscheinnummer = analyse.lieferscheinnummer;

    // Betrag setzen (für alle Nicht-Versand-Typen)
    if (erkannterTyp !== "versandbestaetigung") {
      const scanBetrag = analyse.gesamtbetrag || analyse.netto || null;
      const scanIstNetto = !analyse.gesamtbetrag && !!analyse.netto;
      if (scanBetrag) {
        if (erkannterTyp === "rechnung") {
          updateFields.betrag = scanBetrag;
          if (scanIstNetto) updateFields.betrag_ist_netto = true;
        } else {
          const { data: bestCheck } = await supabase
            .from("bestellungen")
            .select("betrag")
            .eq("id", bestellung_id)
            .maybeSingle();
          if (bestCheck && !bestCheck.betrag) {
            updateFields.betrag = scanBetrag;
            if (scanIstNetto) updateFields.betrag_ist_netto = true;
          }
        }
      }
    }

    if (erkannterTyp === "versandbestaetigung") {
      updateFields.hat_versandbestaetigung = true;
      if (analyse.tracking_nummer) updateFields.tracking_nummer = analyse.tracking_nummer;
      if (analyse.versanddienstleister) updateFields.versanddienstleister = analyse.versanddienstleister;
      if (analyse.tracking_url) {
        updateFields.tracking_url = analyse.tracking_url;
      } else if (analyse.versanddienstleister && analyse.tracking_nummer) {
        const { buildTrackingUrl } = await import("@/lib/tracking-urls");
        const autoUrl = buildTrackingUrl(analyse.versanddienstleister, analyse.tracking_nummer);
        if (autoUrl) updateFields.tracking_url = autoUrl;
      }
      if (analyse.voraussichtliche_lieferung) updateFields.voraussichtliche_lieferung = analyse.voraussichtliche_lieferung;
    }

    await supabase
      .from("bestellungen")
      .update(updateFields)
      .eq("id", bestellung_id);

    // Prüfe ob alle Dokumente vorhanden → KI-Abgleich starten (nur Material)
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("bestellungsart, status, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung")
      .eq("id", bestellung_id)
      .single();

    if (
      bestellung?.bestellungsart === "material" &&
      bestellung?.hat_bestellbestaetigung &&
      bestellung?.hat_lieferschein &&
      bestellung?.hat_rechnung
    ) {
      try {
        const { data: alleDokumente } = await supabase
          .from("dokumente")
          .select("typ, ki_roh_daten")
          .eq("bestellung_id", bestellung_id);

        const bb = alleDokumente?.find(
          (d) => d.typ === "bestellbestaetigung"
        )?.ki_roh_daten;
        const ls = alleDokumente?.find(
          (d) => d.typ === "lieferschein"
        )?.ki_roh_daten;
        const re = alleDokumente?.find(
          (d) => d.typ === "rechnung"
        )?.ki_roh_daten;

        const abgleich = await fuehreAbgleichDurch(bb, ls, re);

        // Vorherige Abgleiche löschen (es soll nur einen pro Bestellung geben)
        await supabase.from("abgleiche").delete().eq("bestellung_id", bestellung_id);

        await supabase.from("abgleiche").insert({
          bestellung_id,
          status: abgleich.status,
          abweichungen: abgleich.abweichungen,
          ki_zusammenfassung: abgleich.zusammenfassung,
        });

        const neuerStatus =
          abgleich.status === "ok" ? "vollstaendig" : "abweichung";
        // Nur Status setzen wenn nicht bereits freigegeben
        if (bestellung?.status !== "freigegeben") {
          await supabase
            .from("bestellungen")
            .update({ status: neuerStatus })
            .eq("id", bestellung_id);
        }
      } catch (err) {
        logError("/api/scan", "KI-Abgleich Fehler", err);
      }
    }

    // Zentraler Status-Update (berücksichtigt Bestellungsart)
    await updateBestellungStatus(supabase, bestellung_id);

    return NextResponse.json({
      success: true,
      dokument_id: dokument.id,
      analyse,
    });
  } catch (err) {
    logError("/api/scan", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
