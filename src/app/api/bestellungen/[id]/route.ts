import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// GET /api/bestellungen/[id] – Details + Dokumente + Abgleich
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Bestellung laden (RLS filtert)
    const { data: bestellung, error } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !bestellung) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    // Dokumente laden
    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("*")
      .eq("bestellung_id", id)
      .order("created_at", { ascending: true });

    // Abgleich laden
    const { data: abgleich } = await supabase
      .from("abgleiche")
      .select("*")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .single();

    // Kommentare laden
    const { data: kommentare } = await supabase
      .from("kommentare")
      .select("*")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: true });

    // Freigabe laden
    const { data: freigabe } = await supabase
      .from("freigaben")
      .select("*")
      .eq("bestellung_id", id)
      .single();

    return NextResponse.json({
      bestellung,
      dokumente: dokumente || [],
      abgleich: abgleich || null,
      kommentare: kommentare || [],
      freigabe: freigabe || null,
    });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// POST /api/bestellungen/[id] – Kommentar hinzufügen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
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

    const { error } = await supabase.from("kommentare").insert({
      bestellung_id: id,
      autor_kuerzel: profil.kuerzel,
      autor_name: profil.name,
      text: body.text,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
