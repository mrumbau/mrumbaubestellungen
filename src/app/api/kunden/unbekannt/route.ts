import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ERRORS } from "@/lib/errors";

// GET /api/kunden/unbekannt – Unbestätigte (auto-erkannte) Kunden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { data: kunden, error } = await supabase
      .from("kunden")
      .select("*")
      .is("confirmed_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ kunden: kunden || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
