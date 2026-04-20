import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { updateBestellungStatus } from "@/lib/bestellung-utils";
import { requireRoles } from "@/lib/auth";

// GET /api/bestellungen/[id] – Details + Dokumente + Abgleich
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Bestellung laden (RLS filtert)
    const { data: bestellung, error } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Dokumente laden
    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("*")
      .eq("bestellung_id", id)
      .order("created_at", { ascending: true });

    // Abgleich laden (nicht jede Bestellung hat einen)
    const { data: abgleich } = await supabase
      .from("abgleiche")
      .select("*")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Kommentare laden
    const { data: kommentare } = await supabase
      .from("kommentare")
      .select("*")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: true });

    // Freigabe laden (nicht jede Bestellung ist freigegeben)
    const { data: freigabe } = await supabase
      .from("freigaben")
      .select("*")
      .eq("bestellung_id", id)
      .maybeSingle();

    return NextResponse.json({
      bestellung,
      dokumente: dokumente || [],
      abgleich: abgleich || null,
      kommentare: kommentare || [],
      freigabe: freigabe || null,
    });
  } catch {
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}

// PATCH /api/bestellungen/[id] – Bestellung aktualisieren (z.B. bestellungsart)
export async function PATCH(
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

    // Autorisierung: nur Admin oder eigener Besteller
    const serviceClient = createServiceClient();
    const { data: profil } = await serviceClient
      .from("benutzer_rollen")
      .select("kuerzel, rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 401 });
    }

    // Defense-in-Depth: Buchhaltung hat keine Edit-Rechte auf Bestellung-Metadaten
    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
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
    const updateData: Record<string, unknown> = {};

    // bestellungsart ändern
    if (body.bestellungsart !== undefined) {
      const erlaubteArten = ["material", "subunternehmer", "abo"];
      if (!erlaubteArten.includes(body.bestellungsart)) {
        return NextResponse.json({ error: "Ungültige Bestellungsart" }, { status: 400 });
      }
      updateData.bestellungsart = body.bestellungsart;
    }

    // Mahnung quittieren (zurücksetzen)
    if (body.mahnung_am === null) {
      updateData.mahnung_am = null;
      updateData.mahnung_count = 0;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Keine gültigen Felder zum Aktualisieren" }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("bestellungen")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Aktualisierung fehlgeschlagen" }, { status: 500 });
    }

    // Status neu berechnen (z.B. bei Bestellungsart-Wechsel)
    if (updateData.bestellungsart) {
      await updateBestellungStatus(supabase, id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
