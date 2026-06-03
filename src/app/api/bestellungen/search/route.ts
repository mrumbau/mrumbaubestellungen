import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ERRORS } from "@/lib/errors";

/**
 * GET /api/bestellungen/search?q=...
 *
 * Cross-Lane-Search-Endpoint (UX-R2, 03.06.2026). Sucht über Bestellnummer,
 * Händler-Name, Projekt-Name. RLS filtert automatisch nach Rolle, das
 * Ergebnis enthält pro Treffer einen `lane`-Hint (pool / in-arbeit / archiv)
 * für die Render-Markierung im CmdK-Modal.
 *
 * Limit hard auf 20 (Cmd+K ist Triage, nicht Datenexport). Reihenfolge:
 * created_at DESC (neuste zuerst).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const { data, error } = await supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, auftragsnummer, haendler_name, besteller_kuerzel, besteller_name, bestellungsart, status, betrag, waehrung, projekt_name, mahnung_am, created_at",
      )
      .is("archiviert_am", null)
      .or(
        `bestellnummer.ilike.${pattern},haendler_name.ilike.${pattern},projekt_name.ilike.${pattern},auftragsnummer.ilike.${pattern}`,
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    // Pro Treffer Lane-Hint berechnen (matches Lane-Loader-Logik).
    type Row = {
      id: string;
      bestellnummer: string | null;
      auftragsnummer: string | null;
      haendler_name: string | null;
      besteller_kuerzel: string;
      besteller_name: string | null;
      bestellungsart: string | null;
      status: string;
      betrag: number | null;
      waehrung: string | null;
      projekt_name: string | null;
      mahnung_am: string | null;
      created_at: string;
    };

    const TERMINAL = new Set(["freigegeben", "verworfen", "storniert"]);
    const results = ((data || []) as Row[]).map((r) => {
      let lane: "pool" | "in-arbeit" | "archiv" = "in-arbeit";
      if (r.besteller_kuerzel === "UNBEKANNT" && (r.bestellungsart ?? "material") === "material") {
        lane = "pool";
      } else if (TERMINAL.has(r.status)) {
        lane = "archiv";
      }
      return { ...r, lane };
    });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
