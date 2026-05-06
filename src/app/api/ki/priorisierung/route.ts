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
    // 06.05.2026: bestelldatum + faelligkeitsdatum direkt aus bestellungen-Spalte
    // (vorher Join über dokumente-Tabelle für faelligkeitsdatum nötig). Plus
    // bestelldatum für genaueres tage_alt — Make.com-Niveau-Datenfluss.
    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, status, betrag, hat_rechnung, hat_lieferschein, created_at, bestelldatum, faelligkeitsdatum")
      .in("status", ["offen", "abweichung", "ls_fehlt", "vollstaendig"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!bestellungen || bestellungen.length === 0) {
      const leer = {
        bestellungen: [],
        zusammenfassung: "Keine offenen Bestellungen vorhanden.",
      };
      const generatedAt = new Date().toISOString();
      await supabase
        .from("dashboard_ki_cache")
        .upsert(
          {
            user_id: profil.user_id,
            typ: "priorisierung",
            inhalt: leer,
            generated_at: generatedAt,
          },
          { onConflict: "user_id,typ" },
        );
      return NextResponse.json({ ...leer, generated_at: generatedAt });
    }

    const now = Date.now();
    const prioInput = bestellungen.map((b) => ({
      bestellnummer: b.bestellnummer || "Ohne Nr.",
      haendler: b.haendler_name || "–",
      status: b.status,
      betrag: Number(b.betrag) || null,
      // bestelldatum bevorzugt — created_at ist Pipeline-Erfassung, nicht Bestelltag
      tage_alt: Math.floor((now - new Date(b.bestelldatum ?? b.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      hat_rechnung: b.hat_rechnung,
      hat_lieferschein: b.hat_lieferschein,
      faelligkeitsdatum: b.faelligkeitsdatum,
    }));

    const ergebnis = await priorisiereBestellungen(prioInput);

    // Write-through in Dashboard-Cache — beim nächsten Page-Load wird direkt geladen
    const generatedAt = new Date().toISOString();
    await supabase
      .from("dashboard_ki_cache")
      .upsert(
        {
          user_id: profil.user_id,
          typ: "priorisierung",
          inhalt: ergebnis,
          generated_at: generatedAt,
        },
        { onConflict: "user_id,typ" },
      );

    return NextResponse.json({ ...ergebnis, generated_at: generatedAt });
  } catch (err) {
    logError("/api/ki/priorisierung", "Priorisierung Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
