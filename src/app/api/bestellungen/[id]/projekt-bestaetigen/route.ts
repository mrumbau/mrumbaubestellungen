import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { aktualisiereBestellerAffinitaet } from "@/lib/openai";

// POST /api/bestellungen/[id]/projekt-bestaetigen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: "Ungültiger Ursprung" }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Ungültiges ID Format" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json();
    const { aktion, korrektes_projekt_id } = body;

    if (!["bestaetigen", "ablehnen"].includes(aktion)) {
      return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
    }

    // Bestellung laden
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("id, projekt_vorschlag_id, projekt_vorschlag_konfidenz, projekt_vorschlag_methode, projekt_vorschlag_begruendung, lieferadresse_erkannt")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: "Bestellung nicht gefunden" }, { status: 404 });
    }

    if (aktion === "bestaetigen") {
      // Vorschlag übernehmen
      if (!bestellung.projekt_vorschlag_id) {
        return NextResponse.json({ error: "Kein Vorschlag vorhanden" }, { status: 400 });
      }

      // Projekt-Name laden
      const { data: projekt } = await supabase
        .from("projekte")
        .select("id, name, adresse_keywords")
        .eq("id", bestellung.projekt_vorschlag_id)
        .single();

      if (!projekt) {
        return NextResponse.json({ error: "Vorgeschlagenes Projekt nicht gefunden" }, { status: 404 });
      }

      await supabase
        .from("bestellungen")
        .update({
          projekt_id: projekt.id,
          projekt_name: projekt.name,
          projekt_bestaetigt: true,
          projekt_vorschlag_id: null,
          projekt_vorschlag_konfidenz: null,
          projekt_vorschlag_methode: null,
          projekt_vorschlag_begruendung: null,
        })
        .eq("id", id);

      // Self-Learning: Keywords aus erkannter Lieferadresse zu Projekt hinzufügen
      if (bestellung.lieferadresse_erkannt) {
        const bestehendeKeywords: string[] = projekt.adresse_keywords || [];
        const neueKeywords = bestellung.lieferadresse_erkannt.toLowerCase().split(/[\s,]+/).filter(Boolean);
        const hinzuzufuegen = neueKeywords.filter((k: string) => !bestehendeKeywords.includes(k));
        if (hinzuzufuegen.length > 0) {
          await supabase
            .from("projekte")
            .update({ adresse_keywords: [...bestehendeKeywords, ...hinzuzufuegen].slice(0, 50) })
            .eq("id", projekt.id);
        }
      }

      // Besteller-Affinität aktualisieren
      await aktualisiereBestellerAffinitaet(supabase, projekt.id);

      return NextResponse.json({ success: true, projekt_id: projekt.id, projekt_name: projekt.name });
    }

    // Ablehnen
    if (korrektes_projekt_id) {
      if (!isValidUUID(korrektes_projekt_id)) {
        return NextResponse.json({ error: "Ungültiges Projekt-ID Format" }, { status: 400 });
      }

      // Korrektes Projekt laden
      const { data: korrProjekt } = await supabase
        .from("projekte")
        .select("id, name, adresse_keywords")
        .eq("id", korrektes_projekt_id)
        .single();

      if (!korrProjekt) {
        return NextResponse.json({ error: "Korrektes Projekt nicht gefunden" }, { status: 404 });
      }

      await supabase
        .from("bestellungen")
        .update({
          projekt_id: korrProjekt.id,
          projekt_name: korrProjekt.name,
          projekt_bestaetigt: true,
          projekt_vorschlag_id: null,
          projekt_vorschlag_konfidenz: null,
          projekt_vorschlag_methode: null,
          projekt_vorschlag_begruendung: null,
        })
        .eq("id", id);

      // Self-Learning: Keywords aus erkannter Lieferadresse hinzufügen
      if (bestellung.lieferadresse_erkannt) {
        const bestehendeKeywords: string[] = korrProjekt.adresse_keywords || [];
        const neueKeywords = bestellung.lieferadresse_erkannt.toLowerCase().split(/[\s,]+/).filter(Boolean);
        const hinzuzufuegen = neueKeywords.filter((k: string) => !bestehendeKeywords.includes(k));
        if (hinzuzufuegen.length > 0) {
          await supabase
            .from("projekte")
            .update({ adresse_keywords: [...bestehendeKeywords, ...hinzuzufuegen].slice(0, 50) })
            .eq("id", korrProjekt.id);
        }
      }

      await aktualisiereBestellerAffinitaet(supabase, korrProjekt.id);

      return NextResponse.json({ success: true, projekt_id: korrProjekt.id, projekt_name: korrProjekt.name });
    }

    // Ablehnen ohne Korrektur
    await supabase
      .from("bestellungen")
      .update({
        projekt_vorschlag_id: null,
        projekt_vorschlag_konfidenz: null,
        projekt_vorschlag_methode: null,
        projekt_vorschlag_begruendung: null,
        projekt_bestaetigt: false,
      })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
