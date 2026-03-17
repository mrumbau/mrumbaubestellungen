import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/bestellungen/[id]/freigeben – Rechnung freigeben
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: "Ungültiger Ursprung" }, { status: 403 });
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
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

    // Bestellung prüfen
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur Besteller der Bestellung oder Admin darf freigeben
    if (
      profil.rolle !== "admin" &&
      bestellung.besteller_kuerzel !== profil.kuerzel
    ) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Bereits freigegeben? Duplikat verhindern
    if (bestellung.status === "freigegeben") {
      return NextResponse.json({ error: "Bestellung wurde bereits freigegeben" }, { status: 409 });
    }

    // Freigabe erstellen
    const { data: freigabe, error: freigabeError } = await supabase
      .from("freigaben")
      .insert({
        bestellung_id: id,
        freigegeben_von_kuerzel: profil.kuerzel,
        freigegeben_von_name: profil.name,
        kommentar: body.kommentar || null,
      })
      .select("id")
      .single();

    if (freigabeError || !freigabe) {
      logError("/api/bestellungen/[id]/freigeben", "Freigabe Fehler", freigabeError);
      return NextResponse.json({ error: "Freigabe konnte nicht gespeichert werden" }, { status: 500 });
    }

    // Status auf freigegeben setzen
    const { error: updateError } = await supabase
      .from("bestellungen")
      .update({ status: "freigegeben", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      // Rollback: Freigabe-Eintrag wieder löschen für konsistenten Zustand
      logError("/api/bestellungen/[id]/freigeben", "Status-Update fehlgeschlagen, Rollback", updateError);
      await supabase.from("freigaben").delete().eq("id", freigabe.id);
      return NextResponse.json({ error: "Status konnte nicht aktualisiert werden" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/bestellungen/[id]/freigeben", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
