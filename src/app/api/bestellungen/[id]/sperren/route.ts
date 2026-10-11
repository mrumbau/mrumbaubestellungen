/**
 * POST   /api/bestellungen/[id]/sperren  — Rechnung sperren, Grund Pflicht
 * DELETE /api/bestellungen/[id]/sperren  — Sperre aufheben
 *
 * 11.10.2026 — Regeln und Warum in `lib/sperre.ts`. Schreibt mit dem
 * Service-Client, weil die Buchhaltung sperren darf, aber laut RLS keine
 * Bestellungen aendert; die Rechte prueft diese Route selbst.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";
import {
  bereinigeSperrgrund,
  darfEntsperren,
  darfSperren,
  SPERRGRUND_MIN,
  sperrText,
} from "@/lib/sperre";

const ROUTE = "/api/bestellungen/[id]/sperren";

type Ctx = { params: Promise<{ id: string }> };

const BESTELLUNG_SELECT =
  "id, besteller_kuerzel, bestellungsart, gesperrt_am, gesperrt_von, sperrgrund";

async function ladeBestellung(id: string) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("bestellungen")
    .select(BESTELLUNG_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return { sb, bestellung: data };
}

/** Der Kommentar-Stream ist die sichtbare Spur; sein Scheitern bricht nichts ab. */
async function auditKommentar(
  sb: ReturnType<typeof createServiceClient>,
  bestellungId: string,
  profil: { kuerzel: string; name: string },
  text: string,
) {
  try {
    const { error } = await sb.from("kommentare").insert({
      bestellung_id: bestellungId,
      autor_kuerzel: profil.kuerzel,
      autor_name: profil.name,
      text,
    });
    if (error) logError(ROUTE, "Audit-Kommentar fehlgeschlagen (Sperre selbst OK)", error);
  } catch (err) {
    logError(ROUTE, "Audit-Kommentar throw (Sperre selbst OK)", err);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { profil } = auth;

    const body = await request.json().catch(() => ({}));
    const grund = bereinigeSperrgrund(body?.grund);
    if (!grund) {
      return NextResponse.json(
        { error: `Bitte einen Grund angeben (mindestens ${SPERRGRUND_MIN} Zeichen).` },
        { status: 400 },
      );
    }

    const { sb, bestellung } = await ladeBestellung(id);
    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }
    if (!darfSperren(profil, bestellung)) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }
    if (bestellung.gesperrt_am) {
      return NextResponse.json(
        { error: `Bereits gesperrt — ${sperrText(bestellung)}`, gesperrt_am: bestellung.gesperrt_am },
        { status: 409 },
      );
    }

    const jetzt = new Date().toISOString();
    const { error: updErr } = await sb
      .from("bestellungen")
      .update({ gesperrt_am: jetzt, gesperrt_von: profil.kuerzel, sperrgrund: grund, updated_at: jetzt })
      .eq("id", id)
      .is("gesperrt_am", null);
    if (updErr) {
      logError(ROUTE, "Sperren fehlgeschlagen", updErr);
      return NextResponse.json({ error: "Sperre konnte nicht gesetzt werden" }, { status: 500 });
    }

    await auditKommentar(sb, id, profil, `Rechnung gesperrt — Grund: ${grund}`);

    return NextResponse.json({
      success: true,
      gesperrt_am: jetzt,
      gesperrt_von: profil.kuerzel,
      sperrgrund: grund,
    });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler (POST)", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { profil } = auth;

    const { sb, bestellung } = await ladeBestellung(id);
    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }
    if (!bestellung.gesperrt_am) {
      return NextResponse.json({ success: true, already: true });
    }
    if (!darfEntsperren(profil, bestellung)) {
      return NextResponse.json(
        { error: `Nur ${bestellung.gesperrt_von ?? "der Urheber"} oder die Geschäftsführung kann die Sperre aufheben.` },
        { status: 403 },
      );
    }

    const { error: updErr } = await sb
      .from("bestellungen")
      .update({ gesperrt_am: null, gesperrt_von: null, sperrgrund: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      logError(ROUTE, "Entsperren fehlgeschlagen", updErr);
      return NextResponse.json({ error: "Sperre konnte nicht aufgehoben werden" }, { status: 500 });
    }

    await auditKommentar(
      sb,
      id,
      profil,
      `Sperre aufgehoben (gesetzt von ${bestellung.gesperrt_von ?? "?"}: ${bestellung.sperrgrund ?? "ohne Grund"})`,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler (DELETE)", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
