import type React from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { DashboardUnzugeordnet } from "@/components/dashboard-unzugeordnet";
import { DashboardKiVorschlaege } from "@/components/dashboard-ki-vorschlaege";
import { DashboardNeueKunden } from "@/components/dashboard-neue-kunden";
import { DashboardNeueSubunternehmer } from "@/components/dashboard-neue-subunternehmer";
import { DashboardNeueHaendler } from "@/components/dashboard-neue-haendler";
import { PageHeaderCount } from "@/components/ui/page-header";

// 22.05.2026 — eigene /todo-Seite für die "Zu prüfen"-Widgets, die vorher
// im Dashboard hingen. Für JEDE Rolle sichtbar (User-Wunsch). Buchhaltung
// redirected auf /buchhaltung (kein Bezug zu Stammdaten-Pflege).
//
// Edge-Runtime + force-dynamic analog zu /dashboard. Nur 5 leichte Queries
// (kein KPI/Sparkline/Volumen-Heavy-Stuff) → Page lädt in ~500ms statt
// 3-5s wie das alte Dashboard.
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TodoPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  const supabase = await createServerSupabaseClient();

  const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Besteller scope: eigene Bestellungen + alle Abo/SU (Default-Pattern aus Dashboard).
  const istBesteller = profil.rolle === "besteller";
  const kuerzel = profil.kuerzel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function eigene(query: any) {
    return istBesteller
      ? query.or(`besteller_kuerzel.eq.${kuerzel},bestellungsart.in.(abo,subunternehmer)`)
      : query;
  }

  const [
    { data: unzugeordnetRaw },
    { data: kiVorschlaegeRoh },
    { data: neueKundenRoh },
    { data: neueSubunternehmerRoh },
    { data: neueHaendlerRoh },
    { data: aktiveProjekte },
    { data: bestellerRollen },
  ] = await Promise.all([
    // Nicht zugeordnet: alle Material-Bestellungen mit besteller_kuerzel='UNBEKANNT'.
    // Vorher admin-only — jetzt sieht JEDER alle. Operationsmodus "kollektives
    // Stammdaten-Aufräumen". Abo/SU sind per Definition nicht zuordenbar.
    supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, waehrung, status, bestellungsart, created_at",
      )
      .eq("besteller_kuerzel", "UNBEKANNT")
      .not("bestellungsart", "in", "(abo,subunternehmer)")
      .order("created_at", { ascending: false }),
    // KI-Projekt-Vorschläge — eigene scope für Besteller, alle für Admin
    eigene(
      supabase
        .from("bestellungen")
        .select(
          "id, bestellnummer, haendler_name, projekt_vorschlag_id, projekt_vorschlag_konfidenz, projekt_vorschlag_methode, projekt_vorschlag_begruendung, lieferadresse_erkannt",
        )
        .is("projekt_id", null)
        .not("projekt_vorschlag_id", "is", null)
        .eq("projekt_bestaetigt", false)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
    // Neue Kunden — alle unbestätigten
    supabase
      .from("kunden")
      .select("id, name, keywords, created_at")
      .is("confirmed_at", null)
      .order("created_at", { ascending: false }),
    // Neue Subunternehmer — alle unbestätigten
    supabase
      .from("subunternehmer")
      .select("id, firma, gewerk, email_absender")
      .is("confirmed_at", null)
      .order("created_at", { ascending: false }),
    // Neue Händler — letzte 7 Tage, noch nicht confirmed
    supabase
      .from("haendler")
      .select("id, name, domain, email_absender, created_at")
      .is("confirmed_at", null)
      .gte("created_at", siebenTageZurueck)
      .order("created_at", { ascending: false }),
    supabase
      .from("projekte")
      .select("id, name, farbe")
      .in("status", ["aktiv", "pausiert"])
      .order("name"),
    // Besteller-Liste für die Zuordnen-Buttons (alle Rollen brauchen die Liste)
    supabase.from("benutzer_rollen").select("kuerzel, name").eq("rolle", "besteller"),
  ]);

  type UnzugeordneteRow = React.ComponentProps<typeof DashboardUnzugeordnet>["bestellungen"][number];
  const unzugeordnet = (unzugeordnetRaw || []) as UnzugeordneteRow[];
  const bestellerListe = (bestellerRollen || []) as { kuerzel: string; name: string }[];

  // KI-Vorschläge mit Projekt-Namen/Farben anreichern (gleicher Pattern wie Dashboard)
  type KiVorschlagRaw = {
    id: string;
    bestellnummer: string | null;
    haendler_name: string | null;
    projekt_vorschlag_id: string | null;
    projekt_vorschlag_konfidenz: number | null;
    projekt_vorschlag_methode: string | null;
    projekt_vorschlag_begruendung: string | null;
    lieferadresse_erkannt: string | null;
  };
  const kiVorschlaege = ((kiVorschlaegeRoh || []) as KiVorschlagRaw[]).map((v) => {
    const projekt = (aktiveProjekte || []).find((p) => p.id === v.projekt_vorschlag_id);
    return {
      ...v,
      vorschlag_projekt_name: projekt?.name || null,
      vorschlag_projekt_farbe: projekt?.farbe || null,
    };
  });

  const neueKunden = (neueKundenRoh || []) as {
    id: string;
    name: string;
    keywords: string[] | null;
    created_at: string;
  }[];
  const neueSubunternehmer = (neueSubunternehmerRoh || []) as {
    id: string;
    firma: string;
    gewerk: string | null;
    email_absender: string[];
  }[];
  const neueHaendler = (neueHaendlerRoh || []) as {
    id: string;
    name: string;
    domain: string;
    email_absender: string[];
    created_at: string;
  }[];

  const totalCount =
    unzugeordnet.length +
    kiVorschlaege.length +
    neueKunden.length +
    neueSubunternehmer.length +
    neueHaendler.length;

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Todo</h1>
          <p className="text-foreground-subtle text-sm mt-1">
            Stammdaten und offene Zuordnungen — alle Rollen helfen mit.
          </p>
        </div>
        <PageHeaderCount count={totalCount} label="Eintrag" pluralLabel="Einträge" />
      </div>

      {totalCount === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-status-freigegeben-bg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-status-freigegeben"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-headline text-lg text-foreground mb-1">Alles erledigt</h2>
          <p className="text-foreground-subtle text-sm">
            Keine offenen Stammdaten- oder Zuordnungs-Aufgaben.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {unzugeordnet.length > 0 && (
            <DashboardUnzugeordnet bestellungen={unzugeordnet} besteller={bestellerListe} />
          )}
          {kiVorschlaege.length > 0 && <DashboardKiVorschlaege vorschlaege={kiVorschlaege} />}
          {neueKunden.length > 0 && <DashboardNeueKunden kunden={neueKunden} />}
          {neueSubunternehmer.length > 0 && (
            <DashboardNeueSubunternehmer subunternehmer={neueSubunternehmer} />
          )}
          {neueHaendler.length > 0 && <DashboardNeueHaendler haendler={neueHaendler} />}
        </div>
      )}
    </div>
  );
}
