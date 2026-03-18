import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID, isValidKuerzel } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

// POST /api/bestellungen/zuordnen – Bestellung einem Besteller zuordnen (nur Admin)
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

    // Rolle prüfen (nur Admin)
    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { bestellung_id, besteller_kuerzel } = body;

    if (!bestellung_id || !isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültige Bestellungs-ID" }, { status: 400 });
    }

    if (!besteller_kuerzel || !isValidKuerzel(besteller_kuerzel)) {
      return NextResponse.json({ error: "Ungültiges Kürzel" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Besteller-Name holen
    const { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name, kuerzel")
      .eq("kuerzel", besteller_kuerzel)
      .single();

    if (!benutzer) {
      return NextResponse.json({ error: "Besteller nicht gefunden" }, { status: 404 });
    }

    // Vorherigen Besteller laden für den Kommentar
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("besteller_kuerzel, besteller_name")
      .eq("id", bestellung_id)
      .single();

    const vorher = bestellung?.besteller_kuerzel || "UNBEKANNT";

    // Bestellung aktualisieren
    const { error } = await supabase
      .from("bestellungen")
      .update({
        besteller_kuerzel: benutzer.kuerzel,
        besteller_name: benutzer.name,
        zuordnung_methode: "manuell_admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bestellung_id);

    if (error) {
      return NextResponse.json({ error: "Zuordnung fehlgeschlagen" }, { status: 500 });
    }

    // Kommentar für Nachvollziehbarkeit
    await supabase.from("kommentare").insert({
      bestellung_id,
      autor_kuerzel: "ADMIN",
      autor_name: "Admin",
      text: `Besteller manuell zugeordnet: ${vorher} → ${benutzer.kuerzel} (${benutzer.name})`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
