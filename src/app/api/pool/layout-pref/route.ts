import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

/**
 * PUT /api/pool/layout-pref — User-Layout-Präferenz für Pool-Scope.
 *
 * Pool-2.0 Sprint 2 (03.06.2026): Tabelle vs Inbox-Feed. Speichert
 * `pool_layout` in `benutzer_rollen.dashboard_config` und invalidiert
 * das Profil-Cache-Cookie damit die Server-Page beim nächsten Request
 * frisch lädt.
 *
 * Body: { layout: "inbox" | "table" }
 */
const BodySchema = z.object({
  layout: z.enum(["inbox", "table"]),
});

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

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
    }

    const { data: row } = await supabase
      .from("benutzer_rollen")
      .select("dashboard_config")
      .eq("user_id", user.id)
      .maybeSingle();

    const existing = (row?.dashboard_config as Record<string, unknown> | null) ?? {};
    const merged = { ...existing, pool_layout: body.layout };

    const { error } = await supabase
      .from("benutzer_rollen")
      .update({ dashboard_config: merged })
      .eq("user_id", user.id);

    if (error) {
      logError("/api/pool/layout-pref", "DB-Update fehlgeschlagen", error);
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    const response = NextResponse.json({ success: true, layout: body.layout });
    response.cookies.set("mr_profil_cache", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    logError("/api/pool/layout-pref", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
