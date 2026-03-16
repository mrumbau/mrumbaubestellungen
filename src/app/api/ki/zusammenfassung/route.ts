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

    // Neueste 50 Bestellungen laden (Performance-Limit)
    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

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

    // Abweichende Bestellungen mit Details (Batch-Query statt N+1)
    const abweichendeBestellungen = alle
      .filter((b) => b.status === "abweichung")
      .slice(0, 5);

    const abweichendeIds = abweichendeBestellungen.map((b) => b.id);
    const { data: alleAbgleiche } = abweichendeIds.length > 0
      ? await supabase
          .from("abgleiche")
          .select("bestellung_id, ki_zusammenfassung")
          .in("bestellung_id", abweichendeIds)
          .order("erstellt_am", { ascending: false })
      : { data: [] };

    const abgleichMap = new Map(
      (alleAbgleiche || []).map((a) => [a.bestellung_id, a.ki_zusammenfassung])
    );

    const abweichendeMitDetails = abweichendeBestellungen.map((b) => ({
      bestellnummer: b.bestellnummer || "Ohne Nr.",
      haendler: b.haendler_name || "–",
      problem: abgleichMap.get(b.id) || "Abweichung erkannt",
    }));

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
