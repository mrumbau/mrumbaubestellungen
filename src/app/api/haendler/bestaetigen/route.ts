import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// POST /api/haendler/bestaetigen – Händler als geprüft markieren (nur Admin)
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (profil?.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { haendler_id } = body;

    if (!haendler_id || !isValidUUID(haendler_id)) {
      return NextResponse.json({ error: "Ungültige Händler-ID" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("haendler")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", haendler_id);

    if (error) {
      return NextResponse.json({ error: "Bestätigung fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
