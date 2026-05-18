import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

// POST /api/bestellungen/[id]/freigeben – Rechnung freigeben
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    // R3b: Defense-in-Depth — Buchhaltung explizit ausschließen.
    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;
    const { profil } = auth;

    const body = await request.json().catch(() => ({}));
    const supabase = await createServerSupabaseClient();

    // Bestellung prüfen
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur Besteller der Bestellung oder Admin darf freigeben
    // SU/Abo: jeder Besteller darf freigeben (nicht an einen Besteller gebunden)
    const istSuOderAbo = bestellung.bestellungsart === "subunternehmer" || bestellung.bestellungsart === "abo";
    if (
      profil.rolle !== "admin" &&
      bestellung.besteller_kuerzel !== profil.kuerzel &&
      !istSuOderAbo
    ) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Bereits freigegeben? Duplikat verhindern
    if (bestellung.status === "freigegeben") {
      return NextResponse.json({ error: "Bestellung wurde bereits freigegeben" }, { status: 409 });
    }

    // 17.05.2026 — Gutschriften haben keinen Freigabe-Workflow. Sie sind
    // Rückerstattungen und werden direkt der Buchhaltung sichtbar gemacht.
    // Defense-in-Depth gegen versehentliche Direct-Calls (UI versteckt den
    // Button schon, aber API-Layer darf darauf nicht vertrauen).
    if (bestellung.ist_gutschrift === true) {
      return NextResponse.json(
        { error: "Gutschriften benötigen keine Freigabe — sind automatisch in der Buchhaltung sichtbar." },
        { status: 400 },
      );
    }

    // Atomare Freigabe via RPC: Status-Update + Freigabe-Insert in einer Transaktion.
    // Unique Constraint auf freigaben(bestellung_id) verhindert Duplikate bei Doppelklick.
    const { data: rpcResult, error: rpcError } = await supabase.rpc("freigeben_bestellung", {
      p_bestellung_id: id,
      p_kuerzel: profil.kuerzel,
      p_name: profil.name,
      p_kommentar: body.kommentar || null,
    });

    if (rpcError) {
      logError("/api/bestellungen/[id]/freigeben", "Freigabe-RPC fehlgeschlagen", rpcError);
      return NextResponse.json({ error: "Freigabe konnte nicht durchgeführt werden" }, { status: 500 });
    }

    // RPC-Return ist Json — wir wissen das Shape (success, error, freigabe_id, duplicate)
    const r = rpcResult as { success?: boolean; error?: string; freigabe_id?: string; duplicate?: boolean } | null;
    if (r?.success === false) {
      if (r.error === "bereits_freigegeben") {
        return NextResponse.json({ error: "Bestellung wurde bereits freigegeben" }, { status: 409 });
      }
      logError("/api/bestellungen/[id]/freigeben", "Freigabe-RPC Fehler", r);
      return NextResponse.json({ error: "Freigabe fehlgeschlagen" }, { status: 500 });
    }

    // F5.3: Audit-Kommentar in kommentare-Stream (zusätzlich zur freigaben-Tabelle).
    // Dadurch sehen User in der Bestelldetail-Ansicht WER WANN freigegeben hat,
    // ohne den freigaben-Tab öffnen zu müssen.
    //
    // 12.05.2026 (Freigabe-Bug-Wurzel): kommentare-INSERT war im Erfolgs-Pfad
    // ungeschützt — wenn er throws (RLS, NOT-NULL, network), bubbled in den
    // catch-Block und schickte 500 obwohl die Freigabe BEREITS committed war.
    // User klickt erneut → 409. Genau das User-Symptom: "fehlschlägt". Jetzt:
    // try/catch um den Audit-INSERT, Fehler nur loggen, success trotzdem.
    const auditText = body.kommentar
      ? `Bestellung freigegeben — Kommentar: ${String(body.kommentar).replace(/[<>"&']/g, "").slice(0, 500)}`
      : `Bestellung freigegeben`;
    try {
      const { error: kommentarErr } = await supabase.from("kommentare").insert({
        bestellung_id: id,
        autor_kuerzel: profil.kuerzel,
        autor_name: profil.name,
        text: auditText,
      });
      if (kommentarErr) {
        logError("/api/bestellungen/[id]/freigeben", "Audit-Kommentar fehlgeschlagen (Freigabe selbst OK)", kommentarErr);
      }
    } catch (kommentarErr) {
      logError("/api/bestellungen/[id]/freigeben", "Audit-Kommentar throw (Freigabe selbst OK)", kommentarErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/bestellungen/[id]/freigeben", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
