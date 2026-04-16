import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardWidgets } from "@/components/dashboard-widgets";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

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
    { data: freigegebenBetraege },
    { data: letzteRaw },
    { data: aktionenNoetigRaw },
    { data: bestellerKuerzelListe },
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
  ] = await Promise.all([
    supabase.from("benutzer_rollen").select("dashboard_config").eq("user_id", profil.user_id).maybeSingle(),
    // 1 Query statt 6: alle Status-Werte holen und clientseitig zählen
    eigene(supabase.from("bestellungen").select("status")),
    eigene(supabase.from("bestellungen").select("betrag").eq("status", "freigegeben").not("betrag", "is", null)),
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").order("created_at", { ascending: false }).limit(5)),
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").in("status", ["abweichung", "ls_fehlt", "vollstaendig"]).order("created_at", { ascending: false }).limit(10)),
    createServiceClient().from("bestellungen").select("besteller_kuerzel"),
    supabase.from("bestellungen").select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at").eq("besteller_kuerzel", "UNBEKANNT").not("bestellungsart", "in", "(abo,subunternehmer)").order("created_at", { ascending: false }),
    supabase.from("projekte").select("id, name, farbe, budget, status").in("status", ["aktiv", "pausiert"]).order("name"),
    eigene(supabase.from("bestellungen").select("projekt_id, betrag, status").not("projekt_id", "is", null)),
    profil.rolle === "admin"
      ? supabase.from("benutzer_rollen").select("kuerzel, name").eq("rolle", "besteller")
      : Promise.resolve({ data: [] as { kuerzel: string; name: string }[] }),
    profil.rolle === "admin"
      ? supabase.from("haendler").select("id, name, domain, email_absender, created_at").is("confirmed_at", null).gte("created_at", siebenTageZurueck).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; domain: string; email_absender: string[]; created_at: string }[] }),
    profil.rolle === "admin"
      ? supabase.from("bestellungen")
          .select("id, bestellnummer, haendler_name, projekt_vorschlag_id, projekt_vorschlag_konfidenz, projekt_vorschlag_methode, projekt_vorschlag_begruendung, lieferadresse_erkannt")
          .is("projekt_id", null)
          .not("projekt_vorschlag_id", "is", null)
          .eq("projekt_bestaetigt", false)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { id: string; bestellnummer: string | null; haendler_name: string | null; projekt_vorschlag_id: string | null; projekt_vorschlag_konfidenz: number | null; projekt_vorschlag_methode: string | null; projekt_vorschlag_begruendung: string | null; lieferadresse_erkannt: string | null }[] }),
    profil.rolle === "admin"
      ? supabase.from("kunden").select("id, name, keywords, created_at").is("confirmed_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; keywords: string[] | null; created_at: string }[] }),
    profil.rolle === "admin"
      ? supabase.from("subunternehmer").select("id, firma, gewerk, email_absender").is("confirmed_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; firma: string; gewerk: string | null; email_absender: string[] }[] }),
    supabase.from("abo_anbieter").select("id, name, intervall, erwarteter_betrag, naechste_rechnung, vertragsende, kuendigungsfrist_tage, letzter_betrag"),
    // Mahnungen: Bestellungen mit mahnung_am die noch nicht bezahlt sind
    eigene(supabase.from("bestellungen").select("id, bestellnummer, haendler_name, betrag, mahnung_am").not("mahnung_am", "is", null).is("bezahlt_am", null).order("mahnung_am", { ascending: false })),
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

  const freigegebenBetrag = (freigegebenBetraege || []).reduce((sum: number, b: { betrag: number | null }) => sum + Number(b.betrag), 0);
  const gesamtVolumen = (projektBestellungen || []).reduce((s: number, b: { betrag: number | null }) => s + (Number(b.betrag) || 0), 0);

  const bestellerStatsMap: Record<string, number> = {};
  for (const b of bestellerKuerzelListe || []) {
    bestellerStatsMap[b.besteller_kuerzel] = (bestellerStatsMap[b.besteller_kuerzel] || 0) + 1;
  }

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

  // Stat-Daten als Array für den Client
  const statCards = [
    { id: "offen", label: "Offen", value: offen, color: "#2563eb", row: 1 },
    { id: "abweichungen", label: "Abweichungen", value: abweichungen, color: "#dc2626", alert: abweichungen > 0, row: 1 },
    { id: "ls_fehlt", label: "LS fehlt", value: lsFehlt, color: "#d97706", row: 1 },
    { id: "freigegeben", label: "Freigegeben", value: freigegeben, color: "#059669", row: 1 },
    // "erwartet" nicht mehr angezeigt — Extension-Signale erstellen keine Einträge mehr
    { id: "vollstaendig", label: "Vollständig", value: vollstaendig, color: "#16a34a", row: 2 },
    { id: "gesamt", label: "Gesamt", value: gesamtAnzahl, color: "#570006", row: 2 },
    { id: "aktive_projekte", label: "Aktive Projekte", value: (aktiveProjekte || []).length, color: "#7c3aed", row: 2 },
  ];

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Dashboard</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">Willkommen, {profil.name}.</p>
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
        bestellerStats={bestellerStatsMap}
        aboHinweise={aboHinweise}
        aboJaehrlicheKosten={aboJaehrlicheKosten}
        mahnungen={(mahnungenRoh || []) as { id: string; bestellnummer: string | null; haendler_name: string | null; betrag: number | null; mahnung_am: string }[]}
      />
    </div>
  );
}
