import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { exportiereAlsDATEV, type FreigegebeneRechnung } from "@/lib/datev-export";
import { ERRORS } from "@/lib/errors";

// GET /api/export/datev – DATEV Buchungsstapel CSV Export
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Nur Buchhaltung + Admin
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || !["admin", "buchhaltung"].includes(profil.rolle)) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const url = new URL(request.url);
    const von = url.searchParams.get("von");
    const bis = url.searchParams.get("bis");
    const projektId = url.searchParams.get("projekt_id");
    const beraterNr = url.searchParams.get("berater_nr") || "00000";
    const mandantenNr = url.searchParams.get("mandanten_nr") || "00000";
    const gegenKonto = url.searchParams.get("gegen_konto") || "4980";

    if (!von || !bis) {
      return NextResponse.json({ error: "von und bis Parameter erforderlich" }, { status: 400 });
    }

    // Freigegebene Bestellungen im Zeitraum laden
    let query = supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, betrag, projekt_name, created_at, updated_at")
      .eq("status", "freigegeben")
      .gte("updated_at", `${von}T00:00:00`)
      .lte("updated_at", `${bis}T23:59:59`)
      .order("updated_at", { ascending: true });

    if (projektId) {
      query = query.eq("projekt_id", projektId);
    }

    const { data: bestellungen, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
    }

    if (!bestellungen || bestellungen.length === 0) {
      return NextResponse.json({ error: "Keine Buchungen im gewählten Zeitraum" }, { status: 404 });
    }

    // Rechnungs-Dokumente laden für Netto/MwSt Details
    const bestellIds = bestellungen.map((b) => b.id);
    const { data: rechnungen } = await supabase
      .from("dokumente")
      .select("bestellung_id, netto, mwst, gesamtbetrag")
      .in("bestellung_id", bestellIds)
      .eq("typ", "rechnung");

    const rechnungMap = new Map(
      (rechnungen || []).map((r) => [r.bestellung_id, r])
    );

    // Daten für Export aufbereiten
    const exportDaten: FreigegebeneRechnung[] = bestellungen.map((b) => {
      const rechnung = rechnungMap.get(b.id);
      return {
        id: b.id,
        bestellnummer: b.bestellnummer,
        haendler_name: b.haendler_name,
        betrag: b.betrag,
        projekt_name: b.projekt_name,
        created_at: b.created_at,
        updated_at: b.updated_at,
        netto: rechnung?.netto || null,
        mwst: rechnung?.mwst || null,
      };
    });

    const { csv, dateiname } = exportiereAlsDATEV(exportDaten, {
      von,
      bis,
      beraterNr,
      mandantenNr,
      gegenKonto,
    });

    // UTF-8 mit BOM Encoding
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(csv);
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const withBom = new Uint8Array(bom.length + utf8Bytes.length);
    withBom.set(bom);
    withBom.set(utf8Bytes, bom.length);

    return new NextResponse(withBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dateiname}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
