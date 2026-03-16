import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generiereWochenzusammenfassung } from "@/lib/openai";

// GET /api/ki/zusammenfassung – KI-Dashboard-Zusammenfassung
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Alle Bestellungen laden
    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("*")
      .order("created_at", { ascending: false });

    const alle = bestellungen || [];

    const offen = alle.filter((b) => b.status === "offen").length;
    const abweichungen = alle.filter((b) => b.status === "abweichung").length;
    const lsFehlt = alle.filter((b) => b.status === "ls_fehlt").length;
    const freigegeben = alle.filter((b) => b.status === "freigegeben").length;
    const vollstaendig = alle.filter((b) => b.status === "vollstaendig").length;
    const erwartet = alle.filter((b) => b.status === "erwartet").length;

    const freigegebenesVolumen = alle
      .filter((b) => b.status === "freigegeben" && b.betrag)
      .reduce((sum, b) => sum + Number(b.betrag), 0);

    // Überfällige Rechnungen
    const { data: rechnungen } = await supabase
      .from("dokumente")
      .select("bestellung_id, faelligkeitsdatum")
      .eq("typ", "rechnung")
      .not("faelligkeitsdatum", "is", null);

    const ueberfaelligeRechnungen: { bestellnummer: string; haendler: string; faellig: string; betrag: number }[] = [];

    for (const r of rechnungen || []) {
      if (new Date(r.faelligkeitsdatum).getTime() < Date.now()) {
        const best = alle.find((b) => b.id === r.bestellung_id);
        if (best && best.status !== "freigegeben") {
          ueberfaelligeRechnungen.push({
            bestellnummer: best.bestellnummer || "Ohne Nr.",
            haendler: best.haendler_name || "–",
            faellig: r.faelligkeitsdatum,
            betrag: Number(best.betrag) || 0,
          });
        }
      }
    }

    // Abweichende Bestellungen mit Details
    const abweichendeBestellungen = alle
      .filter((b) => b.status === "abweichung")
      .slice(0, 5);

    const abweichendeMitDetails: { bestellnummer: string; haendler: string; problem: string }[] = [];
    for (const b of abweichendeBestellungen) {
      const { data: abgleich } = await supabase
        .from("abgleiche")
        .select("ki_zusammenfassung")
        .eq("bestellung_id", b.id)
        .limit(1)
        .single();

      abweichendeMitDetails.push({
        bestellnummer: b.bestellnummer || "Ohne Nr.",
        haendler: b.haendler_name || "–",
        problem: abgleich?.ki_zusammenfassung || "Abweichung erkannt",
      });
    }

    const zusammenfassung = await generiereWochenzusammenfassung({
      gesamt: alle.length,
      offen,
      abweichungen,
      ls_fehlt: lsFehlt,
      freigegeben,
      vollstaendig,
      erwartet,
      freigegebenes_volumen: freigegebenesVolumen,
      ueberfaellige_rechnungen: ueberfaelligeRechnungen,
      abweichende_bestellungen: abweichendeMitDetails,
    });

    return NextResponse.json(zusammenfassung);
  } catch (err) {
    console.error("KI-Zusammenfassung Fehler:", err);
    return NextResponse.json(
      { error: "Zusammenfassung konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}
