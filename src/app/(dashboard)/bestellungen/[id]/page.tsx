import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BestelldetailClient } from "@/components/bestelldetail-client";
import { getStatusConfig } from "@/lib/status-config";

function relativeZeit(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  const wochen = Math.floor(tage / 7);
  if (wochen === 1) return "vor 1 Woche";
  if (wochen < 5) return `vor ${wochen} Wochen`;
  const monate = Math.floor(tage / 30);
  if (monate === 1) return "vor 1 Monat";
  if (monate < 12) return `vor ${monate} Monaten`;
  return `vor ${Math.floor(monate / 12)} Jahr(en)`;
}

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

  // Alle 5 Queries parallel — keine Abhängigkeiten untereinander
  const [
    { data: dokumente },
    { data: abgleich },
    { data: kommentare },
    { data: freigabe },
    { data: projekte },
  ] = await Promise.all([
    supabase.from("dokumente").select("*").eq("bestellung_id", id).order("created_at", { ascending: true }),
    supabase.from("abgleiche").select("*").eq("bestellung_id", id).order("erstellt_am", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("kommentare").select("*").eq("bestellung_id", id).order("erstellt_am", { ascending: true }),
    supabase.from("freigaben").select("*").eq("bestellung_id", id).maybeSingle(),
    supabase.from("projekte").select("id, name, farbe, budget").in("status", ["aktiv", "pausiert"]).order("name"),
  ]);

  const statusConfig = getStatusConfig(bestellung.status);
  const dokCount = [bestellung.hat_bestellbestaetigung, bestellung.hat_lieferschein, bestellung.hat_rechnung].filter(Boolean).length;
  const projektFarbe = bestellung.projekt_id ? (projekte || []).find((p) => p.id === bestellung.projekt_id)?.farbe : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <Link
        href="/bestellungen"
        className="flex items-center gap-2 text-[#9a9a9a] hover:text-[#570006] text-sm mb-4 transition-colors w-fit"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Bestellungen
      </Link>

      {/* Header — Redesigned */}
      <div className="card p-5 mb-5 relative overflow-hidden" style={projektFarbe ? { borderLeft: `4px solid ${projektFarbe}` } : undefined}>
        {/* Subtle gradient overlay */}
        <div className="absolute top-0 right-0 w-48 h-full opacity-[0.03]" style={{ background: `linear-gradient(270deg, ${statusConfig.color}, transparent)` }} />

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 relative">
          {/* Left: Title + Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-headline text-xl text-[#1a1a1a] tracking-tight">
                {bestellung.bestellnummer || "Ohne Nr."}
              </h1>
              <span className={`status-tag ${statusConfig.bg} ${statusConfig.text}`}>
                <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: statusConfig.color }} />
                {statusConfig.label}
              </span>
            </div>

            {/* Compact meta line */}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-[#9a9a9a]">
              {/* Händler */}
              <span className="inline-flex items-center gap-1.5 font-medium text-[#6b6b6b]">
                <svg className="w-3.5 h-3.5 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
                </svg>
                {bestellung.haendler_name || "–"}
              </span>
              <span className="text-[#e0dedb]">·</span>

              {/* Besteller Avatar + Name */}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-[#570006] text-white flex items-center justify-center text-[8px] font-bold shrink-0">
                  {bestellung.besteller_kuerzel}
                </span>
                <span className="text-[#6b6b6b]">{bestellung.besteller_name}</span>
              </span>
              <span className="text-[#e0dedb]">·</span>

              {/* Dokument-Count */}
              <span className={`inline-flex items-center gap-1 font-medium ${dokCount === 3 ? "text-green-600" : "text-amber-600"}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {dokCount}/3
              </span>
              <span className="text-[#e0dedb]">·</span>

              {/* Relative time */}
              <span
                className="cursor-default"
                title={new Date(bestellung.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              >
                {relativeZeit(bestellung.created_at)}
              </span>
              {bestellung.updated_at && bestellung.updated_at !== bestellung.created_at && (
                <>
                  <span className="text-[#e0dedb]">·</span>
                  <span
                    className="cursor-default text-[#c4c2bf]"
                    title={`Aktualisiert: ${new Date(bestellung.updated_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  >
                    aktualisiert {relativeZeit(bestellung.updated_at)}
                  </span>
                </>
              )}
            </div>

            {/* Projekt-Tag */}
            {bestellung.projekt_name && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#f5f4f2] text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: projektFarbe || "#570006" }} />
                <span className="font-medium text-[#1a1a1a]">{bestellung.projekt_name}</span>
              </div>
            )}
          </div>

          {/* Right: Betrag prominent */}
          <div className="flex flex-col items-end shrink-0">
            <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">Betrag</p>
            <p className="text-2xl font-bold font-mono-amount text-[#1a1a1a] mt-0.5">
              {bestellung.betrag
                ? `${Number(bestellung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                : "–"}
            </p>
            {bestellung.waehrung && bestellung.waehrung !== "EUR" && (
              <p className="text-[10px] text-[#c4c2bf] font-mono-amount">{bestellung.waehrung}</p>
            )}
          </div>
        </div>
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
        projekte={projekte || []}
      />
    </div>
  );
}
