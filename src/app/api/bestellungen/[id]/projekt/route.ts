import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// POST /api/bestellungen/[id]/projekt – Projekt zuordnen
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

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Autorisierung: Bestellung muss dem User gehören (RLS) oder Admin
    const serviceClient = createServiceClient();
    const { data: profil } = await serviceClient
      .from("benutzer_rollen")
      .select("kuerzel, rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 401 });
    }

    if (profil.rolle !== "admin") {
      const { data: bestellung } = await serviceClient
        .from("bestellungen")
        .select("besteller_kuerzel, bestellungsart")
        .eq("id", id)
        .single();

      const istSuOderAbo = bestellung?.bestellungsart === "subunternehmer" || bestellung?.bestellungsart === "abo";
      if (!bestellung || (bestellung.besteller_kuerzel !== profil.kuerzel && !istSuOderAbo)) {
        return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
      }
    }

    const body = await request.json();
    const { projekt_id } = body;

    // projekt_id = null → Zuordnung entfernen
    if (projekt_id !== null) {
      if (!isValidUUID(projekt_id)) {
        return NextResponse.json({ error: "Ungültige Projekt-ID" }, { status: 400 });
      }

      // Projekt existiert?
      const { data: projekt } = await supabase
        .from("projekte")
        .select("id, name")
        .eq("id", projekt_id)
        .single();

      if (!projekt) {
        return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
      }

      const { error } = await supabase
        .from("bestellungen")
        .update({
          projekt_id: projekt.id,
          projekt_name: projekt.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: "Zuordnung fehlgeschlagen" }, { status: 500 });
      }

      return NextResponse.json({ success: true, projekt_name: projekt.name });
    }

    // Zuordnung entfernen
    const { error } = await supabase
      .from("bestellungen")
      .update({
        projekt_id: null,
        projekt_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Entfernung fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true, projekt_name: null });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
