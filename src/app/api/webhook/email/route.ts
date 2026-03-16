import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analysiereDokument, erkenneBestellerIntelligent, erkenneHaendlerAusEmail, pruefePreisanomalien } from "@/lib/openai";

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
    let bestellerKuerzel = signal?.kuerzel || "";

    // Anhänge verarbeiten
    const ergebnisse = [];
    for (const anhang of anhaenge || []) {
      const { base64, mime_type, name: dateiName } = anhang;
      const analyse = await analysiereDokument(base64, mime_type);
      ergebnisse.push({ analyse, dateiName, base64, mime_type });
    }

    // === FEATURE 1: Intelligente Besteller-Erkennung ===
    if (!bestellerKuerzel && ergebnisse.length > 0) {
      try {
        const artikelAusEmail = ergebnisse
          .flatMap((e) => e.analyse.artikel || [])
          .map((a) => ({ name: a.name, menge: a.menge, einzelpreis: a.einzelpreis }));

        // Bestellhistorie pro Besteller laden
        const { data: benutzerListe } = await supabase
          .from("benutzer_rollen")
          .select("kuerzel, name")
          .eq("rolle", "besteller");

        const bestellerHistorie = [];
        for (const benutzer of benutzerListe || []) {
          const { data: bisherigeDokumente } = await supabase
            .from("dokumente")
            .select("artikel, bestellung_id")
            .limit(20);

          // Bestellungen dieses Bestellers finden
          const { data: bestellungen } = await supabase
            .from("bestellungen")
            .select("id, haendler_name")
            .eq("besteller_kuerzel", benutzer.kuerzel)
            .limit(30);

          const bestellIds = new Set((bestellungen || []).map((b) => b.id));
          const artikelNamen = (bisherigeDokumente || [])
            .filter((d) => bestellIds.has(d.bestellung_id))
            .flatMap((d) => {
              const art = d.artikel as { name: string }[] | null;
              return art ? art.map((a) => a.name) : [];
            });

          const haendlerNamen = [...new Set((bestellungen || []).map((b) => b.haendler_name).filter(Boolean))] as string[];

          bestellerHistorie.push({
            kuerzel: benutzer.kuerzel,
            name: benutzer.name,
            artikel_namen: artikelNamen,
            haendler: haendlerNamen,
          });
        }

        if (bestellerHistorie.length > 0 && artikelAusEmail.length > 0) {
          const erkennung = await erkenneBestellerIntelligent(
            artikelAusEmail,
            haendler?.name || haendlerDomain,
            bestellerHistorie
          );

          if (erkennung.kuerzel !== "UNBEKANNT" && erkennung.konfidenz >= 0.5) {
            bestellerKuerzel = erkennung.kuerzel;
            console.log(`KI-Besteller-Erkennung: ${erkennung.kuerzel} (${erkennung.konfidenz}) – ${erkennung.begruendung}`);
          }
        }
      } catch (err) {
        console.error("KI-Besteller-Erkennung fehlgeschlagen:", err);
      }
    }

    // Fallback wenn immer noch unbekannt
    if (!bestellerKuerzel) {
      bestellerKuerzel = "UNBEKANNT";
    }

    // Besteller-Name holen
    const { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name")
      .eq("kuerzel", bestellerKuerzel)
      .single();

    // === FEATURE 4: Automatische Händler-Erkennung ===
    if (!haendler && ergebnisse.length > 0) {
      try {
        const erkannterHaendlerName = ergebnisse.find((e) => e.analyse.haendler)?.analyse.haendler || null;
        const neuerHaendler = await erkenneHaendlerAusEmail(
          email_absender,
          email_betreff,
          erkannterHaendlerName
        );

        if (neuerHaendler) {
          // Prüfe ob Domain schon existiert
          const { data: existing } = await supabase
            .from("haendler")
            .select("id")
            .eq("domain", neuerHaendler.domain)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("haendler").insert({
              name: neuerHaendler.name,
              domain: neuerHaendler.domain,
              email_absender: [neuerHaendler.email_muster],
              url_muster: [],
            });
            console.log(`Neuer Händler automatisch erkannt: ${neuerHaendler.name} (${neuerHaendler.domain})`);
          }
        }
      } catch (err) {
        console.error("Automatische Händler-Erkennung fehlgeschlagen:", err);
      }
    }

    // Bestehende Bestellung suchen oder neue anlegen
    let bestellungId: string;

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

      const storagePfad = `${bestellungId}/${analyse.typ}_${dateiName}`;
      const buffer = Buffer.from(base64, "base64");
      await supabase.storage
        .from("dokumente")
        .upload(storagePfad, buffer, { contentType: mime_type });

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

    // === FEATURE 3: Anomalie-Erkennung bei Preisen ===
    const aktuelleArtikel = ergebnisse
      .flatMap((e) => e.analyse.artikel || [])
      .map((a) => ({ name: a.name, einzelpreis: a.einzelpreis, menge: a.menge }));

    if (aktuelleArtikel.length > 0) {
      try {
        // Historische Preise laden
        const { data: alleDokumente } = await supabase
          .from("dokumente")
          .select("artikel")
          .neq("bestellung_id", bestellungId)
          .not("artikel", "is", null)
          .limit(50);

        const preisMap = new Map<string, number[]>();
        for (const dok of alleDokumente || []) {
          const art = dok.artikel as { name: string; einzelpreis: number }[] | null;
          if (!art) continue;
          for (const a of art) {
            if (!a.name || !a.einzelpreis) continue;
            const key = a.name.toLowerCase();
            if (!preisMap.has(key)) preisMap.set(key, []);
            preisMap.get(key)!.push(a.einzelpreis);
          }
        }

        const historischePreise = aktuelleArtikel
          .map((a) => ({
            name: a.name,
            preise: preisMap.get(a.name.toLowerCase()) || [],
          }))
          .filter((h) => h.preise.length > 0);

        if (historischePreise.length > 0) {
          const anomalien = await pruefePreisanomalien(aktuelleArtikel, historischePreise);

          if (anomalien.hat_anomalie) {
            // Preiswarnung als Kommentar speichern
            await supabase.from("kommentare").insert({
              bestellung_id: bestellungId,
              autor_kuerzel: "KI",
              autor_name: "KI-Preisüberwachung",
              text: `Preiswarnung: ${anomalien.zusammenfassung}`,
            });
            console.log(`Preisanomalie erkannt bei ${bestellungId}: ${anomalien.zusammenfassung}`);
          }
        }
      } catch (err) {
        console.error("Preisanomalie-Prüfung fehlgeschlagen:", err);
      }
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
