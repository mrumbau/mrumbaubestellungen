import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analysiereDokument } from "@/lib/openai";

// POST /api/webhook/email – Empfängt E-Mail-Daten von Make.com
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email_betreff, email_absender, email_datum, anhaenge, secret } =
      body;

    // Secret prüfen
    if (secret !== process.env.MAKE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Händler anhand der Absender-E-Mail erkennen
    const { data: haendlerListe } = await supabase
      .from("haendler")
      .select("*");

    const haendler = haendlerListe?.find((h) =>
      h.email_absender?.some(
        (addr: string) =>
          email_absender?.toLowerCase().includes(addr.toLowerCase())
      )
    );

    const haendlerDomain = haendler?.domain || extractDomain(email_absender);

    // Signal suchen: gleicher Händler, innerhalb ±60 Minuten
    const zeitFensterStart = new Date(
      new Date(email_datum || Date.now()).getTime() - 60 * 60 * 1000
    ).toISOString();
    const zeitFensterEnde = new Date(
      new Date(email_datum || Date.now()).getTime() + 60 * 60 * 1000
    ).toISOString();

    const { data: signale } = await supabase
      .from("bestellung_signale")
      .select("*")
      .eq("haendler_domain", haendlerDomain)
      .eq("verarbeitet", false)
      .gte("zeitstempel", zeitFensterStart)
      .lte("zeitstempel", zeitFensterEnde)
      .order("zeitstempel", { ascending: false })
      .limit(1);

    const signal = signale?.[0];
    let bestellerKuerzel = signal?.kuerzel || "UNBEKANNT";

    // Besteller-Name holen
    const { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name")
      .eq("kuerzel", bestellerKuerzel)
      .single();

    // Anhänge verarbeiten
    const ergebnisse = [];
    for (const anhang of anhaenge || []) {
      const { base64, mime_type, name: dateiName } = anhang;

      // Dokument mit GPT-4o analysieren
      const analyse = await analysiereDokument(base64, mime_type);
      ergebnisse.push({ analyse, dateiName, base64, mime_type });
    }

    // Bestehende Bestellung suchen oder neue anlegen
    let bestellungId: string;

    // Versuche über Bestellnummer zu matchen
    const erkannteBestellnummer = ergebnisse.find(
      (e) => e.analyse.bestellnummer
    )?.analyse.bestellnummer;

    const { data: existierendeBestellung } = erkannteBestellnummer
      ? await supabase
          .from("bestellungen")
          .select("id")
          .eq("bestellnummer", erkannteBestellnummer)
          .single()
      : { data: null };

    if (existierendeBestellung) {
      bestellungId = existierendeBestellung.id;
    } else {
      // Prüfe ob eine "erwartet"-Bestellung vom Signal existiert
      const { data: erwartet } = signal
        ? await supabase
            .from("bestellungen")
            .select("id")
            .eq("besteller_kuerzel", bestellerKuerzel)
            .eq("status", "erwartet")
            .eq(
              "haendler_name",
              haendler?.name || haendlerDomain
            )
            .order("created_at", { ascending: false })
            .limit(1)
        : { data: null };

      if (erwartet?.[0]) {
        bestellungId = erwartet[0].id;
      } else {
        // Neue Bestellung anlegen
        const { data: neue } = await supabase
          .from("bestellungen")
          .insert({
            bestellnummer: erkannteBestellnummer,
            haendler_id: haendler?.id || null,
            haendler_name: haendler?.name || haendlerDomain,
            besteller_kuerzel: bestellerKuerzel,
            besteller_name: benutzer?.name || bestellerKuerzel,
            status: "offen",
          })
          .select()
          .single();
        bestellungId = neue!.id;
      }
    }

    // Dokumente speichern
    for (const ergebnis of ergebnisse) {
      const { analyse, dateiName, base64, mime_type } = ergebnis;

      // PDF in Supabase Storage hochladen
      const storagePfad = `${bestellungId}/${analyse.typ}_${dateiName}`;
      const buffer = Buffer.from(base64, "base64");
      await supabase.storage
        .from("dokumente")
        .upload(storagePfad, buffer, { contentType: mime_type });

      // Dokument in DB speichern
      await supabase.from("dokumente").insert({
        bestellung_id: bestellungId,
        typ: analyse.typ,
        quelle: "email",
        storage_pfad: storagePfad,
        email_betreff,
        email_absender,
        email_datum,
        ki_roh_daten: analyse,
        bestellnummer_erkannt: analyse.bestellnummer,
        artikel: analyse.artikel,
        gesamtbetrag: analyse.gesamtbetrag,
        netto: analyse.netto,
        mwst: analyse.mwst,
        faelligkeitsdatum: analyse.faelligkeitsdatum,
        lieferdatum: analyse.lieferdatum,
        iban: analyse.iban,
      });

      // Bestellung aktualisieren
      const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (analyse.typ === "bestellbestaetigung") {
        updateFields.hat_bestellbestaetigung = true;
      } else if (analyse.typ === "lieferschein") {
        updateFields.hat_lieferschein = true;
      } else if (analyse.typ === "rechnung") {
        updateFields.hat_rechnung = true;
      }

      if (analyse.bestellnummer) {
        updateFields.bestellnummer = analyse.bestellnummer;
      }
      if (analyse.gesamtbetrag) {
        updateFields.betrag = analyse.gesamtbetrag;
      }

      await supabase
        .from("bestellungen")
        .update(updateFields)
        .eq("id", bestellungId);
    }

    // Status aktualisieren
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("hat_bestellbestaetigung, hat_lieferschein, hat_rechnung")
      .eq("id", bestellungId)
      .single();

    let neuerStatus = "offen";
    if (
      bestellung?.hat_bestellbestaetigung &&
      bestellung?.hat_lieferschein &&
      bestellung?.hat_rechnung
    ) {
      neuerStatus = "vollstaendig";
    }

    await supabase
      .from("bestellungen")
      .update({ status: neuerStatus })
      .eq("id", bestellungId);

    // Signal als verarbeitet markieren
    if (signal) {
      await supabase
        .from("bestellung_signale")
        .update({ verarbeitet: true })
        .eq("id", signal.id);
    }

    return NextResponse.json({ success: true, bestellung_id: bestellungId });
  } catch (err) {
    console.error("Webhook email error:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

function extractDomain(email: string): string {
  const match = email?.match(/@([^>]+)/);
  return match ? match[1] : "unbekannt";
}
