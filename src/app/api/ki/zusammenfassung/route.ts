import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generiereWochenzusammenfassung } from "@/lib/openai";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// GET /api/ki/zusammenfassung – KI-Dashboard-Zusammenfassung
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Neueste 50 Bestellungen laden (RLS filtert automatisch nach Rolle)
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
    const freigegebenesVolumen = alle
      .filter((b) => b.status === "freigegeben" && b.betrag)
      .reduce((sum, b) => sum + Number(b.betrag), 0);

    // Überfällige Rechnungen – nur für Bestellungen die der User sehen darf
    const bestellIds = alle.map((b) => b.id);
    const { data: rechnungen } = bestellIds.length > 0
      ? await supabase
          .from("dokumente")
          .select("bestellung_id, faelligkeitsdatum")
          .eq("typ", "rechnung")
          .in("bestellung_id", bestellIds)
          .not("faelligkeitsdatum", "is", null)
      : { data: [] as { bestellung_id: string; faelligkeitsdatum: string }[] };

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
      freigegebenes_volumen: freigegebenesVolumen,
      ueberfaellige_rechnungen: ueberfaelligeRechnungen,
      abweichende_bestellungen: abweichendeMitDetails,
    });

    // Write-through in Dashboard-Cache — beim nächsten Page-Load wird er direkt geladen
    // statt den OpenAI-Call zu wiederholen. Upsert über UNIQUE(user_id, typ).
    const generatedAt = new Date().toISOString();
    await supabase
      .from("dashboard_ki_cache")
      .upsert(
        {
          user_id: user.id,
          typ: "zusammenfassung",
          inhalt: zusammenfassung,
          generated_at: generatedAt,
        },
        { onConflict: "user_id,typ" },
      );

    return NextResponse.json({ ...zusammenfassung, generated_at: generatedAt });
  } catch (err) {
    logError("/api/ki/zusammenfassung", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
