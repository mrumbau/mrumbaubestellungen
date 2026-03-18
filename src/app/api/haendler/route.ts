import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidDomain, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// GET /api/haendler – Alle Händler laden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { data: haendler, error } = await supabase
      .from("haendler")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Händler Fehler:", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ haendler: haendler || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/haendler – Neuen Händler anlegen
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { name, domain, url_muster, email_absender } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: "Name und Domain sind Pflichtfelder" }, { status: 400 });
    }

    if (!validateTextLength(name, 200)) {
      return NextResponse.json({ error: "Name zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("haendler")
      .insert({
        name,
        domain,
        url_muster: url_muster || [],
        email_absender: email_absender || [],
      })
      .select()
      .single();

    if (error) {
      console.error("Händler Fehler:", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ haendler: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
