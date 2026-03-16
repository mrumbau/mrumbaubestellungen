import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, validateTextLength } from "@/lib/validation";

// POST /api/kommentare – Kommentar zu einer Bestellung hinzufügen
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: "Kein Profil" }, { status: 403 });
    }

    const body = await request.json();
    const { bestellung_id, text } = body;

    if (!bestellung_id || !text?.trim()) {
      return NextResponse.json(
        { error: "bestellung_id und text erforderlich" },
        { status: 400 }
      );
    }

    if (!isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültiges bestellung_id Format" }, { status: 400 });
    }

    if (!validateTextLength(text.trim(), 2000)) {
      return NextResponse.json({ error: "Kommentar zu lang (max. 2000 Zeichen)" }, { status: 400 });
    }

    const { error } = await supabase.from("kommentare").insert({
      bestellung_id,
      autor_kuerzel: profil.kuerzel,
      autor_name: profil.name,
      text: text.trim(),
    });

    if (error) {
      console.error("Kommentar Fehler:", error);
      return NextResponse.json({ error: "Kommentar konnte nicht gespeichert werden" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
