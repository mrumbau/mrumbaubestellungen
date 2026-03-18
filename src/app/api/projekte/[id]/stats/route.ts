import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { ERRORS } from "@/lib/errors";

// GET /api/projekte/[id]/stats – Projekt-Statistiken
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Projekt + Budget laden
    const [{ data: projekt }, { data: bestellungen }] = await Promise.all([
      supabase.from("projekte").select("id, name, budget").eq("id", id).single(),
      supabase.from("bestellungen").select("betrag, status, besteller_kuerzel, created_at").eq("projekt_id", id),
    ]);

    if (!projekt) {
      return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
    }

    const rows = bestellungen || [];
    const gesamt_ausgaben = rows.reduce((sum, b) => sum + (Number(b.betrag) || 0), 0);
    const anzahl_bestellungen = rows.length;
    const offene_bestellungen = rows.filter((b) =>
      ["offen", "erwartet", "abweichung", "ls_fehlt", "vollstaendig"].includes(b.status)
    ).length;

    const budget_auslastung_prozent = projekt.budget
      ? Math.min((gesamt_ausgaben / Number(projekt.budget)) * 100, 100)
      : null;

    const letzte_bestellung = rows.length > 0
      ? rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
      : null;

    // Besteller-Stats aggregieren
    const bestellerMap = new Map<string, number>();
    for (const b of rows) {
      bestellerMap.set(b.besteller_kuerzel, (bestellerMap.get(b.besteller_kuerzel) || 0) + 1);
    }
    const besteller = Array.from(bestellerMap.entries()).map(([kuerzel, anzahl]) => ({ kuerzel, anzahl }));

    return NextResponse.json({
      gesamt_ausgaben,
      anzahl_bestellungen,
      offene_bestellungen,
      budget: projekt.budget ? Number(projekt.budget) : null,
      budget_auslastung_prozent,
      letzte_bestellung,
      besteller,
    });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
