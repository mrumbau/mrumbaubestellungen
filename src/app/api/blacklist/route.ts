import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

// GET /api/blacklist – Alle Blacklist-Einträge laden
export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("email_blacklist")
      .select("id, muster, typ, grund, erstellt_am")
      .order("erstellt_am", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Blacklist konnte nicht geladen werden" }, { status: 500 });
    }

    return NextResponse.json({ blacklist: data || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/blacklist – Absender-Domain oder -Adresse blockieren
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { muster, typ, grund } = body;

    if (!muster || typeof muster !== "string" || muster.trim().length < 3) {
      return NextResponse.json({ error: "Ungültiges Muster" }, { status: 400 });
    }

    if (typ && !["domain", "adresse"].includes(typ)) {
      return NextResponse.json({ error: "Typ muss 'domain' oder 'adresse' sein" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("email_blacklist")
      .upsert(
        { muster: muster.trim().toLowerCase(), typ: typ || "domain", grund: grund || null },
        { onConflict: "muster" }
      );

    if (error) {
      return NextResponse.json({ error: "Blacklist-Eintrag fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/blacklist – Blacklist-Eintrag entfernen
export async function DELETE(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { muster } = body;

    if (!muster || typeof muster !== "string") {
      return NextResponse.json({ error: "Muster erforderlich" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("email_blacklist")
      .delete()
      .eq("muster", muster.trim().toLowerCase());

    if (error) {
      return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
