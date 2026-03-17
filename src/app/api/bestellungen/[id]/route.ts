import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";

// GET /api/bestellungen/[id] – Details + Dokumente + Abgleich
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Ungültiges ID Format" }, { status: 400 });
    }

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
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
