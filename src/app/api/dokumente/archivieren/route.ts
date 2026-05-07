import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireRoles } from "@/lib/auth";

// POST /api/dokumente/archivieren — Bezahlte Rechnungs-Dokumente archivieren.
//
// 07.05.2026 — Pro Rechnungs-Dokument (statt Bestellung). Eine Sammel-
// Bestellung kann jetzt teil-archiviert werden (eine Teil-Rechnung archiviert,
// andere noch offen für Buchhaltung). Wenn ALLE Rechnungen einer Bestellung
// archiviert sind, archivieren wir die Bestellung selbst auto-mit (für die
// Konsistenz mit dem Archiv-View).
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Mindestens eine Dokument-ID erforderlich" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: "Maximal 100 Dokumente gleichzeitig" }, { status: 400 });
    }
    if (!ids.every(isValidUUID)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
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
    if (!requireRoles(profil, "besteller", "buchhaltung", "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const serviceClient = createServiceClient();

    // Nur Rechnungs-Dokumente die bezahlt sind und deren Bestellung freigegeben ist
    const { data: dokumente } = await serviceClient
      .from("dokumente")
      .select("id, bestellung_id, bezahlt_am, archiviert_am, bestellung:bestellungen!inner(id, status)")
      .in("id", ids)
      .eq("typ", "rechnung")
      .not("bezahlt_am", "is", null);

    const gueltige = (dokumente || []).filter((d) => {
      const b = (d.bestellung as unknown) as { status: string } | null;
      return b?.status === "freigegeben";
    });

    if (gueltige.length === 0) {
      return NextResponse.json({ error: "Keine archivierbaren Rechnungen gefunden" }, { status: 400 });
    }

    const gueltigeIds = gueltige.map((d) => d.id);
    const archivIso = new Date().toISOString();

    const { error: updateError } = await serviceClient
      .from("dokumente")
      .update({ archiviert_am: archivIso })
      .in("id", gueltigeIds);

    if (updateError) {
      logError("/api/dokumente/archivieren", "Update fehlgeschlagen", updateError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    // Folge-Logik: pro betroffener Bestellung prüfen, ob ALLE Rechnungen archiviert
    // sind → Bestellung selbst archivieren. Beim Archiv-View bleibt es konsistent.
    const bestellIds = Array.from(new Set(gueltige.map((d) => d.bestellung_id)));
    for (const bId of bestellIds) {
      const { data: rg } = await serviceClient
        .from("dokumente")
        .select("id, archiviert_am")
        .eq("bestellung_id", bId)
        .eq("typ", "rechnung");
      const total = rg?.length ?? 0;
      const archiviert = (rg || []).filter((r) => !!r.archiviert_am).length;
      if (total > 0 && archiviert === total) {
        await serviceClient
          .from("bestellungen")
          .update({
            archiviert_am: archivIso,
            archiviert_von: profil.name,
            updated_at: archivIso,
          })
          .eq("id", bId)
          .is("archiviert_am", null);
      }
    }

    return NextResponse.json({
      success: true,
      archiviert: gueltigeIds.length,
      archiviert_von: profil.name,
    });
  } catch (err) {
    logError("/api/dokumente/archivieren", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
