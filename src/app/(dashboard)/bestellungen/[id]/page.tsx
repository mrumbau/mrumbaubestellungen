import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isValidUUID } from "@/lib/validation";
import { DetailHeader } from "./_components/detail-header";
import { BestelldetailShell } from "./_components/bestelldetail-shell";
import type {
  Abgleich,
  Bestellung,
  Dokument,
  Freigabe,
  Kommentar,
  ProjektOption,
  SubunternehmerInfo,
} from "./_components/types";

export const dynamic = "force-dynamic";

export default async function BestellungDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUUID(id)) notFound();

  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("*")
    .eq("id", id)
    .single();

  if (!bestellung) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-foreground-subtle text-[15px]">Bestellung nicht gefunden.</p>
        <Link
          href="/bestellungen"
          className="mt-4 text-brand hover:text-brand-light text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded"
        >
          Zurück zu Bestellungen
        </Link>
      </div>
    );
  }

  const [
    { data: dokumente },
    { data: abgleich },
    { data: kommentare },
    { data: freigabe },
    { data: projekte },
    { data: subunternehmerData },
  ] = await Promise.all([
    supabase
      .from("dokumente")
      .select(
        "id, typ, quelle, storage_pfad, email_betreff, email_absender, ki_roh_daten, bestellnummer_erkannt, artikel, gesamtbetrag, netto, mwst, faelligkeitsdatum, lieferdatum, iban, created_at",
      )
      .eq("bestellung_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("abgleiche")
      .select("id, status, abweichungen, ki_zusammenfassung, erstellt_am")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("kommentare")
      .select("id, autor_kuerzel, autor_name, text, erstellt_am")
      .eq("bestellung_id", id)
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("freigaben")
      .select("id, freigegeben_von_kuerzel, freigegeben_von_name, freigegeben_am, kommentar")
      .eq("bestellung_id", id)
      .maybeSingle(),
    supabase
      .from("projekte")
      .select("id, name, farbe, budget")
      .in("status", ["aktiv", "pausiert"])
      .order("name"),
    bestellung.subunternehmer_id
      ? supabase
          .from("subunternehmer")
          .select("id, firma, gewerk, ansprechpartner, telefon, email")
          .eq("id", bestellung.subunternehmer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="flex flex-col h-full">
      <DetailHeader
        bestellung={bestellung as Bestellung & {
          bestellnummer: string | null;
          haendler_name: string | null;
          besteller_name: string;
          betrag: number | null;
          betrag_ist_netto: boolean | null;
          waehrung: string | null;
          created_at: string;
          updated_at: string | null;
          artikel_kategorien: Record<string, number> | null;
        }}
        projekte={(projekte as ProjektOption[]) || []}
      />

      <BestelldetailShell
        bestellung={bestellung as Bestellung}
        dokumente={(dokumente as Dokument[]) || []}
        abgleich={(abgleich as Abgleich | null) ?? null}
        kommentare={(kommentare as Kommentar[]) || []}
        freigabe={(freigabe as Freigabe | null) ?? null}
        profil={profil}
        projekte={(projekte as ProjektOption[]) || []}
        subunternehmer={(subunternehmerData as SubunternehmerInfo | null) || undefined}
      />
    </div>
  );
}
