import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID, isValidKuerzel } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

// POST /api/bestellungen/zuordnen – Bestellung einem Besteller zuordnen.
// 22.05.2026 — von admin-only auf admin+besteller geöffnet, weil "Nicht zugeordnet"
// jetzt auf der /todo-Page für alle sichtbar ist (jeder soll claimen können).
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

    // Rolle prüfen (admin + besteller — beide dürfen UNBEKANNT-Bestellungen zuordnen)
    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle, kuerzel, name")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin", "besteller")) {
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
    // 22.05.2026 — zuordnung_methode kennzeichnet den ausführenden Actor:
    // "manuell_admin" wenn Admin, "manuell_besteller" wenn Besteller (für Audit).
    const zuordnungsMethode =
      profil?.rolle === "admin" ? "manuell_admin" : "manuell_besteller";
    const { error } = await supabase
      .from("bestellungen")
      .update({
        besteller_kuerzel: benutzer.kuerzel,
        besteller_name: benutzer.name,
        zuordnung_methode: zuordnungsMethode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bestellung_id);

    if (error) {
      return NextResponse.json({ error: "Zuordnung fehlgeschlagen" }, { status: 500 });
    }

    // Kommentar für Nachvollziehbarkeit (F5.4: User-Input wird sanitized
    // bevor er ins kommentare.text Template fließt — verhindert XSS via
    // bösartige benutzer.name)
    const safeKuerzel = String(benutzer.kuerzel).replace(/[^A-Za-z0-9]/g, "");
    const safeName = String(benutzer.name).replace(/[<>"&']/g, "").slice(0, 100);
    const safeVorher = String(vorher).replace(/[<>"&']/g, "").slice(0, 100);
    const actorKuerzel = String(profil?.kuerzel ?? "SYSTEM").replace(/[^A-Za-z0-9]/g, "");
    const actorName = String(profil?.name ?? "System").replace(/[<>"&']/g, "").slice(0, 100);
    await supabase.from("kommentare").insert({
      bestellung_id,
      autor_kuerzel: actorKuerzel,
      autor_name: actorName,
      text: `Besteller manuell zugeordnet: ${safeVorher} → ${safeKuerzel} (${safeName})`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
