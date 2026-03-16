import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { analysiereDokument, fuehreAbgleichDurch } from "@/lib/openai";
import { isValidUUID, isAllowedMimeType, isFileSizeOk, sanitizeFilename } from "@/lib/validation";

// POST /api/scan – Foto/PDF hochladen und per GPT-4o analysieren
export async function POST(request: NextRequest) {
  try {
    // Auth-Check
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

    // Input-Validierung
    if (!isValidUUID(bestellung_id)) {
      return NextResponse.json({ error: "Ungültiges bestellung_id Format" }, { status: 400 });
    }

    if (!isAllowedMimeType(mime_type)) {
      return NextResponse.json(
        { error: "Nur PDF, JPEG, PNG und WebP Dateien erlaubt" },
        { status: 400 }
      );
    }

    if (!isFileSizeOk(base64)) {
      return NextResponse.json(
        { error: "Datei zu groß (max. 4 MB)" },
        { status: 413 }
      );
    }

    const supabase = createServiceClient();

    // Besitzer-Prüfung: Nur eigene Bestellungen oder Admin
    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("kuerzel, rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: "Kein Profil" }, { status: 403 });
    }

    const { data: bestellungCheck } = await supabase
      .from("bestellungen")
      .select("besteller_kuerzel")
      .eq("id", bestellung_id)
      .single();

    if (!bestellungCheck) {
      return NextResponse.json({ error: "Bestellung nicht gefunden" }, { status: 404 });
    }

    if (profil.rolle !== "admin" && bestellungCheck.besteller_kuerzel !== profil.kuerzel) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Bestellung" }, { status: 403 });
    }

    // GPT-4o Analyse
    let analyse;
    try {
      analyse = await analysiereDokument(base64, mime_type);
    } catch (err) {
      console.error("OpenAI Analyse-Fehler:", err);
      return NextResponse.json(
        { error: "KI-Analyse fehlgeschlagen. Bitte erneut versuchen." },
        { status: 502 }
      );
    }

    // Datei in Storage hochladen (Dateinamen sanitizen)
    const safeName = sanitizeFilename(datei_name || "dokument");
    const storagePfad = `${bestellung_id}/scan_${Date.now()}_${safeName}`;
    const buffer = Buffer.from(base64, "base64");
    const { error: uploadError } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: mime_type, upsert: true });

    if (uploadError) {
      console.error("Storage Upload-Fehler:", uploadError);
      // Weiter ohne Storage – Dokument trotzdem in DB speichern
    }

    // Dokument in DB speichern
    const { data: dokument, error: dokError } = await supabase
      .from("dokumente")
      .insert({
        bestellung_id,
        typ: analyse.typ,
        quelle: mime_type.startsWith("image/") ? "scan_foto" : "scan_upload",
        storage_pfad: uploadError ? null : storagePfad,
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
      console.error("Dokument DB-Fehler:", dokError);
      return NextResponse.json({ error: "Dokument konnte nicht gespeichert werden" }, { status: 500 });
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
      try {
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
      } catch (err) {
        console.error("KI-Abgleich Fehler:", err);
      }
    }

    return NextResponse.json({
      success: true,
      dokument_id: dokument.id,
      analyse,
    });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
