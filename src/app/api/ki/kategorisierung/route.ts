import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { kategorisiereArtikel } from "@/lib/openai";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/ki/kategorisierung – Kategorisiert Artikel einer Bestellung
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

    // Artikel der Bestellung laden
    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("artikel")
      .eq("bestellung_id", bestellung_id)
      .not("artikel", "is", null);

    const artikel = (dokumente || [])
      .flatMap((d) => {
        const art = d.artikel as { name: string; menge: number; einzelpreis: number }[] | null;
        return art || [];
      });

    if (artikel.length === 0) {
      return NextResponse.json({
        kategorien: [],
        zusammenfassung: {},
      });
    }

    const ergebnis = await kategorisiereArtikel(artikel);
    return NextResponse.json(ergebnis);
  } catch (err) {
    logError("/api/ki/kategorisierung", "Kategorisierung Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
