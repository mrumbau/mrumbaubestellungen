import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BestelldetailClient } from "@/components/bestelldetail-client";

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
        <p className="text-slate-400 text-lg">Bestellung nicht gefunden.</p>
        <Link href="/bestellungen" className="mt-4 text-[#1E4D8C] hover:underline text-sm">
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

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <Link
        href="/bestellungen"
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Zurück zu Bestellungen
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Bestellung {bestellung.bestellnummer || "–"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {bestellung.haendler_name || "–"} · {bestellung.besteller_name} ({bestellung.besteller_kuerzel}) · {new Date(bestellung.created_at).toLocaleDateString("de-DE")}
          </p>
        </div>
        <StatusBadge status={bestellung.status} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <SummaryCard label="Betrag" value={bestellung.betrag ? `${Number(bestellung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"} />
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
        />
      </div>

      {/* Artikel-Kategorien (wenn vorhanden) */}
      {bestellung.artikel_kategorien && Object.keys(bestellung.artikel_kategorien).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(bestellung.artikel_kategorien as Record<string, number>).map(([kat, anzahl]) => (
            <span key={kat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
              {kat}
              <span className="bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{anzahl}</span>
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    erwartet: { label: "Erwartet", bg: "bg-slate-100", text: "text-slate-600" },
    offen: { label: "Offen", bg: "bg-blue-50", text: "text-blue-700" },
    vollstaendig: { label: "Vollständig", bg: "bg-green-50", text: "text-green-700" },
    abweichung: { label: "Abweichung", bg: "bg-red-50", text: "text-red-700" },
    ls_fehlt: { label: "LS fehlt", bg: "bg-yellow-50", text: "text-yellow-700" },
    freigegeben: { label: "Freigegeben", bg: "bg-emerald-50", text: "text-emerald-700" },
  };
  const s = config[status] || config.offen;
  return (
    <span className={`inline-flex px-3.5 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function SummaryCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500 tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${valueColor || "text-slate-900"}`}>{value}</p>
    </div>
  );
}
