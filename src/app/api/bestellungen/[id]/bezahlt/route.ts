import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

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
    if (profil.rolle !== "buchhaltung" && profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Service-Client für Bestellungszugriff (Buchhaltung hat keine UPDATE-RLS-Policy)
    const serviceClient = createServiceClient();

    // Bestellung prüfen
    const { data: bestellung } = await serviceClient
      .from("bestellungen")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur freigegebene Bestellungen können als bezahlt markiert werden
    if (bestellung.status !== "freigegeben") {
      return NextResponse.json({ error: "Nur freigegebene Rechnungen können als bezahlt markiert werden" }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from("bestellungen")
      .update({
        bezahlt_am: bezahlt ? new Date().toISOString() : null,
        bezahlt_von: bezahlt ? profil.name : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      logError("/api/bestellungen/[id]/bezahlt", "Update fehlgeschlagen", updateError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ success: true, bezahlt, bezahlt_von: bezahlt ? profil.name : null });
  } catch (err) {
    logError("/api/bestellungen/[id]/bezahlt", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
