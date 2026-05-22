"use server";

// 22.05.2026 (Perf Stufe 4 / Item 6 — POC) — Server Action für Freigabe.
// Ersetzt den HTTP-Roundtrip via fetch() in handleFreigabe durch einen direkten
// Server-Call. Spart ~150-300ms (kein HTTP-Layer, kein JSON-Parsing-Roundtrip,
// kein checkCsrf — Next.js 16 hat Server-Actions-CSRF via Origin-Check built-in).
//
// Die HTTP-Route /api/bestellungen/[id]/freigeben bleibt parallel bestehen für
// externe Caller (Make.com, etc.). Beide Pfade nutzen denselben RPC
// `freigeben_bestellung` — Logik bleibt single-source.

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logger";

type FreigabenResult = { success: true } | { success: false; error: string; code?: number };

export async function freigebenBestellung(
  bestellungId: string,
  kommentar?: string,
): Promise<FreigabenResult> {
  if (!isValidUUID(bestellungId)) {
    return { success: false, error: "Ungültige Bestellungs-ID", code: 400 };
  }

  const profil = await getBenutzerProfil();
  if (!profil) {
    return { success: false, error: "Nicht authentifiziert", code: 401 };
  }
  if (profil.rolle !== "admin" && profil.rolle !== "besteller") {
    return { success: false, error: "Keine Berechtigung", code: 403 };
  }

  const supabase = await createServerSupabaseClient();

  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("*")
    .eq("id", bestellungId)
    .single();

  if (!bestellung) {
    return { success: false, error: "Bestellung nicht gefunden", code: 404 };
  }

  const istSuOderAbo =
    bestellung.bestellungsart === "subunternehmer" || bestellung.bestellungsart === "abo";
  if (
    profil.rolle !== "admin" &&
    bestellung.besteller_kuerzel !== profil.kuerzel &&
    !istSuOderAbo
  ) {
    return { success: false, error: "Keine Berechtigung", code: 403 };
  }

  if (bestellung.status === "freigegeben") {
    return { success: false, error: "Bestellung wurde bereits freigegeben", code: 409 };
  }

  if (bestellung.ist_gutschrift === true) {
    return {
      success: false,
      error: "Gutschriften benötigen keine Freigabe — sind automatisch in der Buchhaltung sichtbar.",
      code: 400,
    };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc("freigeben_bestellung", {
    p_bestellung_id: bestellungId,
    p_kuerzel: profil.kuerzel,
    p_name: profil.name,
    p_kommentar: kommentar,
  });

  if (rpcError) {
    logError("action:freigebenBestellung", "Freigabe-RPC fehlgeschlagen", rpcError);
    return { success: false, error: "Freigabe konnte nicht durchgeführt werden", code: 500 };
  }

  const r = rpcResult as
    | { success?: boolean; error?: string; freigabe_id?: string; duplicate?: boolean }
    | null;
  if (r?.success === false) {
    if (r.error === "bereits_freigegeben") {
      return { success: false, error: "Bestellung wurde bereits freigegeben", code: 409 };
    }
    logError("action:freigebenBestellung", "Freigabe-RPC Fehler", r);
    return { success: false, error: "Freigabe fehlgeschlagen", code: 500 };
  }

  // Audit-Kommentar in kommentare-Stream (siehe HTTP-Route-Comment für Wurzel).
  // Failure hier darf den Success-Pfad nicht killen.
  const auditText = kommentar
    ? `Bestellung freigegeben — Kommentar: ${String(kommentar).replace(/[<>"&']/g, "").slice(0, 500)}`
    : `Bestellung freigegeben`;
  try {
    const { error: kommentarErr } = await supabase.from("kommentare").insert({
      bestellung_id: bestellungId,
      autor_kuerzel: profil.kuerzel,
      autor_name: profil.name,
      text: auditText,
    });
    if (kommentarErr) {
      logError(
        "action:freigebenBestellung",
        "Audit-Kommentar fehlgeschlagen (Freigabe selbst OK)",
        kommentarErr,
      );
    }
  } catch (kommentarErr) {
    logError(
      "action:freigebenBestellung",
      "Audit-Kommentar throw (Freigabe selbst OK)",
      kommentarErr,
    );
  }

  return { success: true };
}
