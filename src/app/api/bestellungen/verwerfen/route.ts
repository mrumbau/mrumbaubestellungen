import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

// POST /api/bestellungen/verwerfen – Bestellung verwerfen (Spam/irrelevant)
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

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { bestellung_id } = body;

    if (!bestellung_id || !isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültige Bestellungs-ID" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Zugehörige Daten löschen (Reihenfolge: FK-Abhängigkeiten zuerst)
    await supabase.from("webhook_logs").delete().eq("bestellung_id", bestellung_id);
    await supabase.from("freigaben").delete().eq("bestellung_id", bestellung_id);
    await supabase.from("abgleiche").delete().eq("bestellung_id", bestellung_id);
    await supabase.from("kommentare").delete().eq("bestellung_id", bestellung_id);
    await supabase.from("dokumente").delete().eq("bestellung_id", bestellung_id);
    await supabase.from("bestellungen").delete().eq("id", bestellung_id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
