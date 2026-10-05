/**
 * GET /api/audit/bestellung/[id]
 *
 * Welle 4 — O2 (06.05.2026): Event-Sourcing-API.
 *
 * Liefert den unveränderlichen Audit-Trail einer Bestellung — chronologisch
 * absteigend (neuestes Event oben). RLS auf events-Tabelle filtert automatisch
 * (besteller sieht nur eigene Bestellungen, admin alle).
 *
 * Use-Cases:
 *  - Detail-Page-Timeline: alle Status-Wechsel + Doku-Adds + Kommentare
 *  - Compliance-Audit: GoBD-konformer Beleg-Trail
 *  - Debug: warum hat Pipeline X getan?
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // UUID-Validation (kompakt)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Ungültige Bestellung-ID" }, { status: 400 });
    }

    const profil = await getBenutzerProfil();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // RLS filtert: besteller sieht nur eigene, admin alle.
    const { data: events, error } = await supabase
      .from("events")
      .select("id, event_type, actor, payload, created_at")
      .eq("entity_type", "bestellung")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      logError("/api/audit/bestellung/[id]", "Query-Fehler", error);
      return NextResponse.json({ error: "DB-Fehler" }, { status: 500 });
    }

    return NextResponse.json({
      bestellung_id: id,
      events: events || [],
      count: (events || []).length,
    });
  } catch (err) {
    logError("/api/audit/bestellung/[id]", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
