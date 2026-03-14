import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// POST /api/bestellungen/[id]/freigeben – Rechnung freigeben
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Benutzerprofil holen
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: "Kein Profil" }, { status: 403 });
    }

    // Bestellung prüfen
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    // Nur Besteller der Bestellung oder Admin darf freigeben
    if (
      profil.rolle !== "admin" &&
      bestellung.besteller_kuerzel !== profil.kuerzel
    ) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    // Freigabe erstellen
    const { error: freigabeError } = await supabase.from("freigaben").insert({
      bestellung_id: id,
      freigegeben_von_kuerzel: profil.kuerzel,
      freigegeben_von_name: profil.name,
      kommentar: body.kommentar || null,
    });

    if (freigabeError) {
      return NextResponse.json({ error: freigabeError.message }, { status: 500 });
    }

    // Status auf freigegeben setzen
    await supabase
      .from("bestellungen")
      .update({ status: "freigegeben", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
