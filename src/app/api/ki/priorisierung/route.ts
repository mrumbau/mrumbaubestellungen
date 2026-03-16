import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { priorisiereBestellungen } from "@/lib/openai";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/ki/priorisierung – Priorisiert offene Bestellungen nach Dringlichkeit
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const profil = await getBenutzerProfil();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Alle offenen Bestellungen laden (nicht freigegeben, nicht erwartet)
    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, status, betrag, hat_rechnung, hat_lieferschein, created_at")
      .in("status", ["offen", "abweichung", "ls_fehlt", "vollstaendig"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!bestellungen || bestellungen.length === 0) {
      return NextResponse.json({
        bestellungen: [],
        zusammenfassung: "Keine offenen Bestellungen vorhanden.",
      });
    }

    // Fälligkeitsdaten aus Rechnungen laden (Batch)
    const bestellIds = bestellungen.map((b) => b.id);
    const { data: rechnungen } = await supabase
      .from("dokumente")
      .select("bestellung_id, faelligkeitsdatum")
      .in("bestellung_id", bestellIds)
      .eq("typ", "rechnung")
      .not("faelligkeitsdatum", "is", null);

    const faelligkeitsMap = new Map(
      (rechnungen || []).map((r) => [r.bestellung_id, r.faelligkeitsdatum])
    );

    const now = Date.now();
    const prioInput = bestellungen.map((b) => ({
      bestellnummer: b.bestellnummer || "Ohne Nr.",
      haendler: b.haendler_name || "–",
      status: b.status,
      betrag: Number(b.betrag) || null,
      tage_alt: Math.floor((now - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      hat_rechnung: b.hat_rechnung,
      hat_lieferschein: b.hat_lieferschein,
      faelligkeitsdatum: faelligkeitsMap.get(b.id) || null,
    }));

    const ergebnis = await priorisiereBestellungen(prioInput);
    return NextResponse.json(ergebnis);
  } catch (err) {
    logError("/api/ki/priorisierung", "Priorisierung Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
