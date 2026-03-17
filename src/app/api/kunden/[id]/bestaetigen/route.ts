import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";

// POST /api/kunden/[id]/bestaetigen – Auto-erkannten Kunden bestätigen
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
      return NextResponse.json({ error: "Ungültiges ID Format" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { data: kunde, error } = await supabase
      .from("kunden")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !kunde) {
      return NextResponse.json({ error: "Kunde nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ success: true, kunde });
  } catch {
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
