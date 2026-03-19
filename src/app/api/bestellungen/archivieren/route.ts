import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireRoles } from "@/lib/auth";

// POST /api/bestellungen/archivieren – Bezahlte Rechnungen archivieren (einzeln oder bulk)
// Body: { ids: string[] }
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Mindestens eine Bestellungs-ID erforderlich" }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: "Maximal 100 Bestellungen gleichzeitig" }, { status: 400 });
    }

    if (!ids.every(isValidUUID)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    // Nur Buchhaltung und Admin dürfen archivieren
    if (!requireRoles(profil, "buchhaltung", "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const serviceClient = createServiceClient();

    // Nur bezahlte, freigegebene Bestellungen können archiviert werden
    const { data: bestellungen } = await serviceClient
      .from("bestellungen")
      .select("id")
      .in("id", ids)
      .eq("status", "freigegeben")
      .not("bezahlt_am", "is", null);

    const gueltigeIds = (bestellungen || []).map((b) => b.id);

    if (gueltigeIds.length === 0) {
      return NextResponse.json({ error: "Keine gültigen bezahlten Bestellungen gefunden" }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from("bestellungen")
      .update({
        archiviert_am: new Date().toISOString(),
        archiviert_von: profil.name,
        updated_at: new Date().toISOString(),
      })
      .in("id", gueltigeIds);

    if (updateError) {
      logError("/api/bestellungen/archivieren", "Update fehlgeschlagen", updateError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      archiviert: gueltigeIds.length,
      archiviert_von: profil.name,
    });
  } catch (err) {
    logError("/api/bestellungen/archivieren", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
