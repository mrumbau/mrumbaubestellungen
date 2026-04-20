import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

// POST /api/subunternehmer/bestaetigen – Subunternehmer als geprüft markieren (nur Admin)
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
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
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    // Nur Admin kuratiert Stammdaten (Besteller bringt SU via Bestellung ein, Admin validiert)
    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { subunternehmer_id } = body;

    if (!subunternehmer_id || !isValidUUID(subunternehmer_id)) {
      return NextResponse.json({ error: "Ungültige Subunternehmer-ID" }, { status: 400 });
    }

    const { error } = await supabase
      .from("subunternehmer")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", subunternehmer_id);

    if (error) {
      return NextResponse.json({ error: "Bestätigung fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
