import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analysiereDokument, erkenneBestellerIntelligent, erkenneHaendlerAusEmail, pruefePreisanomalien, pruefeDuplikat, kategorisiereArtikel } from "@/lib/openai";
import { validateTextLength, isAllowedMimeType, isFileSizeOk } from "@/lib/validation";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { updateBestellungStatus } from "@/lib/bestellung-utils";
import { logError, logInfo } from "@/lib/logger";

// POST /api/webhook/email – Empfängt E-Mail-Daten von Make.com
export async function POST(request: NextRequest) {
  try {
    // Rate-Limiting: max 20 Requests/Minute pro IP
    const rlKey = getRateLimitKey(request, "webhook-email");
    const rl = checkRateLimit(rlKey, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { email_betreff, email_absender, email_datum, anhaenge, secret } =
      body;

    // Secret prüfen
    if (secret !== process.env.MAKE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Input-Validierung
    if (email_betreff && !validateTextLength(email_betreff, 500)) {
      return NextResponse.json({ error: "Betreff zu lang (max. 500 Zeichen)" }, { status: 400 });
    }

    if (anhaenge && Array.isArray(anhaenge)) {
      for (const anhang of anhaenge) {
        if (anhang.mime_type && !isAllowedMimeType(anhang.mime_type)) {
          return NextResponse.json(
            { error: `MIME-Typ nicht erlaubt: ${anhang.mime_type}` },
            { status: 400 }
          );
        }
        if (anhang.base64 && !isFileSizeOk(anhang.base64)) {
          return NextResponse.json(
            { error: "Anhang zu groß (max. 4 MB)" },
            { status: 413 }
          );
        }
      }
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
            logInfo("/api/webhook/email", `KI-Besteller-Erkennung: ${erkennung.kuerzel} (${erkennung.konfidenz})`, { begruendung: erkennung.begruendung });
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "KI-Besteller-Erkennung fehlgeschlagen", err);
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
            logInfo("/api/webhook/email", `Neuer Händler erkannt: ${neuerHaendler.name}`, { domain: neuerHaendler.domain });
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "Händler-Erkennung fehlgeschlagen", err);
      }
    }

    // Bestehende Bestellung suchen oder neue anlegen (Race-Condition-sicher)
    let bestellungId: string;

    const erkannteBestellnummer = ergebnisse.find(
      (e) => e.analyse.bestellnummer
    )?.analyse.bestellnummer;

    // 1. Suche per Bestellnummer
    let existierendeBestellung = null;
    if (erkannteBestellnummer) {
      const { data } = await supabase
        .from("bestellungen")
        .select("id")
        .eq("bestellnummer", erkannteBestellnummer)
        .limit(1)
        .single();
      existierendeBestellung = data;
    }

    if (existierendeBestellung) {
      bestellungId = existierendeBestellung.id;
    } else {
      // 2. Suche per Signal (erwartet-Status)
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
        // 3. Neue Bestellung anlegen – bei Bestellnummer-Konflikt existierende verwenden
        const { data: neue, error: insertError } = await supabase
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

        if (insertError && erkannteBestellnummer) {
          // Duplikat erkannt – existierende Bestellung verwenden
          const { data: fallback } = await supabase
            .from("bestellungen")
            .select("id")
            .eq("bestellnummer", erkannteBestellnummer)
            .limit(1)
            .single();
          if (fallback) {
            bestellungId = fallback.id;
          } else {
            throw new Error("Bestellung konnte weder angelegt noch gefunden werden");
          }
        } else if (!neue) {
          throw new Error("Bestellung konnte nicht angelegt werden");
        } else {
          bestellungId = neue.id;
        }
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
            logInfo("/api/webhook/email", `Preisanomalie erkannt`, { bestellungId, zusammenfassung: anomalien.zusammenfassung });
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "Preisanomalie-Prüfung fehlgeschlagen", err);
      }
    }

    // === FEATURE: Duplikat-Erkennung ===
    if (aktuelleArtikel.length > 0) {
      try {
        const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: aehnliche } = await supabase
          .from("bestellungen")
          .select("id, bestellnummer, haendler_name, betrag, created_at")
          .eq("haendler_name", haendler?.name || haendlerDomain)
          .neq("id", bestellungId)
          .gte("created_at", siebenTageZurueck)
          .limit(10);

        if (aehnliche && aehnliche.length > 0) {
          const aehnlicheIds = aehnliche.map((b) => b.id);
          const { data: aehnlicheDoks } = await supabase
            .from("dokumente")
            .select("bestellung_id, artikel")
            .in("bestellung_id", aehnlicheIds)
            .not("artikel", "is", null);

          const artikelMap = new Map<string, { name: string; menge: number; einzelpreis: number }[]>();
          for (const dok of aehnlicheDoks || []) {
            const art = dok.artikel as { name: string; menge: number; einzelpreis: number }[] | null;
            if (art) {
              const existing = artikelMap.get(dok.bestellung_id) || [];
              artikelMap.set(dok.bestellung_id, [...existing, ...art]);
            }
          }

          const existierendeBestellungen = aehnliche.map((b) => ({
            bestellnummer: b.bestellnummer || "Ohne Nr.",
            haendler: b.haendler_name || "–",
            betrag: Number(b.betrag) || null,
            artikel: artikelMap.get(b.id) || [],
            datum: new Date(b.created_at).toLocaleDateString("de-DE"),
          }));

          const duplikat = await pruefeDuplikat(
            {
              haendler: haendler?.name || haendlerDomain,
              betrag: ergebnisse[0]?.analyse.gesamtbetrag ?? null,
              artikel: aktuelleArtikel,
            },
            existierendeBestellungen
          );

          if (duplikat.ist_duplikat && duplikat.konfidenz >= 0.7) {
            await supabase.from("kommentare").insert({
              bestellung_id: bestellungId,
              autor_kuerzel: "KI",
              autor_name: "KI-Duplikat-Erkennung",
              text: `⚠ Mögliches Duplikat: ${duplikat.begruendung}`,
            });
            logInfo("/api/webhook/email", "Duplikat erkannt", { bestellungId, duplikat_von: duplikat.duplikat_von, konfidenz: duplikat.konfidenz });
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "Duplikat-Prüfung fehlgeschlagen", err);
      }
    }

    // === FEATURE: Automatische Artikel-Kategorisierung ===
    if (aktuelleArtikel.length > 0) {
      try {
        const kategorisierung = await kategorisiereArtikel(aktuelleArtikel);
        if (kategorisierung.kategorien.length > 0) {
          // Kategorien als JSONB in der Bestellung speichern
          await supabase
            .from("bestellungen")
            .update({ artikel_kategorien: kategorisierung.zusammenfassung })
            .eq("id", bestellungId);
          logInfo("/api/webhook/email", "Artikel kategorisiert", { bestellungId, kategorien: kategorisierung.zusammenfassung });
        }
      } catch (err) {
        logError("/api/webhook/email", "Kategorisierung fehlgeschlagen", err);
      }
    }

    // Status aktualisieren (zentralisiert)
    await updateBestellungStatus(supabase, bestellungId);

    // Signal als verarbeitet markieren
    if (signal) {
      await supabase
        .from("bestellung_signale")
        .update({ verarbeitet: true })
        .eq("id", signal.id);
    }

    return NextResponse.json({ success: true, bestellung_id: bestellungId });
  } catch (err) {
    logError("/api/webhook/email", "Webhook Fehler", err);
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
