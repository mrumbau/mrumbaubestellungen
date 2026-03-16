import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BestelldetailClient } from "@/components/bestelldetail-client";
import { getStatusConfig } from "@/lib/status-config";

export default async function BestellungDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        <p className="text-[#c4c2bf] text-lg">Bestellung nicht gefunden.</p>
        <Link href="/bestellungen" className="mt-4 text-[#570006] hover:text-[#7a1a1f] text-sm font-medium transition-colors">
          Zurück zu Bestellungen
        </Link>
      </div>
    );
  }

  const { data: dokumente } = await supabase
    .from("dokumente")
    .select("*")
    .eq("bestellung_id", id)
    .order("created_at", { ascending: true });

  const { data: abgleich } = await supabase
    .from("abgleiche")
    .select("*")
    .eq("bestellung_id", id)
    .order("erstellt_am", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: kommentare } = await supabase
    .from("kommentare")
    .select("*")
    .eq("bestellung_id", id)
    .order("erstellt_am", { ascending: true });

  const { data: freigabe } = await supabase
    .from("freigaben")
    .select("*")
    .eq("bestellung_id", id)
    .maybeSingle();

  const statusConfig = getStatusConfig(bestellung.status);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <Link
        href="/bestellungen"
        className="flex items-center gap-2 text-[#9a9a9a] hover:text-[#570006] text-sm mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Zurück zu Bestellungen
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-headline text-xl text-[#1a1a1a] tracking-tight">
            Bestellung <span className="font-mono-amount">{bestellung.bestellnummer || "–"}</span>
          </h1>
          <p className="text-sm text-[#9a9a9a] mt-1">
            {bestellung.haendler_name || "–"} · {bestellung.besteller_name} ({bestellung.besteller_kuerzel}) · {new Date(bestellung.created_at).toLocaleDateString("de-DE")}
          </p>
        </div>
        <span className={`status-tag ${statusConfig.bg} ${statusConfig.text}`}>
          <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: statusConfig.color }} />
          {statusConfig.label}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <SummaryCard label="Betrag" value={bestellung.betrag ? `${Number(bestellung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"} mono />
        <SummaryCard label="Händler" value={bestellung.haendler_name || "–"} />
        <SummaryCard label="Besteller" value={bestellung.besteller_name} />
        <SummaryCard
          label="Dokumente"
          value={`${[bestellung.hat_bestellbestaetigung, bestellung.hat_lieferschein, bestellung.hat_rechnung].filter(Boolean).length} / 3`}
          valueColor={
            bestellung.hat_bestellbestaetigung && bestellung.hat_lieferschein && bestellung.hat_rechnung
              ? "text-green-600"
              : "text-amber-600"
          }
          mono
        />
      </div>

      {/* Artikel-Kategorien */}
      {bestellung.artikel_kategorien && Object.keys(bestellung.artikel_kategorien).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(bestellung.artikel_kategorien as Record<string, number>).map(([kat, anzahl]) => (
            <span key={kat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-[#570006]/5 text-[#570006]">
              {kat}
              <span className="bg-[#570006]/10 text-[#570006] rounded px-1.5 py-0.5 text-[10px] font-bold">{anzahl}</span>
            </span>
          ))}
        </div>
      )}

      {/* Split View */}
      <BestelldetailClient
        bestellung={bestellung}
        dokumente={dokumente || []}
        abgleich={abgleich}
        kommentare={kommentare || []}
        freigabe={freigabe}
        profil={profil}
      />
    </div>
  );
}

function SummaryCard({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">{label}</p>
      <p className={`text-lg font-bold mt-1 ${mono ? "font-mono-amount" : ""} ${valueColor || "text-[#1a1a1a]"}`}>{value}</p>
    </div>
  );
}
