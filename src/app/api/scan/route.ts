import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { analysiereDokument, fuehreAbgleichDurch } from "@/lib/openai";

// POST /api/scan – Foto/PDF hochladen und per GPT-4o analysieren
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const { bestellung_id, base64, mime_type, datei_name } = body;

    if (!bestellung_id || !base64 || !mime_type) {
      return NextResponse.json(
        { error: "bestellung_id, base64 und mime_type erforderlich" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // GPT-4o Analyse
    const analyse = await analysiereDokument(base64, mime_type);

    // Datei in Storage hochladen
    const storagePfad = `${bestellung_id}/scan_${Date.now()}_${datei_name || "dokument"}`;
    const buffer = Buffer.from(base64, "base64");
    await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: mime_type });

    // Dokument in DB speichern
    const { data: dokument, error: dokError } = await supabase
      .from("dokumente")
      .insert({
        bestellung_id,
        typ: analyse.typ,
        quelle: mime_type.startsWith("image/") ? "scan_foto" : "scan_upload",
        storage_pfad: storagePfad,
        ki_roh_daten: analyse,
        bestellnummer_erkannt: analyse.bestellnummer,
        artikel: analyse.artikel,
        gesamtbetrag: analyse.gesamtbetrag,
        netto: analyse.netto,
        mwst: analyse.mwst,
        faelligkeitsdatum: analyse.faelligkeitsdatum,
        lieferdatum: analyse.lieferdatum,
        iban: analyse.iban,
      })
      .select()
      .single();

    if (dokError) {
      return NextResponse.json({ error: dokError.message }, { status: 500 });
    }

    // Bestellung aktualisieren
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (analyse.typ === "bestellbestaetigung") {
      updateFields.hat_bestellbestaetigung = true;
    } else if (analyse.typ === "lieferschein") {
      updateFields.hat_lieferschein = true;
      updateFields.lieferschein_physisch = true;
    } else if (analyse.typ === "rechnung") {
      updateFields.hat_rechnung = true;
    }

    await supabase
      .from("bestellungen")
      .update(updateFields)
      .eq("id", bestellung_id);

    // Prüfe ob alle Dokumente vorhanden → KI-Abgleich starten
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("hat_bestellbestaetigung, hat_lieferschein, hat_rechnung")
      .eq("id", bestellung_id)
      .single();

    if (
      bestellung?.hat_bestellbestaetigung &&
      bestellung?.hat_lieferschein &&
      bestellung?.hat_rechnung
    ) {
      // Alle Dokumente laden für Abgleich
      const { data: alleDokumente } = await supabase
        .from("dokumente")
        .select("typ, ki_roh_daten")
        .eq("bestellung_id", bestellung_id);

      const bb = alleDokumente?.find(
        (d) => d.typ === "bestellbestaetigung"
      )?.ki_roh_daten;
      const ls = alleDokumente?.find(
        (d) => d.typ === "lieferschein"
      )?.ki_roh_daten;
      const re = alleDokumente?.find(
        (d) => d.typ === "rechnung"
      )?.ki_roh_daten;

      const abgleich = await fuehreAbgleichDurch(bb, ls, re);

      await supabase.from("abgleiche").insert({
        bestellung_id,
        status: abgleich.status,
        abweichungen: abgleich.abweichungen,
        ki_zusammenfassung: abgleich.zusammenfassung,
      });

      const neuerStatus =
        abgleich.status === "ok" ? "vollstaendig" : "abweichung";
      await supabase
        .from("bestellungen")
        .update({ status: neuerStatus })
        .eq("id", bestellung_id);
    }

    return NextResponse.json({
      success: true,
      dokument_id: dokument.id,
      analyse,
    });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
