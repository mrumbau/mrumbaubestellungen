import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fasseBestellungZusammen } from "@/lib/openai";
import { isValidUUID } from "@/lib/validation";

// POST /api/ki/bestellung-zusammenfassung – KI-Zusammenfassung einer Bestellung
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { bestellung_id } = await request.json();
    if (!bestellung_id) {
      return NextResponse.json({ error: "bestellung_id erforderlich" }, { status: 400 });
    }

    if (!isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültiges bestellung_id Format" }, { status: 400 });
    }

    // Bestelldaten laden
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("bestellnummer, haendler_name, status, betrag")
      .eq("id", bestellung_id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: "Bestellung nicht gefunden" }, { status: 404 });
    }

    // Abgleich laden
    const { data: abgleich } = await supabase
      .from("abgleiche")
      .select("abweichungen")
      .eq("bestellung_id", bestellung_id)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .single();

    // Kommentare laden
    const { data: kommentare } = await supabase
      .from("kommentare")
      .select("autor_name, text, erstellt_am")
      .eq("bestellung_id", bestellung_id)
      .order("erstellt_am", { ascending: true });

    const zusammenfassung = await fasseBestellungZusammen(
      {
        bestellnummer: bestellung.bestellnummer || "Ohne Nr.",
        haendler: bestellung.haendler_name || "–",
        status: bestellung.status,
        betrag: Number(bestellung.betrag) || 0,
      },
      (abgleich?.abweichungen as { feld: string; artikel?: string; erwartet: string | number; gefunden: string | number }[]) || [],
      (kommentare || []).map((k) => ({
        autor: k.autor_name,
        text: k.text,
        datum: new Date(k.erstellt_am).toLocaleDateString("de-DE"),
      }))
    );

    return NextResponse.json({ zusammenfassung });
  } catch (err) {
    console.error("KI-Bestellung-Zusammenfassung Fehler:", err);
    return NextResponse.json(
      { error: "Zusammenfassung konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}
