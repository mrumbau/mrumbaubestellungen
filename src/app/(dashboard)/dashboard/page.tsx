import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardWidgets } from "@/components/dashboard-widgets";
import { parseTimeRange, computeRangeBounds, sparklineBuckets } from "@/lib/time-range";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  // Defense-in-Depth: Buchhaltung hat kein Dashboard (Middleware redirected bereits,
  // aber Page-Guard schützt, falls Middleware-Config sich ändert)
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  // Zeitraum-Picker-State aus URL. Default 30d. Shareable Links via ?range=...
  const { range: rangeParam } = await searchParams;
  const range = parseTimeRange(rangeParam ?? null);
  const bounds = computeRangeBounds(range);

  const supabase = await createServerSupabaseClient();

  const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Besteller: nur eigene Bestellungen im Dashboard (RLS erlaubt auch freigegebene anderer)
  const istBesteller = profil!.rolle === "besteller";
  const kuerzel = profil!.kuerzel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function eigene(query: any) {
    // Besteller sehen eigene Material-Bestellungen + alle Abo/SU (Freigabe durch jeden möglich)
    return istBesteller ? query.or(`besteller_kuerzel.eq.${kuerzel},bestellungsart.in.(abo,subunternehmer)`) : query;
  }

  // Dashboard-Config + alle Daten parallel laden
  // 1 Query für alle Status-Counts statt 6 einzelne Count-Queries
  const [
    { data: profilRow },
    { data: alleStatusRaw },
    { data: letzteRaw },
    { data: aktionenNoetigRaw },
    { data: unzugeordnetRaw },
    { data: aktiveProjekte },
    { data: projektBestellungen },
    { data: bestellerRollen },
    { data: neueHaendlerRoh },
    { data: kiVorschlaegeRoh },
    { data: neueKundenRoh },
    { data: neueSubunternehmerRoh },
    { data: aboAnbieterRoh },
    { data: mahnungenRoh },
    { data: kiCacheRoh },
    { data: trendDataRoh },
  ] = await Promise.all([
    supabase.from("benutzer_rollen").select("dashboard_config").eq("user_id", profil.user_id).maybeSingle(),
    // 1 Query statt 6: alle Status-Werte holen und clientseitig zählen
    eigene(supabase.from("bestellungen").select("status")),
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").order("created_at", { ascending: false }).limit(5)),
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").in("status", ["abweichung", "ls_fehlt", "vollstaendig"]).order("created_at", { ascending: false }).limit(10)),
    supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").eq("besteller_kuerzel", "UNBEKANNT").not("bestellungsart", "in", "(abo,subunternehmer)").order("created_at", { ascending: false }),
    supabase.from("projekte").select("id, name, farbe, budget, status").in("status", ["aktiv", "pausiert"]).order("name"),
    eigene(supabase.from("bestellungen").select("projekt_id, betrag, status").not("projekt_id", "is", null)),
    profil.rolle === "admin"
      ? supabase.from("benutzer_rollen").select("kuerzel, name").eq("rolle", "besteller")
      : Promise.resolve({ data: [] as { kuerzel: string; name: string }[] }),
    // Neue Händler — fachliche Stammdaten-Pflege: beide Rollen sehen die 7-Tages-Liste
    supabase.from("haendler").select("id, name, domain, email_absender, created_at").is("confirmed_at", null).gte("created_at", siebenTageZurueck).order("created_at", { ascending: false }),
    // KI-Projekt-Vorschläge — Besteller sieht eigene + Abo/SU (via eigene()), Admin sieht alle.
    // Besteller dürfen für ihre Bestellungen selbst bestätigen (API nach P4.5 geöffnet).
    eigene(
      supabase.from("bestellungen")
        .select("id, bestellnummer, haendler_name, projekt_vorschlag_id, projekt_vorschlag_konfidenz, projekt_vorschlag_methode, projekt_vorschlag_begruendung, lieferadresse_erkannt")
        .is("projekt_id", null)
        .not("projekt_vorschlag_id", "is", null)
        .eq("projekt_bestaetigt", false)
        .order("created_at", { ascending: false })
        .limit(20)
    ),
    // Neue Kunden — Besteller (Firmeninhaber mit Domain-Wissen) sieht alle unbestätigten
    supabase.from("kunden").select("id, name, keywords, created_at").is("confirmed_at", null).order("created_at", { ascending: false }),
    // Neue Subunternehmer — gleich
    supabase.from("subunternehmer").select("id, firma, gewerk, email_absender").is("confirmed_at", null).order("created_at", { ascending: false }),
    supabase.from("abo_anbieter").select("id, name, intervall, erwarteter_betrag, naechste_rechnung, vertragsende, kuendigungsfrist_tage, letzter_betrag"),
    // Mahnungen: Bestellungen mit mahnung_am die noch nicht bezahlt sind
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, betrag, mahnung_am, mahnung_count").not("mahnung_am", "is", null).is("bezahlt_am", null).order("mahnung_am", { ascending: false })),
    // KI-Cache — beim Page-Load mit-laden, damit Zusammenfassung + Priorisierung
    // sofort sichtbar sind statt hinter Button versteckt. Upsert pro User+Typ.
    supabase.from("dashboard_ki_cache").select("typ, inhalt, generated_at").eq("user_id", profil.user_id),
    // Trend-Daten für Volumen-Sparkline + MoM-Delta — Fenster = aktueller Range + Vergleichs-Range,
    // damit MoM-Delta und Sparkline aus einer Query berechenbar sind. Role-scoped via eigene().
    // Bei ~hundert Bestellungen performant, keine DB-Aggregat-Funktion nötig.
    eigene(supabase.from("bestellungen").select("created_at, updated_at, betrag, status").gte("created_at", bounds.previousStart.toISOString())),
  ]);

  // Dashboard-Config aus DB
  const dashboardConfig = (profilRow?.dashboard_config as { stats?: Record<string, boolean>; widgets?: Record<string, boolean> }) || {};

  // Status-Counts aus einer Query berechnen (statt 6 einzelne)
  const statusCounts: Record<string, number> = {};
  for (const row of alleStatusRaw || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }
  const offen = statusCounts["offen"] ?? 0;
  const abweichungen = statusCounts["abweichung"] ?? 0;
  const lsFehlt = statusCounts["ls_fehlt"] ?? 0;
  const freigegeben = statusCounts["freigegeben"] ?? 0;
  const erwartet = 0; // nicht mehr verwendet
  const vollstaendig = statusCounts["vollstaendig"] ?? 0;
  const gesamtAnzahl = (alleStatusRaw || []).length;
  const letzte = letzteRaw || [];
  const aktionenNoetig = aktionenNoetigRaw || [];
  const unzugeordnet = unzugeordnetRaw || [];

  // ── Volumen + Sparkline + MoM-Delta aus Trend-Daten, gefiltert nach Zeitraum ──
  // Alle Werte sind range-scoped. Freigegebenes-Volumen = status=freigegeben im Range (nach updated_at).
  // Gesamt-Volumen = alle Bestellungen im Range (nach created_at).
  type TrendRow = { created_at: string; updated_at: string | null; betrag: number | null; status: string };
  const trendRows = (trendDataRoh || []) as TrendRow[];

  const rangeStartMs = bounds.start.getTime();
  const rangeEndMs = bounds.end.getTime();
  const prevStartMs = bounds.previousStart.getTime();
  const prevEndMs = bounds.previousEnd.getTime();

  let freigegebenBetrag = 0;
  let gesamtVolumen = 0;
  let freigegebenVor = 0;
  let gesamtVor = 0;

  // Sparkline-Buckets für aktuellen Range
  const buckets = sparklineBuckets(bounds);
  const gesamtSparkline = new Array(buckets.length).fill(0);
  const freigegebenSparkline = new Array(buckets.length).fill(0);

  for (const r of trendRows) {
    const betrag = Number(r.betrag) || 0;
    const createdMs = new Date(r.created_at).getTime();
    const updatedMs = r.updated_at ? new Date(r.updated_at).getTime() : null;

    // Gesamt-Volumen: nach created_at
    if (createdMs >= rangeStartMs && createdMs <= rangeEndMs) {
      gesamtVolumen += betrag;
      // Sparkline-Bucket
      for (let i = 0; i < buckets.length; i++) {
        if (createdMs >= buckets[i].start.getTime() && createdMs < buckets[i].end.getTime()) {
          gesamtSparkline[i] += betrag;
          break;
        }
      }
    } else if (createdMs >= prevStartMs && createdMs <= prevEndMs) {
      gesamtVor += betrag;
    }

    // Freigegeben: nach updated_at + status-Filter
    if (r.status === "freigegeben" && updatedMs !== null) {
      if (updatedMs >= rangeStartMs && updatedMs <= rangeEndMs) {
        freigegebenBetrag += betrag;
        for (let i = 0; i < buckets.length; i++) {
          if (updatedMs >= buckets[i].start.getTime() && updatedMs < buckets[i].end.getTime()) {
            freigegebenSparkline[i] += betrag;
            break;
          }
        }
      } else if (updatedMs >= prevStartMs && updatedMs <= prevEndMs) {
        freigegebenVor += betrag;
      }
    }
  }

  function vergleichsProzent(akt: number, vor: number): number | null {
    if (vor <= 0) return null;
    return ((akt - vor) / vor) * 100;
  }
  const gesamtMoM = vergleichsProzent(gesamtVolumen, gesamtVor);
  const freigegebenMoM = vergleichsProzent(freigegebenBetrag, freigegebenVor);

  const bestellerListe = bestellerRollen || [];
  const neueHaendler = (neueHaendlerRoh || []) as { id: string; name: string; domain: string; email_absender: string[]; created_at: string }[];
  const neueKunden = (neueKundenRoh || []) as { id: string; name: string; keywords: string[] | null; created_at: string }[];
  const neueSubunternehmer = (neueSubunternehmerRoh || []) as { id: string; firma: string; gewerk: string | null; email_absender: string[] }[];

  const kiVorschlaege = ((kiVorschlaegeRoh || []) as { id: string; bestellnummer: string | null; haendler_name: string | null; projekt_vorschlag_id: string | null; projekt_vorschlag_konfidenz: number | null; projekt_vorschlag_methode: string | null; projekt_vorschlag_begruendung: string | null; lieferadresse_erkannt: string | null }[]).map((v) => {
    const projekt = (aktiveProjekte || []).find((p) => p.id === v.projekt_vorschlag_id);
    return { ...v, vorschlag_projekt_name: projekt?.name || null, vorschlag_projekt_farbe: projekt?.farbe || null };
  });

  const projektStatsMap = new Map<string, { gesamt: number; offen: number; volumen: number }>();
  for (const b of projektBestellungen || []) {
    if (!b.projekt_id) continue;
    const s = projektStatsMap.get(b.projekt_id) || { gesamt: 0, offen: 0, volumen: 0 };
    s.gesamt++;
    if (["offen", "erwartet", "abweichung", "ls_fehlt", "vollstaendig"].includes(b.status)) s.offen++;
    s.volumen += Number(b.betrag) || 0;
    projektStatsMap.set(b.projekt_id, s);
  }
  const topProjekte = (aktiveProjekte || [])
    .map((p) => ({ ...p, stats: projektStatsMap.get(p.id) || { gesamt: 0, offen: 0, volumen: 0 } }))
    .sort((a, b) => b.stats.gesamt - a.stats.gesamt)
    .slice(0, 3);

  // Abo-Hinweise berechnen
  const aboAnbieter = (aboAnbieterRoh || []) as { id: string; name: string; intervall: string; erwarteter_betrag: number | null; naechste_rechnung: string | null; vertragsende: string | null; kuendigungsfrist_tage: number | null; letzter_betrag: number | null }[];
  const heute = new Date();
  const aboHinweise: { typ: "ueberfaellig" | "kuendigung" | "vertragsende"; name: string; detail: string; dringend: boolean }[] = [];
  let aboJaehrlicheKosten = 0;

  for (const abo of aboAnbieter) {
    // Jährliche Kosten berechnen (alle Intervalle auf Jahr hochrechnen)
    if (abo.erwarteter_betrag) {
      const multiplikator: Record<string, number> = { monatlich: 12, quartalsweise: 4, halbjaehrlich: 2, jaehrlich: 1 };
      aboJaehrlicheKosten += Number(abo.erwarteter_betrag) * (multiplikator[abo.intervall] || 1);
    }

    // Überfällige Rechnung (7 Tage Puffer)
    if (abo.naechste_rechnung) {
      const faellig = new Date(abo.naechste_rechnung);
      faellig.setDate(faellig.getDate() + 7);
      if (heute > faellig) {
        const tage = Math.ceil((heute.getTime() - new Date(abo.naechste_rechnung).getTime()) / 86400000);
        aboHinweise.push({ typ: "ueberfaellig", name: abo.name, detail: `Rechnung ${tage} Tage überfällig`, dringend: true });
      }
    }

    // Kündigungsfrist ODER Vertragsende (nicht beides, um Doppelmeldungen zu vermeiden)
    let hatKuendigungsHinweis = false;
    if (abo.kuendigungsfrist_tage && abo.vertragsende) {
      const frist = new Date(abo.vertragsende);
      frist.setDate(frist.getDate() - abo.kuendigungsfrist_tage);
      const tageUebrig = Math.ceil((frist.getTime() - heute.getTime()) / 86400000);
      if (tageUebrig <= 30 && tageUebrig > 0) {
        aboHinweise.push({ typ: "kuendigung", name: abo.name, detail: `Kündigungsfrist in ${tageUebrig} Tagen`, dringend: tageUebrig <= 7 });
        hatKuendigungsHinweis = true;
      } else if (tageUebrig <= 0) {
        aboHinweise.push({ typ: "kuendigung", name: abo.name, detail: "Kündigungsfrist abgelaufen!", dringend: true });
        hatKuendigungsHinweis = true;
      }
    }

    // Vertragsende nur anzeigen wenn KEIN Kündigungshinweis (sonst Dopplung)
    if (!hatKuendigungsHinweis && abo.vertragsende) {
      const tage = Math.ceil((new Date(abo.vertragsende).getTime() - heute.getTime()) / 86400000);
      if (tage <= 30 && tage > 0) {
        aboHinweise.push({ typ: "vertragsende", name: abo.name, detail: `Vertrag endet in ${tage} Tagen`, dringend: tage <= 7 });
      }
    }
  }

  // KI-Cache-Einträge nach typ aufteilen, damit Widgets direkt mit Initial-Daten rendern
  const kiCache = (kiCacheRoh || []) as { typ: string; inhalt: unknown; generated_at: string }[];
  const kiZusammenfassungCache = kiCache.find((e) => e.typ === "zusammenfassung") || null;
  const kiPriorisierungCache = kiCache.find((e) => e.typ === "priorisierung") || null;

  // Stat-Daten als Array für den Client.
  // Farben referenzieren Status-Tokens (globals.css) — Status-Pills sind die einzige Stelle
  // wo Farbe semantische Workflow-Bedeutung trägt. Gesamt + Aktive Projekte sind keine Status,
  // darum Brand-Rot (Identität) bzw. neutrales Grau (informativ).
  const statCards = [
    { id: "offen", label: "Offen", value: offen, color: "var(--status-offen)", row: 1 },
    { id: "abweichungen", label: "Abweichungen", value: abweichungen, color: "var(--status-abweichung)", alert: abweichungen > 0, row: 1 },
    { id: "ls_fehlt", label: "LS fehlt", value: lsFehlt, color: "var(--status-ls-fehlt)", row: 1 },
    { id: "freigegeben", label: "Freigegeben", value: freigegeben, color: "var(--status-freigegeben)", row: 1 },
    { id: "vollstaendig", label: "Vollständig", value: vollstaendig, color: "var(--status-vollstaendig)", row: 2 },
    { id: "gesamt", label: "Gesamt", value: gesamtAnzahl, color: "var(--mr-red)", row: 2 },
    { id: "aktive_projekte", label: "Aktive Projekte", value: (aktiveProjekte || []).length, color: "var(--text-secondary)", row: 2 },
  ];

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Dashboard</h1>
          <p className="text-foreground-subtle text-sm mt-1">Willkommen, {profil.name}.</p>
        </div>
        <div className="hidden md:block">
          <svg width="48" height="32" viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-[0.08]">
            <line x1="0" y1="31" x2="48" y2="31" stroke="#570006" strokeWidth="1" />
            <line x1="47" y1="0" x2="47" y2="32" stroke="#570006" strokeWidth="1" />
            <line x1="40" y1="31" x2="48" y2="23" stroke="#570006" strokeWidth="0.75" />
            <rect x="44" y="28" width="3" height="3" fill="#570006" opacity="0.5" />
          </svg>
        </div>
      </div>

      <DashboardWidgets
        savedConfig={dashboardConfig}
        statCards={statCards}
        freigegebenBetrag={freigegebenBetrag}
        gesamtVolumen={gesamtVolumen}
        topProjekte={topProjekte}
        isAdmin={profil.rolle === "admin"}
        kiVorschlaege={kiVorschlaege}
        neueKunden={neueKunden}
        unzugeordnet={unzugeordnet}
        bestellerListe={bestellerListe}
        neueHaendler={neueHaendler}
        neueSubunternehmer={neueSubunternehmer}
        aktionenNoetig={aktionenNoetig}
        letzte={letzte}
        aboHinweise={aboHinweise}
        aboJaehrlicheKosten={aboJaehrlicheKosten}
        mahnungen={(mahnungenRoh || []) as { id: string; bestellnummer: string | null; haendler_name: string | null; betrag: number | null; mahnung_am: string; mahnung_count?: number }[]}
        kiZusammenfassungCache={kiZusammenfassungCache}
        kiPriorisierungCache={kiPriorisierungCache}
        volumenTrend={{
          freigegebenSparkline,
          gesamtSparkline,
          freigegebenMoM,
          gesamtMoM,
          rangeLabel: bounds.label,
        }}
        range={range}
      />
    </div>
  );
}
