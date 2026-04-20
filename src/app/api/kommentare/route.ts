import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/kommentare – Kommentar zu einer Bestellung hinzufügen
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
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
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

    // Defense-in-Depth: User muss die Bestellung überhaupt sehen dürfen.
    // RLS filtert den SELECT — wer keinen Row bekommt, darf auch nicht kommentieren.
    const { data: sichtbareBestellung } = await supabase
      .from("bestellungen")
      .select("id")
      .eq("id", bestellung_id)
      .maybeSingle();

    if (!sichtbareBestellung) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { error } = await supabase.from("kommentare").insert({
      bestellung_id,
      autor_kuerzel: profil.kuerzel,
      autor_name: profil.name,
      text: text.trim(),
    });

    if (error) {
      logError("/api/kommentare", "Kommentar Fehler", error);
      return NextResponse.json({ error: "Kommentar konnte nicht gespeichert werden" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/kommentare", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
