import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

// =====================================================================
// Testdaten-Definition: 12 Bestellungen die alle Features abdecken
// =====================================================================

interface TestBestellung {
  bestellnummer: string;
  haendler_name: string;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number;
  status: string;
  bestellungsart: "material" | "subunternehmer";
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_versandbestaetigung?: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  zuordnung_methode?: string;
  artikel_kategorien?: string[];
  tracking_nummer?: string;
  versanddienstleister?: string;
  tracking_url?: string;
  voraussichtliche_lieferung?: string;
  // Projekt/Kunden-Zuordnung wird dynamisch gesetzt
  _projektIndex?: number;
}

const TESTBESTELLUNGEN: TestBestellung[] = [
  // === Material-Bestellungen ===
  {
    bestellnummer: "TEST-BH-001",
    haendler_name: "Bauhaus",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 347.85,
    status: "vollstaendig",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    hat_versandbestaetigung: true,
    zuordnung_methode: "signal_60min",
    artikel_kategorien: ["Elektrowerkzeug", "Arbeitsschutz"],
    tracking_nummer: "00340434161094015902",
    versanddienstleister: "DHL",
    tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094015902",
    voraussichtliche_lieferung: "", // wird dynamisch gesetzt
    _projektIndex: 0,
  },
  {
    bestellnummer: "TEST-OBI-002",
    haendler_name: "OBI",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 1289.5,
    status: "offen",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: false,
    zuordnung_methode: "signal_24h",
    artikel_kategorien: ["Trockenbau", "Befestigung"],
    _projektIndex: 0,
  },
  {
    bestellnummer: "TEST-AMZ-003",
    haendler_name: "Amazon",
    besteller_kuerzel: "MH",
    besteller_name: "Mohammed Hawrami",
    betrag: 89.99,
    status: "freigegeben",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    hat_versandbestaetigung: true,
    zuordnung_methode: "haendler_affinitaet",
    artikel_kategorien: ["Elektrowerkzeug"],
    tracking_nummer: "1Z9999999999999999",
    versanddienstleister: "UPS",
    tracking_url: "https://www.ups.com/track?tracknum=1Z9999999999999999",
    _projektIndex: 1,
  },
  {
    bestellnummer: "TEST-WU-004",
    haendler_name: "Würth",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 2450.0,
    status: "abweichung",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    zuordnung_methode: "signal_60min",
    artikel_kategorien: ["Befestigung", "Chemie"],
    _projektIndex: 0,
  },
  {
    bestellnummer: "TEST-BH-005",
    haendler_name: "Bauhaus",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 156.3,
    status: "ls_fehlt",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: true,
    zuordnung_methode: "ki_email_analyse",
  },
  {
    bestellnummer: "TEST-OBI-006",
    haendler_name: "OBI",
    besteller_kuerzel: "MH",
    besteller_name: "Mohammed Hawrami",
    betrag: 534.2,
    status: "erwartet",
    bestellungsart: "material",
    hat_bestellbestaetigung: false,
    hat_lieferschein: false,
    hat_rechnung: false,
    zuordnung_methode: "signal_60min",
    _projektIndex: 1,
  },
  {
    bestellnummer: "TEST-AMZ-007",
    haendler_name: "Amazon",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 42.5,
    status: "vollstaendig",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    zuordnung_methode: "ki_historisch",
    artikel_kategorien: ["Büromaterial"],
  },
  {
    bestellnummer: "TEST-WU-008",
    haendler_name: "Würth",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 780.0,
    status: "freigegeben",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    hat_versandbestaetigung: true,
    zuordnung_methode: "signal_60min",
    artikel_kategorien: ["Befestigung"],
    tracking_nummer: "01529004175240",
    versanddienstleister: "DPD",
    tracking_url: "https://tracking.dpd.de/status/de_DE/parcel/01529004175240",
    _projektIndex: 0,
  },

  // === Subunternehmer-Bestellungen ===
  {
    bestellnummer: "TEST-SUB-009",
    haendler_name: "Elektro Huber GmbH",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 4800.0,
    status: "vollstaendig",
    bestellungsart: "subunternehmer",
    hat_bestellbestaetigung: false,
    hat_lieferschein: false,
    hat_rechnung: true,
    hat_aufmass: true,
    hat_leistungsnachweis: true,
    zuordnung_methode: "subunternehmer_match",
    _projektIndex: 0,
  },
  {
    bestellnummer: "TEST-SUB-010",
    haendler_name: "Trockenbau Maier",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 12500.0,
    status: "offen",
    bestellungsart: "subunternehmer",
    hat_bestellbestaetigung: false,
    hat_lieferschein: false,
    hat_rechnung: true,
    hat_aufmass: false,
    hat_leistungsnachweis: false,
    zuordnung_methode: "subunternehmer_match",
    _projektIndex: 1,
  },

  // === Unzugeordnete Bestellung (UNBEKANNT) ===
  {
    bestellnummer: "TEST-UNB-011",
    haendler_name: "hornbach.de",
    besteller_kuerzel: "UNBEKANNT",
    besteller_name: "Unbekannt",
    betrag: 234.5,
    status: "offen",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: false,
    zuordnung_methode: "unbekannt",
  },
  {
    bestellnummer: "TEST-UNB-012",
    haendler_name: "screwfix.de",
    besteller_kuerzel: "UNBEKANNT",
    besteller_name: "Unbekannt",
    betrag: 67.9,
    status: "offen",
    bestellungsart: "material",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: false,
    zuordnung_methode: "unbekannt",
  },
];

