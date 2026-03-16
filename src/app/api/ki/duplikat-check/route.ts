import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { pruefeDuplikat } from "@/lib/openai";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/ki/duplikat-check – Prüft ob eine Bestellung ein Duplikat ist
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const profil = await getBenutzerProfil();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { bestellung_id } = await request.json();
    if (!bestellung_id) {
      return NextResponse.json({ error: "bestellung_id fehlt" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Aktuelle Bestellung laden
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, betrag, created_at")
      .eq("id", bestellung_id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Artikel der aktuellen Bestellung laden
    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("artikel")
      .eq("bestellung_id", bestellung_id)
      .not("artikel", "is", null);

    const aktuelleArtikel = (dokumente || [])
      .flatMap((d) => {
        const art = d.artikel as { name: string; menge: number; einzelpreis: number }[] | null;
        return art || [];
      });

    // Bestellungen der letzten 7 Tage beim gleichen Händler laden
    const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: aehnliche } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, betrag, created_at")
      .eq("haendler_name", bestellung.haendler_name)
      .neq("id", bestellung_id)
      .gte("created_at", siebenTageZurueck)
      .limit(10);

    if (!aehnliche || aehnliche.length === 0) {
      return NextResponse.json({
        ist_duplikat: false,
        konfidenz: 1,
        duplikat_von: null,
        begruendung: "Keine vergleichbaren Bestellungen in den letzten 7 Tagen.",
      });
    }

    // Artikel der ähnlichen Bestellungen laden (Batch)
    const aehnlicheIds = aehnliche.map((b) => b.id);
    const { data: aehnlicheDoks } = await supabase
      .from("dokumente")
      .select("bestellung_id, artikel")
      .in("bestellung_id", aehnlicheIds)
      .not("artikel", "is", null);

    const artikelMap = new Map<string, { name: string; menge: number; einzelpreis: number }[]>();
    for (const dok of aehnlicheDoks || []) {
      const art = dok.artikel as { name: string; menge: number; einzelpreis: number }[] | null;
      if (art) {
        const existing = artikelMap.get(dok.bestellung_id) || [];
        artikelMap.set(dok.bestellung_id, [...existing, ...art]);
      }
    }

    const existierendeBestellungen = aehnliche.map((b) => ({
      bestellnummer: b.bestellnummer || "Ohne Nr.",
      haendler: b.haendler_name || "–",
      betrag: Number(b.betrag) || null,
      artikel: artikelMap.get(b.id) || [],
      datum: new Date(b.created_at).toLocaleDateString("de-DE"),
    }));

    const ergebnis = await pruefeDuplikat(
      {
        haendler: bestellung.haendler_name || "–",
        betrag: Number(bestellung.betrag) || null,
        artikel: aktuelleArtikel,
      },
      existierendeBestellungen
    );

    return NextResponse.json(ergebnis);
  } catch (err) {
    logError("/api/ki/duplikat-check", "Duplikat-Check Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
