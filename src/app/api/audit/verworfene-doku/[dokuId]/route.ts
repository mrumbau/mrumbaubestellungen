import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { ERRORS } from "@/lib/errors";

/**
 * GET /api/audit/verworfene-doku/[dokuId]
 *
 * 21.05.2026 — Liefert eine signed Storage-URL für ein Dokument das zu einer
 * verworfenen Bestellung gehörte. Die `dokumente`-Reihe ist beim Verwerfen
 * gelöscht worden — aber der `storage_pfad`-Snapshot bleibt in
 * `verworfene_emails.dokumente_snapshot` erhalten. Solange der Storage-
 * Cleanup-Cron das File noch nicht entfernt hat, kann der User es ansehen.
 *
 * Zugang: alle authentifizierten User mit benutzer_rollen-Eintrag (gleiche
 * Logik wie die Audit-Liste selbst).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dokuId: string }> },
) {
  try {
    const { dokuId } = await params;
    if (!isValidUUID(dokuId)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Verify user is in benutzer_rollen (= matches RLS-Policy for verworfene_emails)
    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("kuerzel")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Finde den verworfene_emails-Eintrag dessen dokumente_snapshot diese
    // Doku-ID enthält. JSONB-Containment via @> Operator.
    const supabase = createServiceClient();
    const { data: rows, error } = await supabase
      .from("verworfene_emails")
      .select("dokumente_snapshot")
      .filter("dokumente_snapshot", "cs", JSON.stringify([{ id: dokuId }]))
      .limit(1);

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }
    const snapshot = rows?.[0]?.dokumente_snapshot as Array<{ id: string; storage_pfad: string }> | null;
    const match = snapshot?.find((d) => d.id === dokuId);
    if (!match?.storage_pfad) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from("dokumente")
      .createSignedUrl(match.storage_pfad, 300); // 5 Min

    if (signError || !signedData?.signedUrl) {
      // Storage-File wurde wahrscheinlich vom Orphan-Cleanup-Cron entfernt
      return NextResponse.json(
        {
          error:
            "Dokument nicht mehr verfügbar — wurde nach dem Verwerfen aus dem Storage entfernt (Cleanup-Cron läuft täglich, Dateien älter als 24h werden gelöscht wenn sie keinen aktiven dokumente-Record mehr haben).",
        },
        { status: 410 }, // Gone
      );
    }

    return NextResponse.json({ url: signedData.signedUrl });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
