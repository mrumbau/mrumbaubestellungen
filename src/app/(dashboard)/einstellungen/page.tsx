import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EinstellungenClient } from "@/components/einstellungen-client";
import { PasswortAendern } from "@/components/passwort-aendern";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  // Buchhaltung: nur Passwort ändern anzeigen
  if (profil.rolle === "buchhaltung") {
    return (
      <div className="p-6 md:p-10 max-w-2xl">
        <h1 className="text-2xl font-headline font-bold text-[#1a1a1a] mb-8">Einstellungen</h1>
        <PasswortAendern />
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();

  // Besteller: nur Projekte, Kunden + Passwort
  if (profil.rolle === "besteller") {
    const [{ data: projekte }, { data: kunden }] = await Promise.all([
      supabase
        .from("projekte")
        .select("id, name, farbe, budget, status, beschreibung, kunde, adresse, adresse_keywords")
        .order("name"),
      supabase
        .from("kunden")
        .select("*")
        .order("name"),
    ]);

    return (
      <EinstellungenClient
        haendler={[]}
        benutzer={[]}
        hatTestdaten={false}
        haendlerStats={{}}
        extensionSignale={{}}
        webhookLogs={[]}
        projekte={(projekte || []) as { id: string; name: string; farbe: string; budget: number | null; status: string; beschreibung: string | null; kunde: string | null; adresse: string | null; adresse_keywords: string[] | null }[]}
        kunden={(kunden || []) as { id: string; name: string; kuerzel: string | null; adresse: string | null; email: string | null; telefon: string | null; notizen: string | null; keywords: string[]; farbe: string; confirmed_at: string | null; created_at: string }[]}
        rolle="besteller"
      />
    );
  }

  // Admin: alles laden
  const [
    { data: haendler },
    { data: benutzer },
    { data: testCheck },
    { data: haendlerStats },
    { data: extensionSignale },
    { data: webhookLogs },
    { data: projekte },
    { data: kunden },
    { data: firmaEinstellungen },
  ] = await Promise.all([
    supabase.from("haendler").select("*").order("name", { ascending: true }),
    supabase.from("benutzer_rollen").select("id, email, name, kuerzel, rolle").order("name", { ascending: true }),
    supabase.from("bestellungen").select("id").like("bestellnummer", "TEST-%").limit(1),
    supabase.from("bestellungen").select("haendler_name, status, created_at"),
    supabase
      .from("bestellung_signale")
      .select("kuerzel, zeitstempel")
      .order("zeitstempel", { ascending: false }),
    supabase
      .from("webhook_logs")
      .select("id, typ, status, bestellnummer, fehler_text, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("projekte")
      .select("id, name, farbe, budget, status, beschreibung, kunde, adresse, adresse_keywords")
      .order("name"),
    supabase
      .from("kunden")
      .select("*")
      .order("name"),
    supabase
      .from("firma_einstellungen")
      .select("schluessel, wert"),
  ]);

  const statsMap: Record<string, { gesamt: number; letzte: string | null; abweichungen: number }> = {};
  for (const b of haendlerStats || []) {
    if (!b.haendler_name) continue;
    if (!statsMap[b.haendler_name]) {
      statsMap[b.haendler_name] = { gesamt: 0, letzte: null, abweichungen: 0 };
    }
    statsMap[b.haendler_name].gesamt++;
    if (b.status === "abweichung") statsMap[b.haendler_name].abweichungen++;
    if (!statsMap[b.haendler_name].letzte || b.created_at > statsMap[b.haendler_name].letzte!) {
      statsMap[b.haendler_name].letzte = b.created_at;
    }
  }

  const signalMap: Record<string, string> = {};
  for (const s of extensionSignale || []) {
    if (!signalMap[s.kuerzel]) {
      signalMap[s.kuerzel] = s.zeitstempel;
    }
  }

  return (
    <EinstellungenClient
      haendler={haendler || []}
      benutzer={benutzer || []}
      hatTestdaten={!!testCheck && testCheck.length > 0}
      haendlerStats={statsMap}
      extensionSignale={signalMap}
      webhookLogs={(webhookLogs || []) as { id: string; typ: string; status: string; bestellnummer: string | null; fehler_text: string | null; created_at: string }[]}
      projekte={(projekte || []) as { id: string; name: string; farbe: string; budget: number | null; status: string; beschreibung: string | null; kunde: string | null; adresse: string | null; adresse_keywords: string[] | null }[]}
      kunden={(kunden || []) as { id: string; name: string; kuerzel: string | null; adresse: string | null; email: string | null; telefon: string | null; notizen: string | null; keywords: string[]; farbe: string; confirmed_at: string | null; created_at: string }[]}
      firmaEinstellungen={(firmaEinstellungen || []) as { schluessel: string; wert: string }[]}
      rolle="admin"
    />
  );
}