const TEST_ARTIKEL = [
  [
    { name: "Bosch Schlagbohrmaschine GSB 16 RE", menge: 1, einzelpreis: 149.99, gesamtpreis: 149.99 },
    { name: "Bosch Bohrer-Set 15-tlg", menge: 2, einzelpreis: 24.95, gesamtpreis: 49.9 },
    { name: "Arbeitshandschuhe Gr. 10", menge: 5, einzelpreis: 8.99, gesamtpreis: 44.95 },
  ],
  [
    { name: "Rigips Bauplatte 2600x600x12,5mm", menge: 40, einzelpreis: 12.49, gesamtpreis: 499.6 },
    { name: "Knauf Fugenspachtel 25kg", menge: 4, einzelpreis: 18.95, gesamtpreis: 75.8 },
    { name: "Schnellbauschrauben 3,9x25mm 1000St", menge: 2, einzelpreis: 14.5, gesamtpreis: 29.0 },
  ],
  [
    { name: "Makita Akku-Winkelschleifer DGA513Z", menge: 1, einzelpreis: 89.99, gesamtpreis: 89.99 },
  ],
  [
    { name: "Fischer Dübel SX 8x40 (200 St)", menge: 10, einzelpreis: 24.5, gesamtpreis: 245.0 },
    { name: "Spax Universalschraube 5x60 (500 St)", menge: 5, einzelpreis: 34.9, gesamtpreis: 174.5 },
    { name: "Hilti HIT-HY 200-A Injektionsmörtel", menge: 8, einzelpreis: 45.0, gesamtpreis: 360.0 },
  ],
];

const TEST_SUB_ARTIKEL = [
  [
    { name: "Elektroinstallation Wohnung EG", menge: 1, einzelpreis: 3200.0, gesamtpreis: 3200.0 },
    { name: "Material Elektro (Kabel, Dosen)", menge: 1, einzelpreis: 1600.0, gesamtpreis: 1600.0 },
  ],
  [
    { name: "Trockenbau Wände OG – 85m²", menge: 85, einzelpreis: 45.0, gesamtpreis: 3825.0 },
    { name: "Abhangdecke Flur – 22m²", menge: 22, einzelpreis: 65.0, gesamtpreis: 1430.0 },
    { name: "Spachteln und Schleifen", menge: 1, einzelpreis: 7245.0, gesamtpreis: 7245.0 },
  ],
];

const TEST_PROJEKTE = [
  {
    name: "TEST Sanierung Kernstraße 14",
    beschreibung: "Komplettsanierung Altbauwohnung 3. OG, 85m²",
    farbe: "#570006",
    budget: 45000.0,
    status: "aktiv",
    adresse: "Kernstraße 14, 81671 München",
  },
  {
    name: "TEST Umbau Rosenheimer Str. 12a",
    beschreibung: "Büroumbau Erdgeschoss, neue Raumaufteilung",
    farbe: "#2563eb",
    budget: 28000.0,
    status: "aktiv",
    adresse: "Rosenheimer Landstr. 12a, 85653 Aying",
  },
];

