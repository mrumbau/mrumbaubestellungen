import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireRoles } from "@/lib/auth";
import { sendeRechnungAnDatev } from "@/lib/email";

// POST /api/bestellungen/[id]/bezahlt – Rechnung als bezahlt markieren/entmarkieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const bezahlt = body.bezahlt === true;

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Benutzerprofil holen
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
    }

    // Nur Buchhaltung und Admin dürfen bezahlt setzen
    if (!requireRoles(profil, "buchhaltung", "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Service-Client für Bestellungszugriff (Buchhaltung hat keine UPDATE-RLS-Policy)
    const serviceClient = createServiceClient();

    // Bestellung prüfen
    const { data: bestellung } = await serviceClient
      .from("bestellungen")
      .select("id, status, bestellnummer, haendler_name, betrag, bezahlt_am")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur freigegebene Bestellungen können als bezahlt markiert werden
    if (bestellung.status !== "freigegeben") {
      return NextResponse.json({ error: "Nur freigegebene Rechnungen können als bezahlt markiert werden" }, { status: 400 });
    }

    // F5.12 Fix: Idempotenz — wenn bereits bezahlt UND wir setzen bezahlt=true,
    // kein erneuter Update + kein DATEV-Doppel-Versand.
    if (bezahlt && bestellung.bezahlt_am) {
      return NextResponse.json({
        success: true,
        bezahlt: true,
        bezahlt_von: profil.name,
        already: true,
      });
    }

    // F5.12: Atomic Update — nur wenn bezahlt_am dem erwarteten Wert entspricht.
    // Bei bezahlt=true: nur setzen wenn bezahlt_am IS NULL. Bei false: immer.
    let query = serviceClient
      .from("bestellungen")
      .update({
        bezahlt_am: bezahlt ? new Date().toISOString() : null,
        bezahlt_von: bezahlt ? profil.name : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (bezahlt) query = query.is("bezahlt_am", null);

    const { error: updateError } = await query;

    if (updateError) {
      logError("/api/bestellungen/[id]/bezahlt", "Update fehlgeschlagen", updateError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    // ── DATEV: Rechnungs-PDF nach Response im Hintergrund an DATEV senden ──
    // after() läuft NACH dem Response, aber Vercel hält den Prozess am Leben
    if (bezahlt) {
      after(async () => {
        try {
          logInfo("/api/bestellungen/[id]/bezahlt", "DATEV-Versand gestartet", { bestellung_id: id });
          const svc = createServiceClient();

          const { data: rechnungDok } = await svc
            .from("dokumente")
            .select("id, storage_pfad")
            .eq("bestellung_id", id)
            .eq("typ", "rechnung")
            .not("storage_pfad", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (!rechnungDok?.storage_pfad) {
            logInfo("/api/bestellungen/[id]/bezahlt", "DATEV: keine Rechnungs-PDF, übersprungen", { bestellung_id: id });
            return;
          }

          logInfo("/api/bestellungen/[id]/bezahlt", "DATEV: PDF gefunden", { storage_pfad: rechnungDok.storage_pfad });

          const { data: pdfData, error: dlError } = await svc.storage
            .from("dokumente")
            .download(rechnungDok.storage_pfad);

          if (!pdfData || dlError) {
            logError("/api/bestellungen/[id]/bezahlt", "DATEV: PDF-Download fehlgeschlagen", dlError);
            return;
          }

          logInfo("/api/bestellungen/[id]/bezahlt", "DATEV: PDF geladen", { size_bytes: pdfData.size });
          const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
          const filename = rechnungDok.storage_pfad.split("/").pop() || "rechnung.pdf";

          const result = await sendeRechnungAnDatev({
            bestellnummer: bestellung.bestellnummer,
            haendlerName: bestellung.haendler_name || "Unbekannt",
            betrag: bestellung.betrag,
            pdfBuffer,
            pdfFilename: filename,
          });

          logInfo("/api/bestellungen/[id]/bezahlt", `DATEV-Versand-Ergebnis: ${result.success ? "GESENDET" : "FEHLER"}`, { error: result.error });
          // F5.13 Fix: SMTP-Ergebnis in webhook_logs persistieren — nicht nur console.
          await svc.from("webhook_logs").insert({
            typ: "email",
            status: result.success ? "success" : "error",
            bestellung_id: id,
            fehler_text: result.success
              ? `DATEV-Versand erfolgreich: ${bestellung.haendler_name} ${bestellung.bestellnummer || ""}`
              : `DATEV-Versand fehlgeschlagen: ${result.error}`,
          });
        } catch (datevErr) {
          // logError direkt darunter persistiert ohnehin den Stack — console.error redundant.
          logError("/api/bestellungen/[id]/bezahlt", "DATEV-Versand fehlgeschlagen", datevErr);
          // F5.13: Exception ebenfalls persistieren
          try {
            const svc = createServiceClient();
            await svc.from("webhook_logs").insert({
              typ: "email",
              status: "error",
              bestellung_id: id,
              fehler_text: `DATEV-Versand Exception: ${datevErr instanceof Error ? datevErr.message : String(datevErr)}`,
            });
          } catch { /* swallow nested */ }
        }
      });
    }

    return NextResponse.json({ success: true, bezahlt, bezahlt_von: bezahlt ? profil.name : null });
  } catch (err) {
    logError("/api/bestellungen/[id]/bezahlt", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
