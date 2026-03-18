import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

const TESTBESTELLUNGEN = [
  {
    bestellnummer: "TEST-BH-001",
    haendler_name: "Bauhaus",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 347.85,
    status: "vollstaendig",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
  },
  {
    bestellnummer: "TEST-OBI-002",
    haendler_name: "OBI",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 1289.5,
    status: "offen",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: false,
  },
  {
    bestellnummer: "TEST-AMZ-003",
    haendler_name: "Amazon",
    besteller_kuerzel: "MH",
    besteller_name: "Mohammed Hawrami",
    betrag: 89.99,
    status: "freigegeben",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
  },
  {
    bestellnummer: "TEST-WU-004",
    haendler_name: "Würth",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 2450.0,
    status: "abweichung",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
  },
  {
    bestellnummer: "TEST-BH-005",
    haendler_name: "Bauhaus",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 156.3,
    status: "ls_fehlt",
    hat_bestellbestaetigung: true,
    hat_lieferschein: false,
    hat_rechnung: true,
  },
  {
    bestellnummer: "TEST-OBI-006",
    haendler_name: "OBI",
    besteller_kuerzel: "MH",
    besteller_name: "Mohammed Hawrami",
    betrag: 534.2,
    status: "erwartet",
    hat_bestellbestaetigung: false,
    hat_lieferschein: false,
    hat_rechnung: false,
  },
  {
    bestellnummer: "TEST-AMZ-007",
    haendler_name: "Amazon",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 42.5,
    status: "vollstaendig",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
  },
  {
    bestellnummer: "TEST-WU-008",
    haendler_name: "Würth",
    besteller_kuerzel: "CR",
    besteller_name: "Carsten Reuter",
    betrag: 780.0,
    status: "freigegeben",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
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

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    // Admin-Check
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
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

async function createTestdaten(supabase: ReturnType<typeof createServiceClient>) {
  // Prüfe ob schon Testdaten vorhanden
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
  const erstellteIds: string[] = [];

  for (let i = 0; i < TESTBESTELLUNGEN.length; i++) {
    const b = TESTBESTELLUNGEN[i];
    // Verschiedene Zeitstempel für realistische Darstellung
    const createdAt = new Date(now.getTime() - (TESTBESTELLUNGEN.length - i) * 2 * 24 * 60 * 60 * 1000);

    const { data: bestellung, error } = await supabase
      .from("bestellungen")
      .insert({
        ...b,
        waehrung: "EUR",
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      })
      .select("id")
      .single();

    if (error || !bestellung) {
      console.error("Fehler bei Bestellung:", error);
      continue;
    }

    erstellteIds.push(bestellung.id);

    // Dokumente anlegen basierend auf Flags
    const dokTypen: { typ: string; flag: boolean }[] = [
      { typ: "bestellbestaetigung", flag: b.hat_bestellbestaetigung },
      { typ: "lieferschein", flag: b.hat_lieferschein },
      { typ: "rechnung", flag: b.hat_rechnung },
    ];

    for (const dok of dokTypen) {
      if (!dok.flag) continue;

      await supabase.from("dokumente").insert({
        bestellung_id: bestellung.id,
        typ: dok.typ,
        quelle: "email",
        email_betreff: `${dok.typ === "rechnung" ? "Rechnung" : dok.typ === "lieferschein" ? "Lieferschein" : "Bestellbestätigung"} ${b.bestellnummer}`,
        email_absender: `noreply@${b.haendler_name.toLowerCase().replace("ü", "ue")}.de`,
        email_datum: createdAt.toISOString(),
        bestellnummer_erkannt: b.bestellnummer,
        artikel: TEST_ARTIKEL[i % TEST_ARTIKEL.length],
        gesamtbetrag: b.betrag,
        netto: Math.round(b.betrag / 1.19 * 100) / 100,
        mwst: Math.round((b.betrag - b.betrag / 1.19) * 100) / 100,
        faelligkeitsdatum: dok.typ === "rechnung"
          ? new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : null,
      });
    }

    // KI-Abgleich für vollständige und abweichende Bestellungen
    if (b.status === "vollstaendig" || b.status === "freigegeben") {
      await supabase.from("abgleiche").insert({
        bestellung_id: bestellung.id,
        status: "ok",
        abweichungen: [],
        ki_zusammenfassung: "Alle drei Dokumente stimmen überein. Artikelmengen, Preise und Gesamtbetrag sind konsistent.",
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

    // Freigabe für freigegebene Bestellungen
    if (b.status === "freigegeben") {
      await supabase.from("freigaben").insert({
        bestellung_id: bestellung.id,
        freigegeben_von_kuerzel: b.besteller_kuerzel,
        freigegeben_von_name: b.besteller_name,
        freigegeben_am: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Kommentare für einige Bestellungen
    if (i === 3) {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "MT",
        autor_name: "Marlon Tschon",
        text: "Lieferant hat nur 8 Packungen Dübel geliefert, 2 waren nicht auf Lager. Nachlieferung wurde zugesagt.",
      });
    }
    if (i === 4) {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellung.id,
        autor_kuerzel: "CR",
        autor_name: "Carsten Reuter",
        text: "Lieferschein kam nur per Post, muss noch eingescannt werden.",
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: `${erstellteIds.length} Testbestellungen mit Dokumenten, Abgleichen und Kommentaren angelegt.`,
    count: erstellteIds.length,
  });
}

async function deleteTestdaten(supabase: ReturnType<typeof createServiceClient>) {
  // Finde alle Test-Bestellungen
  const { data: testBestellungen } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%");

  if (!testBestellungen || testBestellungen.length === 0) {
    return NextResponse.json(
      { error: "Keine Testdaten vorhanden." },
      { status: 400 }
    );
  }

  const ids = testBestellungen.map((b) => b.id);

  // Abhängige Tabellen zuerst löschen
  await supabase.from("kommentare").delete().in("bestellung_id", ids);
  await supabase.from("freigaben").delete().in("bestellung_id", ids);
  await supabase.from("abgleiche").delete().in("bestellung_id", ids);
  await supabase.from("dokumente").delete().in("bestellung_id", ids);
  await supabase.from("bestellungen").delete().in("id", ids);

  return NextResponse.json({
    success: true,
    message: `${ids.length} Testbestellungen und alle zugehörigen Daten gelöscht.`,
    count: ids.length,
  });
}
