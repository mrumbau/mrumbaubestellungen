import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireRoles } from "@/lib/auth";
import { sendeRechnungAnDatev, stempelPdfMitDatev } from "@/lib/email";

// POST /api/dokumente/[id]/bezahlt — Rechnungs-Dokument als bezahlt markieren.
//
// 07.05.2026 — Granularität pro Rechnungs-Dokument (statt pro Bestellung).
// Bei Sammel-Aufträgen mit Teil-Rechnungen (Raab Karcher etc.) wird jede
// Rechnung einzeln als bezahlt markiert; bestellungen.bezahlt_am wird per
// DB-Trigger automatisch synchronisiert (= ALLE Rechnungen bezahlt → bestellung
// bezahlt). DATEV-Versand läuft pro Rechnungs-PDF.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id: dokumentId } = await params;
    if (!isValidUUID(dokumentId)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const bezahlt = body.bezahlt === true;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
    }
    if (!requireRoles(profil, "buchhaltung", "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const serviceClient = createServiceClient();

    // Doku + zugehörige Bestellung laden (in einem Round-Trip via Supabase-Join)
    const { data: doku } = await serviceClient
      .from("dokumente")
      .select(
        "id, typ, storage_pfad, bezahlt_am, gesamtbetrag, bestellnummer_erkannt, bestellung_id, bestellung:bestellungen!inner(id, status, bestellnummer, haendler_name, betrag)",
      )
      .eq("id", dokumentId)
      .maybeSingle();

    if (!doku) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }
    if (doku.typ !== "rechnung") {
      return NextResponse.json({ error: "Nur Rechnungs-Dokumente können als bezahlt markiert werden" }, { status: 400 });
    }
    const bestellung = (doku.bestellung as unknown) as {
      id: string;
      status: string;
      bestellnummer: string | null;
      haendler_name: string | null;
      betrag: number | null;
    } | null;
    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }
    if (bestellung.status !== "freigegeben") {
      return NextResponse.json({ error: "Nur freigegebene Rechnungen können als bezahlt markiert werden" }, { status: 400 });
    }

    // Idempotenz: schon bezahlt + bezahlt=true → ohne erneuten Update zurückgeben
    if (bezahlt && doku.bezahlt_am) {
      return NextResponse.json({
        success: true,
        bezahlt: true,
        bezahlt_von: profil.name,
        already: true,
      });
    }

    // Atomic Update — nur wenn bezahlt_am dem erwarteten Wert entspricht
    let query = serviceClient
      .from("dokumente")
      .update({
        bezahlt_am: bezahlt ? new Date().toISOString() : null,
        bezahlt_von: bezahlt ? profil.name : null,
      })
      .eq("id", dokumentId);
    if (bezahlt) query = query.is("bezahlt_am", null);

    const { error: updateError } = await query;
    if (updateError) {
      logError("/api/dokumente/[id]/bezahlt", "Update fehlgeschlagen", updateError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    // ── DATEV-Versand pro Rechnungs-Dokument im Hintergrund ──
    if (bezahlt && doku.storage_pfad) {
      after(async () => {
        try {
          logInfo("/api/dokumente/[id]/bezahlt", "DATEV-Versand gestartet", {
            dokument_id: dokumentId,
            bestellung_id: bestellung.id,
            rechnung_nr: doku.bestellnummer_erkannt,
          });
          const svc = createServiceClient();

          const { data: pdfData, error: dlError } = await svc.storage
            .from("dokumente")
            .download(doku.storage_pfad!);

          if (!pdfData || dlError) {
            logError("/api/dokumente/[id]/bezahlt", "DATEV: PDF-Download fehlgeschlagen", dlError);
            return;
          }

          const rawBuffer = Buffer.from(await pdfData.arrayBuffer());
          const filename = doku.storage_pfad!.split("/").pop() || "rechnung.pdf";

          // Stempel + Rechnungsnr aus dem Doku (nicht aus der Bestellung)
          const rechnungBezeichnung = doku.bestellnummer_erkannt || bestellung.bestellnummer;
          const rechnungBetrag = doku.gesamtbetrag ?? bestellung.betrag;

          const pdfBuffer = await stempelPdfMitDatev(rawBuffer, {
            bestellnummer: rechnungBezeichnung,
            haendlerName: bestellung.haendler_name || null,
            bezahltAm: new Date(),
            bezahltVon: profil.name,
            betrag: rechnungBetrag,
          });

          const result = await sendeRechnungAnDatev({
            bestellnummer: rechnungBezeichnung,
            haendlerName: bestellung.haendler_name || "Unbekannt",
            betrag: rechnungBetrag,
            pdfBuffer,
            pdfFilename: filename,
          });

          await svc.from("webhook_logs").insert({
            typ: "email",
            status: result.success ? "success" : "error",
            bestellung_id: bestellung.id,
            fehler_text: result.success
              ? `DATEV-Versand erfolgreich: ${bestellung.haendler_name} ${rechnungBezeichnung || ""}`
              : `DATEV-Versand fehlgeschlagen: ${result.error}`,
          });
        } catch (datevErr) {
          logError("/api/dokumente/[id]/bezahlt", "DATEV-Versand fehlgeschlagen", datevErr);
          try {
            const svc = createServiceClient();
            await svc.from("webhook_logs").insert({
              typ: "email",
              status: "error",
              bestellung_id: bestellung.id,
              fehler_text: `DATEV-Versand Exception: ${datevErr instanceof Error ? datevErr.message : String(datevErr)}`,
            });
          } catch { /* swallow nested */ }
        }
      });
    }

    return NextResponse.json({
      success: true,
      bezahlt,
      bezahlt_von: bezahlt ? profil.name : null,
    });
  } catch (err) {
    logError("/api/dokumente/[id]/bezahlt", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
