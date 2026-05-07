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
    // 06.05.2026 — neuer Filter: nach welchem Datumsfeld wird der Zeitraum gemessen?
    // freigabe (Default) = updated_at, faelligkeit = faelligkeitsdatum, bestellung = bestelldatum.
    const datumBasisRaw = url.searchParams.get("datum_basis") || "freigabe";
    const datumBasis: "freigabe" | "faelligkeit" | "bestellung" =
      datumBasisRaw === "faelligkeit" || datumBasisRaw === "bestellung"
        ? datumBasisRaw
        : "freigabe";

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

    // 07.05.2026 — DATEV-Export pro RECHNUNGS-DOKUMENT statt pro Bestellung.
    // Sammel-Aufträge mit Teil-Rechnungen erzeugen jetzt n DATEV-Buchungssätze
    // (steuerlich korrekt: pro Rechnungsbeleg ein Buchungssatz mit eigener
    // Rechnungsnummer / Fälligkeit / MwSt). Bisher war es 1 Sammel-Buchungssatz
    // mit dem aggregierten bestellungen.betrag — falsch in DATEV.
    let query = supabase
      .from("dokumente")
      .select(
        "id, bestellung_id, gesamtbetrag, netto, mwst, faelligkeitsdatum, bestellnummer_erkannt, created_at, " +
        "bestellung:bestellungen!inner(id, bestellnummer, haendler_name, projekt_name, projekt_id, betrag, created_at, updated_at, bestellungsart, bestelldatum, faelligkeitsdatum, status)",
      )
      .eq("typ", "rechnung")
      .eq("bestellung.status", "freigegeben")
      .order("created_at", { ascending: true });

    if (datumBasis === "faelligkeit") {
      // Filter pro Doku-Fälligkeit (jede Rechnung hat ihre eigene)
      query = query
        .gte("faelligkeitsdatum", von)
        .lte("faelligkeitsdatum", bis)
        .not("faelligkeitsdatum", "is", null);
    } else if (datumBasis === "bestellung") {
      query = query
        .gte("bestellung.bestelldatum", von)
        .lte("bestellung.bestelldatum", bis)
        .not("bestellung.bestelldatum", "is", null);
    } else {
      // freigabe = updated_at der Bestellung
      query = query
        .gte("bestellung.updated_at", `${von}T00:00:00`)
        .lte("bestellung.updated_at", `${bis}T23:59:59`);
    }

    if (projektId) {
      query = query.eq("bestellung.projekt_id", projektId);
    }

    const { data: rechnungsDokumente, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
    }
    if (!rechnungsDokumente || rechnungsDokumente.length === 0) {
      return NextResponse.json({ error: "Keine Buchungen im gewählten Zeitraum" }, { status: 404 });
    }

    type RechnungsDoku = {
      id: string;
      bestellung_id: string;
      gesamtbetrag: number | null;
      netto: number | null;
      mwst: number | null;
      faelligkeitsdatum: string | null;
      bestellnummer_erkannt: string | null;
      created_at: string;
      bestellung: {
        id: string;
        bestellnummer: string | null;
        haendler_name: string | null;
        projekt_name: string | null;
        betrag: number | null;
        created_at: string;
        updated_at: string;
        bestellungsart: string | null;
        bestelldatum: string | null;
        faelligkeitsdatum: string | null;
      };
    };

    // Daten für Export aufbereiten — pro Rechnungs-Dokument ein Eintrag
    const exportDaten: FreigegebeneRechnung[] = (rechnungsDokumente as unknown as RechnungsDoku[]).map((d) => {
      const b = d.bestellung as unknown as {
        id: string;
        bestellnummer: string | null;
        haendler_name: string | null;
        projekt_name: string | null;
        betrag: number | null;
        created_at: string;
        updated_at: string;
        bestellungsart: string | null;
        bestelldatum: string | null;
        faelligkeitsdatum: string | null;
      };
      return {
        // id = Doku-id (eindeutig pro Buchungssatz)
        id: d.id,
        // Rechnungsnr aus dem Doku, fallback Bestellnr
        bestellnummer: d.bestellnummer_erkannt || b.bestellnummer,
        haendler_name: b.haendler_name,
        // Betrag pro Rechnung
        betrag: d.gesamtbetrag ?? b.betrag,
        projekt_name: b.projekt_name,
        created_at: b.created_at,
        updated_at: b.updated_at,
        netto: d.netto ?? null,
        mwst: d.mwst ?? null,
        bestellungsart: (b.bestellungsart as "material" | "subunternehmer" | "abo") || "material",
        bestelldatum: b.bestelldatum,
        // Fälligkeit pro Rechnung (mit Fallback auf Bestellung)
        faelligkeitsdatum: d.faelligkeitsdatum ?? b.faelligkeitsdatum,
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
