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
      .select("rolle, kuerzel")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { bestellung_id, bestellung_ids } = body;

    // Bulk oder Einzel
    const ids: string[] = bestellung_ids
      ? (bestellung_ids as string[]).filter((id: string) => isValidUUID(id))
      : bestellung_id && isValidUUID(bestellung_id)
        ? [bestellung_id]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Keine gültige Bestellungs-ID" }, { status: 400 });
    }

    if (ids.length > 50) {
      return NextResponse.json({ error: "Maximal 50 Bestellungen pro Anfrage" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Besteller dürfen nur eigene Bestellungen verwerfen
    if (profil!.rolle === "besteller") {
      const { data: eigene } = await supabase
        .from("bestellungen")
        .select("id")
        .in("id", ids)
        .eq("besteller_kuerzel", profil!.kuerzel);
      const eigeneIds = new Set((eigene || []).map((b) => b.id));
      const fremde = ids.filter((id) => !eigeneIds.has(id));
      if (fremde.length > 0) {
        return NextResponse.json(
          { error: "Keine Berechtigung für fremde Bestellungen" },
          { status: 403 }
        );
      }
    }

    // Verworfene Email-Muster lernen (vor dem Löschen!)
    for (const id of ids) {
      const { data: docs } = await supabase
        .from("dokumente")
        .select("email_absender, email_betreff")
        .eq("bestellung_id", id);

      if (docs && docs.length > 0) {
        const muster = docs
          .filter((d) => d.email_absender && d.email_betreff)
          .map((d) => {
            const addr = (d.email_absender || "").toLowerCase().trim();
            const domain = addr.split("@")[1] || "";
            return {
              absender_adresse: addr,
              absender_domain: domain,
              email_betreff: d.email_betreff || "",
              verworfen_von: profil!.kuerzel,
            };
          })
          .filter((m) => m.absender_domain);

        if (muster.length > 0) {
          await supabase.from("verworfene_emails").insert(muster);
        }
      }
    }

    // Zugehörige Daten löschen (Reihenfolge: FK-Abhängigkeiten zuerst)
    for (const id of ids) {
      await supabase.from("webhook_logs").delete().eq("bestellung_id", id);
      await supabase.from("freigaben").delete().eq("bestellung_id", id);
      await supabase.from("abgleiche").delete().eq("bestellung_id", id);
      await supabase.from("kommentare").delete().eq("bestellung_id", id);
      await supabase.from("dokumente").delete().eq("bestellung_id", id);
    }

    // Defense-in-depth: Besteller-Filter auch im DELETE (zusätzlich zum Check oben)
    let deleteQuery = supabase.from("bestellungen").delete().in("id", ids);
    if (profil!.rolle === "besteller") {
      deleteQuery = deleteQuery.eq("besteller_kuerzel", profil!.kuerzel);
    }
    const { error: delError } = await deleteQuery;
    if (delError) {
      return NextResponse.json({ error: "Bestellungen konnten nicht gelöscht werden" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
