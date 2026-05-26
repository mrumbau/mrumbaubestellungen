import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

/**
 * PUT /api/dashboard/visibility — Dashboard-Sichtbarkeit togglen.
 *
 * Speichert `dashboard_enabled` in `benutzer_rollen.dashboard_config`. Setzt
 * dann das Profil-Cookie auf 0 max-age, damit beim nächsten Request die
 * Middleware das Profil frisch aus der DB lädt (inkl. neuer Visibility).
 * Ohne Cookie-Reset würde der User noch bis zu 5 Min mit altem Wert leben.
 *
 * 22.05.2026.
 */
export async function PUT(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
    }
    const enabled: boolean = body.enabled;

    // Bestehende Config holen → enabled-Flag mergen → zurückschreiben.
    // Race-condition denkbar bei zwei Tabs gleichzeitig, aber bei einem Single-User-
    // Toggle-Setting akzeptabel (letzter Tab gewinnt).
    const { data: row } = await supabase
      .from("benutzer_rollen")
      .select("dashboard_config")
      .eq("user_id", user.id)
      .maybeSingle();

    const existing = (row?.dashboard_config as Record<string, unknown> | null) ?? {};
    const merged = { ...existing, dashboard_enabled: enabled };

    const { error } = await supabase
      .from("benutzer_rollen")
      .update({ dashboard_config: merged })
      .eq("user_id", user.id);

    if (error) {
      logError("/api/dashboard/visibility", "DB-Update fehlgeschlagen", error);
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    // Cookie invalidieren — nächste Middleware-Pass lädt frisch aus DB.
    const response = NextResponse.json({ success: true, enabled });
    response.cookies.set("mr_profil_cache", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    logError("/api/dashboard/visibility", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
