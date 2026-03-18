import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analysiereDokument, erkenneBestellerIntelligent, erkenneHaendlerAusEmail, pruefePreisanomalien, pruefeDuplikat, kategorisiereArtikel, extrahiereBestellerHinweise, erkenneProjektAusInhalt, berechneAffinitaet, aktualisiereBestellerAffinitaet, type ProjektMatchErgebnis } from "@/lib/openai";
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

    // 1. Exakter Match über bekannte E-Mail-Adressen
    let haendler = haendlerListe?.find((h) =>
      h.email_absender?.some(
        (addr: string) =>
          email_absender?.toLowerCase().includes(addr.toLowerCase())
      )
    ) || null;

    const absenderAdresse = extractEmailAddress(email_absender);

    // 2. Fallback: Domain-Match (z.B. @bauhaus.de → bauhaus.de)
    if (!haendler && absenderAdresse) {
      const absenderDomain = absenderAdresse.split("@")[1]?.toLowerCase();
      if (absenderDomain) {
        haendler = haendlerListe?.find((h) =>
          absenderDomain.includes(h.domain.toLowerCase()) ||
          h.domain.toLowerCase().includes(absenderDomain)
        ) || null;

        // Neue Absender-Adresse automatisch hinzufügen
        if (haendler && absenderAdresse) {
          const bestehendeAdressen: string[] = haendler.email_absender || [];
          const bereitsVorhanden = bestehendeAdressen.some(
            (a: string) => a.toLowerCase() === absenderAdresse.toLowerCase()
          );

          if (!bereitsVorhanden && bestehendeAdressen.length < 10) {
            await supabase
              .from("haendler")
              .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
              .eq("id", haendler.id);
            logInfo("/api/webhook/email", `Neue Absender-Adresse für ${haendler.name}: ${absenderAdresse}`);
          }
        }
      }
    }

    const haendlerDomain = haendler?.domain || extractDomain(email_absender);
    const emailText = body.email_text || body.email_body || "";

    // Zuordnungs-Methode für Logging
    let zuordnungsMethode = "";

    // =====================================================================
    // STUFE 1: Signal ±60 Minuten (Chrome Extension)
    // =====================================================================
    const emailZeit = new Date(email_datum || Date.now()).getTime();

    const { data: signale60 } = await supabase
      .from("bestellung_signale")
      .select("*")
      .eq("haendler_domain", haendlerDomain)
      .eq("verarbeitet", false)
      .gte("zeitstempel", new Date(emailZeit - 60 * 60 * 1000).toISOString())
      .lte("zeitstempel", new Date(emailZeit + 60 * 60 * 1000).toISOString())
      .order("zeitstempel", { ascending: false })
      .limit(1);

    let signal = signale60?.[0] || null;
    let bestellerKuerzel = signal?.kuerzel || "";

    if (bestellerKuerzel) {
      zuordnungsMethode = "signal_60min";
    }

    // =====================================================================
    // STUFE 2: Signal ±24 Stunden (erweitertes Zeitfenster)
    // =====================================================================
    if (!bestellerKuerzel) {
      const { data: signale24h } = await supabase
        .from("bestellung_signale")
        .select("*")
        .eq("haendler_domain", haendlerDomain)
        .eq("verarbeitet", false)
        .gte("zeitstempel", new Date(emailZeit - 24 * 60 * 60 * 1000).toISOString())
        .lte("zeitstempel", new Date(emailZeit + 24 * 60 * 60 * 1000).toISOString())
        .order("zeitstempel", { ascending: false })
        .limit(1);

      if (signale24h?.[0]) {
        signal = signale24h[0];
        bestellerKuerzel = signal.kuerzel;
        zuordnungsMethode = "signal_24h";
        logInfo("/api/webhook/email", `Signal im erweiterten Zeitfenster (±24h) gefunden: ${bestellerKuerzel}`);
      }
    }

    // Anhänge verarbeiten (benötigt für Stufe 4, 5, 6)
    const ergebnisse = [];
    for (const anhang of anhaenge || []) {
      const { base64, mime_type, name: dateiName } = anhang;
      const analyse = await analysiereDokument(base64, mime_type);
      ergebnisse.push({ analyse, dateiName, base64, mime_type });
    }

    // =====================================================================
    // STUFE 3: Händler-Affinität (wer bestellt am häufigsten hier?)
    // =====================================================================
    if (!bestellerKuerzel) {
      try {
        const haendlerName = haendler?.name || haendlerDomain;
        const { data: affinitaet } = await supabase
          .from("bestellungen")
          .select("besteller_kuerzel")
          .eq("haendler_name", haendlerName)
          .neq("besteller_kuerzel", "UNBEKANNT")
          .order("created_at", { ascending: false })
          .limit(50);

        if (affinitaet && affinitaet.length >= 3) {
          // Häufigster Besteller bei diesem Händler
          const zaehler = new Map<string, number>();
          for (const b of affinitaet) {
            zaehler.set(b.besteller_kuerzel, (zaehler.get(b.besteller_kuerzel) || 0) + 1);
          }

          const sortiert = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
          const [topKuerzel, topAnzahl] = sortiert[0];
          const anteil = topAnzahl / affinitaet.length;

          // Nur zuordnen wenn >60% der Bestellungen von einem Besteller kommen
          if (anteil > 0.6) {
            bestellerKuerzel = topKuerzel;
            zuordnungsMethode = "haendler_affinitaet";
            logInfo("/api/webhook/email", `Händler-Affinität: ${topKuerzel} bestellt ${Math.round(anteil * 100)}% bei ${haendlerName} (${topAnzahl}/${affinitaet.length})`);
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "Händler-Affinität fehlgeschlagen", err);
      }
    }

    // =====================================================================
    // STUFE 4: E-Mail-Body + Dokument-Analyse (Name, Adresse, Kundennr.)
    // =====================================================================
    if (!bestellerKuerzel && (emailText || ergebnisse.length > 0)) {
      try {
        const { data: benutzerListe } = await supabase
          .from("benutzer_rollen")
          .select("kuerzel, name, email")
          .eq("rolle", "besteller");

        if (benutzerListe && benutzerListe.length > 0) {
          // Schnelle Textsuche: Name direkt im E-Mail-Text oder Dokumenten?
          const suchTexte = [
            emailText,
            email_betreff || "",
            ...ergebnisse.map((e) => JSON.stringify(e.analyse)),
          ].join(" ").toLowerCase();

          let schnellTreffer = "";
          for (const benutzer of benutzerListe) {
            const namen = benutzer.name.toLowerCase().split(" ");
            // Vor- UND Nachname müssen vorkommen
            if (namen.length >= 2 && namen.every((n: string) => suchTexte.includes(n))) {
              schnellTreffer = benutzer.kuerzel;
              break;
            }
          }

          if (schnellTreffer) {
            bestellerKuerzel = schnellTreffer;
            zuordnungsMethode = "name_im_text";
            logInfo("/api/webhook/email", `Name im Text gefunden: ${schnellTreffer}`);
          } else if (emailText.length > 20) {
            // KI-basierte Analyse wenn E-Mail-Text vorhanden
            const dokumentTexte = ergebnisse.map((e) =>
              [e.analyse.haendler, e.analyse.bestellnummer, JSON.stringify(e.analyse.artikel?.slice(0, 5))]
                .filter(Boolean)
                .join(" | ")
            );

            const hinweise = await extrahiereBestellerHinweise(
              emailText,
              email_betreff || "",
              dokumentTexte,
              benutzerListe.map((b) => ({ kuerzel: b.kuerzel, name: b.name, email: b.email }))
            );

            if (hinweise.vorgeschlagenes_kuerzel && hinweise.konfidenz >= 0.6) {
              bestellerKuerzel = hinweise.vorgeschlagenes_kuerzel;
              zuordnungsMethode = "email_body_ki";
              logInfo("/api/webhook/email", `E-Mail-Body KI-Analyse: ${hinweise.vorgeschlagenes_kuerzel} (${hinweise.konfidenz})`, {
                hinweise: hinweise.gefundene_hinweise,
                begruendung: hinweise.begruendung,
              });
            }
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "E-Mail-Body Analyse fehlgeschlagen", err);
      }
    }

    // =====================================================================
    // STUFE 5: KI-Historien-Matching (Artikel + Händler-Muster)
    // =====================================================================
    if (!bestellerKuerzel && ergebnisse.length > 0) {
      try {
        const artikelAusEmail = ergebnisse
          .flatMap((e) => e.analyse.artikel || [])
          .map((a) => ({ name: a.name, menge: a.menge, einzelpreis: a.einzelpreis }));

        const { data: benutzerListe } = await supabase
          .from("benutzer_rollen")
          .select("kuerzel, name")
          .eq("rolle", "besteller");

        const bestellerHistorie = [];
        for (const benutzer of benutzerListe || []) {
          const { data: bestellungen } = await supabase
            .from("bestellungen")
            .select("id, haendler_name")
            .eq("besteller_kuerzel", benutzer.kuerzel)
            .limit(30);

          const bestellIds = (bestellungen || []).map((b) => b.id);
          let artikelNamen: string[] = [];

          if (bestellIds.length > 0) {
            const { data: bisherigeDokumente } = await supabase
              .from("dokumente")
              .select("artikel, bestellung_id")
              .in("bestellung_id", bestellIds)
              .limit(50);

            artikelNamen = (bisherigeDokumente || [])
              .flatMap((d) => {
                const art = d.artikel as { name: string }[] | null;
                return art ? art.map((a) => a.name) : [];
              });
          }

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
            zuordnungsMethode = "ki_historien";
            logInfo("/api/webhook/email", `KI-Besteller-Erkennung: ${erkennung.kuerzel} (${erkennung.konfidenz})`, { begruendung: erkennung.begruendung });
          }
        }
      } catch (err) {
        logError("/api/webhook/email", "KI-Besteller-Erkennung fehlgeschlagen", err);
      }
    }

    // =====================================================================
    // STUFE 6: Fallback → UNBEKANNT + Admin-Benachrichtigung
    // =====================================================================
    if (!bestellerKuerzel) {
      bestellerKuerzel = "UNBEKANNT";
      zuordnungsMethode = "unbekannt";
      logInfo("/api/webhook/email", `Keine Zuordnung möglich für ${haendlerDomain}`, {
        email_absender,
        email_betreff,
        haendler: haendler?.name,
      });
    }

    // Besteller-Name holen
    const { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name")
      .eq("kuerzel", bestellerKuerzel)
      .maybeSingle();

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
        .maybeSingle();
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
            zuordnung_methode: zuordnungsMethode,
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
            .maybeSingle();
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
      const { error: uploadError } = await supabase.storage
        .from("dokumente")
        .upload(storagePfad, buffer, { contentType: mime_type });
      if (uploadError) {
        logError("/api/webhook/email", `Storage upload fehlgeschlagen: ${storagePfad}`, uploadError);
      }

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

    // === FEATURE: Intelligente Baustellen-Erkennung (5-Stufen-Kette) ===
    try {
      // 1. Volltext + Lieferadressen aus Scan-Ergebnissen sammeln
      const dokumentTexte = ergebnisse.map((e) => e.analyse.volltext || "").filter(Boolean);
      const lieferadressen = ergebnisse.flatMap((e) => e.analyse.lieferadressen || []).filter(Boolean);

      // 2. Büro-Adresse + Konfidenz-Schwellwerte laden
      const { data: firmaSettings } = await supabase
        .from("firma_einstellungen")
        .select("schluessel, wert")
        .in("schluessel", ["buero_adresse", "konfidenz_direkt", "konfidenz_vorschlag"]);
      const bueroAdresse = firmaSettings?.find((s: { schluessel: string }) => s.schluessel === "buero_adresse")?.wert || "";
      const schwelleDirekt = parseFloat(firmaSettings?.find((s: { schluessel: string }) => s.schluessel === "konfidenz_direkt")?.wert || "0.85");
      const schwelleVorschlag = parseFloat(firmaSettings?.find((s: { schluessel: string }) => s.schluessel === "konfidenz_vorschlag")?.wert || "0.60");

      // 3. Aktive Projekte mit Kunden-Info laden
      const { data: aktiveProjekte } = await supabase
        .from("projekte")
        .select("id, name, beschreibung, adresse, adresse_keywords, kunden_id, besteller_affinitaet, kunden(name)")
        .in("status", ["aktiv", "pausiert"]);

      type KundenJoin = { name: string } | { name: string }[] | null;
      type ProjektRow = { id: string; name: string; beschreibung: string | null; adresse: string | null; adresse_keywords: string[] | null; kunden_id: string | null; besteller_affinitaet: unknown; kunden: KundenJoin };
      const kundenName = (p: ProjektRow): string | null => {
        const k = p.kunden;
        if (!k) return null;
        if (Array.isArray(k)) return k[0]?.name || null;
        if (typeof k === "object" && "name" in k) return k.name || null;
        return null;
      };

      // 4. Letzte Bestellung pro Projekt laden (für Recency-Boost)
      const projektIds = (aktiveProjekte || []).map((p: { id: string }) => p.id);
      let letzteBestellungMap: Record<string, string> = {};
      if (projektIds.length > 0) {
        const { data: letzteBestellungen } = await supabase
          .from("bestellungen")
          .select("projekt_id, created_at")
          .in("projekt_id", projektIds)
          .order("created_at", { ascending: false });
        for (const b of letzteBestellungen || []) {
          if (b.projekt_id && !letzteBestellungMap[b.projekt_id]) {
            letzteBestellungMap[b.projekt_id] = b.created_at;
          }
        }
      }

      // 5. STUFE 0: Affinität prüfen (kostenlos, kein API-Call)
      let projektErgebnis: ProjektMatchErgebnis | null = null;
      let affinitaetsMatch: ProjektMatchErgebnis | null = null;
      if (bestellerKuerzel && bestellerKuerzel !== "UNBEKANNT" && aktiveProjekte) {
        affinitaetsMatch = berechneAffinitaet(
          bestellerKuerzel,
          (aktiveProjekte as ProjektRow[]).map((p) => ({
            id: p.id,
            name: p.name,
            besteller_affinitaet: p.besteller_affinitaet as Record<string, number> | null,
            letzte_bestellung: letzteBestellungMap[p.id] || null,
          }))
        );
      }

      if (affinitaetsMatch && affinitaetsMatch.konfidenz >= schwelleDirekt) {
        // Affinität allein reicht für Direkt-Zuordnung → GPT überspringen
        projektErgebnis = affinitaetsMatch;
        logInfo("/api/webhook/email", `Affinität-Shortcut: GPT übersprungen (${Math.round(affinitaetsMatch.konfidenz * 100)}%)`, { bestellungId });
      } else {
        // 6. Stufen 1-3: GPT-4o Erkennung
        const gptErgebnis = await erkenneProjektAusInhalt({
          email_betreff: email_betreff || "",
          email_body: emailText,
          dokument_texte: dokumentTexte,
          lieferadressen,
          buero_adresse: bueroAdresse,
          aktive_projekte: ((aktiveProjekte || []) as ProjektRow[]).map((p) => ({
            id: p.id,
            name: p.name,
            beschreibung: p.beschreibung,
            adresse: p.adresse,
            adresse_keywords: p.adresse_keywords || [],
            kunden_name: kundenName(p),
          })),
        });

        // 7. Bestes Ergebnis nehmen: max(GPT, Affinität), mindestens schwelleVorschlag
        const best = (gptErgebnis && affinitaetsMatch)
          ? (gptErgebnis.konfidenz >= affinitaetsMatch.konfidenz ? gptErgebnis : affinitaetsMatch)
          : (gptErgebnis || affinitaetsMatch);
        if (best && best.konfidenz >= schwelleVorschlag) {
          projektErgebnis = best;
        }
      }

      // 6. Speichern
      const updateDaten: Record<string, unknown> = {
        lieferadresse_erkannt: projektErgebnis?.extrahierte_lieferadresse || lieferadressen[0] || null,
      };

      if (projektErgebnis && projektErgebnis.projekt_id) {
        const direktZuordnen = projektErgebnis.konfidenz >= schwelleDirekt;

        // Projekt-Name nachschlagen
        const matchProjekt = (aktiveProjekte as ProjektRow[])?.find((p) => p.id === projektErgebnis!.projekt_id);
        const projektName = matchProjekt?.name || "";

        if (direktZuordnen) {
          updateDaten.projekt_id = projektErgebnis.projekt_id;
          updateDaten.projekt_name = projektName;
          updateDaten.projekt_vorschlag_id = null;
          updateDaten.projekt_vorschlag_konfidenz = projektErgebnis.konfidenz;
          updateDaten.projekt_vorschlag_methode = projektErgebnis.methode;
          updateDaten.projekt_vorschlag_begruendung = projektErgebnis.begruendung;
          updateDaten.projekt_bestaetigt = true;
        } else {
          updateDaten.projekt_vorschlag_id = projektErgebnis.projekt_id;
          updateDaten.projekt_vorschlag_konfidenz = projektErgebnis.konfidenz;
          updateDaten.projekt_vorschlag_methode = projektErgebnis.methode;
          updateDaten.projekt_vorschlag_begruendung = projektErgebnis.begruendung;
          updateDaten.projekt_bestaetigt = false;
        }

        logInfo("/api/webhook/email", `Projekt-Match: ${projektName} (${Math.round(projektErgebnis.konfidenz * 100)}%, ${projektErgebnis.methode})`, { bestellungId, direkt: direktZuordnen });
      }

      await supabase
        .from("bestellungen")
        .update(updateDaten)
        .eq("id", bestellungId);

      // 7. Self-Learning bei Direkt-Zuordnung
      if (projektErgebnis && projektErgebnis.projekt_id && projektErgebnis.konfidenz >= schwelleDirekt) {
        await aktualisiereBestellerAffinitaet(supabase, projektErgebnis.projekt_id);
      }
    } catch (err) {
      logError("/api/webhook/email", "Baustellen-Erkennung fehlgeschlagen", err);
      // Pipeline läuft trotzdem weiter
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

    // Admin-Benachrichtigung bei UNBEKANNT: Kommentar anlegen
    if (bestellerKuerzel === "UNBEKANNT") {
      const erkannteArtikel = ergebnisse
        .flatMap((e) => e.analyse.artikel || [])
        .slice(0, 5)
        .map((a) => a.name)
        .join(", ");

      await supabase.from("kommentare").insert({
        bestellung_id: bestellungId,
        autor_kuerzel: "SYSTEM",
        autor_name: "Zuordnungs-Assistent",
        text: `Bestellung konnte keinem Besteller zugeordnet werden.\n` +
          `Händler: ${haendler?.name || haendlerDomain}\n` +
          `Absender: ${email_absender}\n` +
          `Betreff: ${email_betreff || "–"}\n` +
          (erkannteArtikel ? `Artikel: ${erkannteArtikel}\n` : "") +
          `\nBitte manuell zuordnen über: Bestelldetail → "Besteller zuordnen"`,
      });
    }

    // Webhook-Log: Erfolg
    await supabase.from("webhook_logs").insert({
      typ: "email",
      status: "success",
      bestellung_id: bestellungId,
      bestellnummer: erkannteBestellnummer || null,
    });

    return NextResponse.json({
      success: true,
      bestellung_id: bestellungId,
      zuordnung: {
        methode: zuordnungsMethode,
        kuerzel: bestellerKuerzel,
      },
    });
  } catch (err) {
    logError("/api/webhook/email", "Webhook Fehler", err);

    // Webhook-Log: Fehler
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht weiter propagieren */ }

    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

function extractDomain(email: string): string {
  const match = email?.match(/@([^>\s]+)/);
  return match ? match[1] : "unbekannt";
}

function extractEmailAddress(raw: string): string {
  // "Bauhaus <bestellung@bauhaus.de>" → "bestellung@bauhaus.de"
  const match = raw?.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : "";
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
