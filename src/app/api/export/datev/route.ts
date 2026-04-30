import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { exportiereAlsDATEV, type FreigegebeneRechnung } from "@/lib/datev-export";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

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

    if (!requireRoles(profil, "admin", "buchhaltung")) {
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

    // Datum-Format validieren (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(von) || !dateRegex.test(bis) || isNaN(Date.parse(von)) || isNaN(Date.parse(bis))) {
      return NextResponse.json({ error: "Ungültiges Datumsformat (YYYY-MM-DD erwartet)" }, { status: 400 });
    }

    // Numerische Params validieren
    if (!/^\d{1,7}$/.test(beraterNr) || !/^\d{1,7}$/.test(mandantenNr) || !/^\d{4,5}$/.test(gegenKonto)) {
      return NextResponse.json({ error: "Ungültige Berater-Nr., Mandanten-Nr. oder Gegenkonto" }, { status: 400 });
    }

    if (projektId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projektId)) {
      return NextResponse.json({ error: "Ungültige Projekt-ID" }, { status: 400 });
    }

    // Freigegebene Bestellungen im Zeitraum laden
    let query = supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, betrag, projekt_name, created_at, updated_at, bestellungsart")
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
        bestellungsart: b.bestellungsart || "material",
      };
    });

    const { csv, dateiname } = exportiereAlsDATEV(exportDaten, {
      von,
      bis,
      beraterNr,
      mandantenNr,
      gegenKonto,
    });

    // F5.9: DATEV-Format-Spec verlangt CP1252 (Windows-Latin-1).
    // UTF-8 mit BOM funktioniert in modernen DATEV-Versionen, ältere Buchhaltungs-
    // Tools (mancher Steuerkanzleien-Software) interpretieren UTF-8-Umlaute falsch.
    // CP1252 ist die offizielle Erwartung im "EXTF Version 700"-Standard.
    const iconv = await import("iconv-lite");
    const cp1252Buf = iconv.encode(csv, "win1252");
    // Buffer → Blob für NextResponse-Body (Buffer ist nicht direkt BodyInit-kompatibel)
    const blob = new Blob([new Uint8Array(cp1252Buf)], { type: "text/csv" });

    return new NextResponse(blob, {
      headers: {
        "Content-Type": "text/csv; charset=windows-1252",
        "Content-Disposition": `attachment; filename="${dateiname}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
