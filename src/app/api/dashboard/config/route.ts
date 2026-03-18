import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// PUT /api/dashboard/config – Dashboard-Konfiguration speichern
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

    const body = await request.json();
    const { stats, widgets } = body;

    // Validate structure
    if (typeof stats !== "object" || typeof widgets !== "object") {
      return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
    }

    // Only allow boolean values
    const cleanStats: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(stats)) {
      if (typeof val === "boolean") cleanStats[key] = val;
    }
    const cleanWidgets: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(widgets)) {
      if (typeof val === "boolean") cleanWidgets[key] = val;
    }

    const config = { stats: cleanStats, widgets: cleanWidgets };

    const { error } = await supabase
      .from("benutzer_rollen")
      .update({ dashboard_config: config })
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
