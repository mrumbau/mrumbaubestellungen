import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/bestellungen/[id]/verwerfen – "Erwartet"-Bestellung verwerfen (löschen)
// Nur für Bestellungen mit Status "erwartet" die keine Dokumente haben
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    // Auth prüfen
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Bestellung laden und prüfen
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("id, status, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    if (bestellung.status !== "erwartet") {
      return NextResponse.json(
        { error: "Nur Bestellungen mit Status 'erwartet' können verworfen werden." },
        { status: 400 }
      );
    }

    // Prüfen ob Dokumente vorhanden
    const hatDokumente =
      bestellung.hat_bestellbestaetigung ||
      bestellung.hat_lieferschein ||
      bestellung.hat_rechnung ||
      bestellung.hat_aufmass ||
      bestellung.hat_leistungsnachweis;

    if (hatDokumente) {
      return NextResponse.json(
        { error: "Bestellung hat bereits Dokumente und kann nicht verworfen werden." },
        { status: 400 }
      );
    }

    // Abhängige Daten löschen
    await supabase.from("dokumente").delete().eq("bestellung_id", id);
    await supabase.from("abgleiche").delete().eq("bestellung_id", id);
    await supabase.from("kommentare").delete().eq("bestellung_id", id);

    // Bestellung löschen
    const { error: deleteError } = await supabase
      .from("bestellungen")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logError("/api/bestellungen/[id]/verwerfen", "Löschen fehlgeschlagen", deleteError);
      return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/bestellungen/[id]/verwerfen", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