const TEST_KUNDEN = [
  {
    name: "TEST Familie Müller",
    kuerzel: "MUE",
    adresse: "Kernstraße 14, 81671 München",
    email: "mueller@example.de",
    telefon: "+49 89 12345678",
    keywords: ["müller", "kernstraße"],
    farbe: "#16a34a",
    confirmed_at: new Date().toISOString(),
  },
  {
    name: "TEST Praxis Dr. Weber",
    kuerzel: "WEB",
    adresse: "Rosenheimer Landstr. 12a, 85653 Aying",
    email: "weber@example.de",
    keywords: ["weber", "praxis", "rosenheimer"],
    farbe: "#d97706",
    confirmed_at: new Date().toISOString(),
  },
  {
    name: "TEST Auto-erkannt: Schmidt Bau",
    kuerzel: null,
    adresse: null,
    email: null,
    keywords: ["schmidt"],
    farbe: "#8b5cf6",
    confirmed_at: null, // Unbestätigt — auto-erkannt
  },
];

// =====================================================================
// API Handler
// =====================================================================

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const rlKey = getRateLimitKey(request, "testdaten");
    const rl = checkRateLimit(rlKey, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte warten." }, { status: 429 });
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

    const supabase = createServiceClient();
    const body = await request.json();

    if (body.action === "create") {
      return createTestdaten(supabase);
    } else if (body.action === "delete") {
      return deleteTestdaten(supabase);
    }

    return NextResponse.json({ error: ERRORS.UNGUELTIGE_AKTION }, { status: 400 });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// =====================================================================
// Create
// =====================================================================

async function createTestdaten(supabase: ReturnType<typeof createServiceClient>) {
  const { data: existing } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Testdaten sind bereits vorhanden. Bitte zuerst löschen." },
      { status: 400 }
    );
  }

  const now = new Date();

  // 1. Kunden anlegen
  const kundenIds: string[] = [];
  for (const kunde of TEST_KUNDEN) {
    const { data, error } = await supabase.from("kunden").insert(kunde).select("id").single();
    if (error || !data) {
      logError("/api/testdaten", "Fehler bei Test-Kunde", error);
      continue;
    }
    kundenIds.push(data.id);
  }

  // 2. Projekte anlegen (mit Kunden-Zuordnung)
  const projektIds: string[] = [];
  for (let p = 0; p < TEST_PROJEKTE.length; p++) {
    const projekt = TEST_PROJEKTE[p];
    const kundenId = kundenIds[p] || null;
    const kundenName = kundenId ? TEST_KUNDEN[p]?.name : null;
    const { data, error } = await supabase
      .from("projekte")
      .insert({ ...projekt, kunden_id: kundenId, kunde: kundenName })
      .select("id")
      .single();
    if (error || !data) {
      logError("/api/testdaten", "Fehler bei Test-Projekt", error);
      continue;
    }
    projektIds.push(data.id);
  }

  // 3. Bestellungen + Dokumente + Abgleiche + Freigaben + Kommentare
  const erstellteIds: string[] = [];

  for (let i = 0; i < TESTBESTELLUNGEN.length; i++) {
    const b = TESTBESTELLUNGEN[i];
    const createdAt = new Date(now.getTime() - (TESTBESTELLUNGEN.length - i) * 2 * 24 * 60 * 60 * 1000);
    const isSub = b.bestellungsart === "subunternehmer";

    // Projekt-Zuordnung
    const projektId = b._projektIndex !== undefined ? projektIds[b._projektIndex] || null : null;
    const projektName = b._projektIndex !== undefined ? TEST_PROJEKTE[b._projektIndex]?.name || null : null;

    // Kunden-Zuordnung (über Projekt)
    const kundenId = b._projektIndex !== undefined ? kundenIds[b._projektIndex] || null : null;
    const kundenName = b._projektIndex !== undefined ? TEST_KUNDEN[b._projektIndex]?.name || null : null;

    // Voraussichtliche Lieferung dynamisch setzen
    const vorauss = b.hat_versandbestaetigung
      ? new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : null;

    const { data: bestellung, error } = await supabase
      .from("bestellungen")
      .insert({
        bestellnummer: b.bestellnummer,
        haendler_name: b.haendler_name,
        besteller_kuerzel: b.besteller_kuerzel,
        besteller_name: b.besteller_name,
        betrag: b.betrag,
        waehrung: "EUR",
        status: b.status,
        bestellungsart: b.bestellungsart,
        hat_bestellbestaetigung: b.hat_bestellbestaetigung,
        hat_lieferschein: b.hat_lieferschein,
        hat_rechnung: b.hat_rechnung,
        hat_versandbestaetigung: b.hat_versandbestaetigung || false,
        hat_aufmass: b.hat_aufmass || false,
        hat_leistungsnachweis: b.hat_leistungsnachweis || false,
        zuordnung_methode: b.zuordnung_methode || null,
        artikel_kategorien: b.artikel_kategorien || null,
        tracking_nummer: b.tracking_nummer || null,
        versanddienstleister: b.versanddienstleister || null,
        tracking_url: b.tracking_url || null,
        voraussichtliche_lieferung: vorauss,
        projekt_id: projektId,
        projekt_name: projektName,
        projekt_bestaetigt: !!projektId,
        kunden_id: kundenId,
        kunden_name: kundenName,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      })
      .select("id")
      .single();

    if (error || !bestellung) {
      logError("/api/testdaten", `Fehler bei ${b.bestellnummer}`, error);
      continue;
    }

    erstellteIds.push(bestellung.id);

    // Dokumente anlegen
    if (isSub) {
      // Subunternehmer: Rechnung, optional Aufmaß + Leistungsnachweis
      const subDokTypen = [
        { typ: "rechnung", flag: b.hat_rechnung, label: "Rechnung" },
        { typ: "aufmass", flag: b.hat_aufmass, label: "Aufmaß" },
        { typ: "leistungsnachweis", flag: b.hat_leistungsnachweis, label: "Leistungsnachweis" },
      ];
      const subArtikel = TEST_SUB_ARTIKEL[(i - 8) % TEST_SUB_ARTIKEL.length] || TEST_SUB_ARTIKEL[0];

      for (const dok of subDokTypen) {
        if (!dok.flag) continue;
        await supabase.from("dokumente").insert({
          bestellung_id: bestellung.id,
          typ: dok.typ,
          quelle: "email",
          email_betreff: `${dok.label} – ${b.haendler_name}`,
          email_absender: `buchhaltung@${b.haendler_name.toLowerCase().replace(/\s+/g, "-")}.de`,
          email_datum: createdAt.toISOString(),
          bestellnummer_erkannt: b.bestellnummer,
          artikel: dok.typ === "rechnung" ? subArtikel : null,
          gesamtbetrag: dok.typ === "rechnung" ? b.betrag : null,
          netto: dok.typ === "rechnung" ? Math.round((b.betrag / 1.19) * 100) / 100 : null,
          mwst: dok.typ === "rechnung" ? Math.round((b.betrag - b.betrag / 1.19) * 100) / 100 : null,
          faelligkeitsdatum: dok.typ === "rechnung"
            ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
        });
      }
    } else {
      // Material: Best./LS/RE + optional Versandbestätigung
      const matDokTypen = [
        { typ: "bestellbestaetigung", flag: b.hat_bestellbestaetigung, label: "Bestellbestätigung" },
        { typ: "lieferschein", flag: b.hat_lieferschein, label: "Lieferschein" },
        { typ: "rechnung", flag: b.hat_rechnung, label: "Rechnung" },
        { typ: "versandbestaetigung", flag: b.hat_versandbestaetigung, label: "Versandbestätigung" },
      ];

      for (const dok of matDokTypen) {
        if (!dok.flag) continue;
        const artikel = TEST_ARTIKEL[i % TEST_ARTIKEL.length];
        await supabase.from("dokumente").insert({
          bestellung_id: bestellung.id,
          typ: dok.typ,
          quelle: "email",
          email_betreff: `${dok.label} ${b.bestellnummer}`,
          email_absender: `noreply@${b.haendler_name.toLowerCase().replace("ü", "ue")}.de`,
          email_datum: new Date(createdAt.getTime() + (dok.typ === "versandbestaetigung" ? 24 * 60 * 60 * 1000 : 0)).toISOString(),
          bestellnummer_erkannt: b.bestellnummer,
          artikel: dok.typ !== "versandbestaetigung" ? artikel : null,
          gesamtbetrag: dok.typ !== "versandbestaetigung" ? b.betrag : null,
          netto: dok.typ !== "versandbestaetigung" ? Math.round((b.betrag / 1.19) * 100) / 100 : null,
          mwst: dok.typ !== "versandbestaetigung" ? Math.round((b.betrag - b.betrag / 1.19) * 100) / 100 : null,
          faelligkeitsdatum: dok.typ === "rechnung"
            ? new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
        });
      }
    }

    // KI-Abgleich
    if (b.status === "vollstaendig" || b.status === "freigegeben") {
      await supabase.from("abgleiche").insert({
        bestellung_id: bestellung.id,
        status: "ok",
        abweichungen: [],
        ki_zusammenfassung: isSub
          ? "Rechnung und Leistungsnachweis stimmen überein. Aufmaß bestätigt die berechneten Flächen."
          : "Alle Dokumente stimmen überein. Artikelmengen, Preise und Gesamtbetrag sind konsistent.",
      });
    } else if (b.status === "abweichung") {
      await supabase.from("abgleiche").insert({
        bestellung_id: bestellung.id,
        status: "abweichung",
        abweichungen: [
          {
            feld: "menge",
            artikel: "Fischer Dübel SX 8x40 (200 St)",
            erwartet: 10,
            gefunden: 8,
            dokument: "lieferschein",
            schwere: "hoch",
          },
          {
            feld: "gesamtpreis",
            artikel: "Hilti HIT-HY 200-A Injektionsmörtel",
            erwartet: 360.0,
            gefunden: 405.0,
            dokument: "rechnung",
            schwere: "mittel",
          },
        ],
        ki_zusammenfassung:
          "Zwei Abweichungen gefunden: 1) Fischer Dübel – Lieferschein zeigt nur 8 statt 10 Packungen. 2) Hilti Injektionsmörtel – Rechnung weist 405,00 EUR statt 360,00 EUR aus (Preiserhöhung?).",
      });
    }

    // Freigabe
    if (b.status === "freigegeben") {
      await supabase.from("freigaben").insert({
        bestellung_id: bestellung.id,
        freigegeben_von_kuerzel: b.besteller_kuerzel,
        freigegeben_von_name: b.besteller_name,
        freigegeben_am: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Kommentare
    if (b.bestellnummer === "TEST-WU-004") {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "MT",
        autor_name: "Marlon Tschon",
        text: "Lieferant hat nur 8 Packungen Dübel geliefert, 2 waren nicht auf Lager. Nachlieferung wurde zugesagt.",
      });
    }
    if (b.bestellnummer === "TEST-BH-005") {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "CR",
        autor_name: "Carsten Reuter",
        text: "Lieferschein kam nur per Post, muss noch eingescannt werden.",
      });
    }
    if (b.bestellnummer === "TEST-SUB-009") {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "MT",
        autor_name: "Marlon Tschon",
        text: "Aufmaß vor Ort geprüft, Flächen stimmen. Leistungsnachweis für März vollständig.",
      });
    }
    if (b.bestellnummer === "TEST-UNB-011") {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "ADMIN",
        autor_name: "Admin",
        text: "Automatisch erstellt – konnte keinem Besteller zugeordnet werden. Bitte manuell zuordnen.",
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: `${erstellteIds.length} Testbestellungen, ${projektIds.length} Projekte und ${kundenIds.length} Kunden angelegt.`,
    count: erstellteIds.length,
  });
}

// =====================================================================
// Delete
// =====================================================================

async function deleteTestdaten(supabase: ReturnType<typeof createServiceClient>) {
  // Test-Bestellungen finden
  const { data: testBestellungen } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%");

  if (testBestellungen && testBestellungen.length > 0) {
    const ids = testBestellungen.map((b) => b.id);
    // Abhängige Tabellen zuerst löschen (FK-Reihenfolge)
    await supabase.from("webhook_logs").delete().in("bestellung_id", ids);
    await supabase.from("kommentare").delete().in("bestellung_id", ids);
    await supabase.from("freigaben").delete().in("bestellung_id", ids);
    await supabase.from("abgleiche").delete().in("bestellung_id", ids);
    await supabase.from("dokumente").delete().in("bestellung_id", ids);
    await supabase.from("bestellungen").delete().in("id", ids);
  }

  // Test-Projekte löschen
  await supabase.from("projekte").delete().like("name", "TEST %");

  // Test-Kunden löschen
  await supabase.from("kunden").delete().like("name", "TEST %");

  const count = testBestellungen?.length || 0;
  return NextResponse.json({
    success: true,
    message: `${count} Testbestellungen, Projekte und Kunden gelöscht.`,
    count,
  });
}
