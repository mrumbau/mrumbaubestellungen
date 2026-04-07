import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidDomain, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";

// GET /api/abo-anbieter – Alle Abo-Anbieter laden
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

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("abo_anbieter")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      logError("/api/abo-anbieter", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ abo_anbieter: data || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/abo-anbieter – Neuen Abo-Anbieter anlegen
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

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { name, domain, email_absender, notizen, intervall, erwarteter_betrag, toleranz_prozent, naechste_rechnung, vertragsbeginn, vertragsende, kuendigungsfrist_tage } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: "Name und Domain sind Pflichtfelder" }, { status: 400 });
    }

    if (!validateTextLength(name, 200)) {
      return NextResponse.json({ error: "Name zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const erlaubteIntervalle = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
    if (intervall && !erlaubteIntervalle.includes(intervall)) {
      return NextResponse.json({ error: "Ungültiges Intervall" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("abo_anbieter")
      .insert({
        name,
        domain,
        email_absender: email_absender || [],
        notizen: notizen || null,
        intervall: intervall || "monatlich",
        erwarteter_betrag: erwarteter_betrag || null,
        toleranz_prozent: toleranz_prozent ?? 10,
        naechste_rechnung: naechste_rechnung || null,
        vertragsbeginn: vertragsbeginn || null,
        vertragsende: vertragsende || null,
        kuendigungsfrist_tage: kuendigungsfrist_tage || null,
      })
      .select()
      .single();

    if (error) {
      logError("/api/abo-anbieter", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ abo_anbieter: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
