import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardKIZusammenfassung } from "@/components/dashboard-ki";
import { DashboardPriorisierung } from "@/components/dashboard-priorisierung";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";

export default async function DashboardPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const alle = bestellungen || [];

  const offen = alle.filter((b) => b.status === "offen").length;
  const abweichungen = alle.filter((b) => b.status === "abweichung").length;
  const lsFehlt = alle.filter((b) => b.status === "ls_fehlt").length;
  const freigegeben = alle.filter((b) => b.status === "freigegeben").length;
  const erwartet = alle.filter((b) => b.status === "erwartet").length;
  const vollstaendig = alle.filter((b) => b.status === "vollstaendig").length;

  const freigegebenBetrag = alle
    .filter((b) => b.status === "freigegeben" && b.betrag)
    .reduce((sum, b) => sum + Number(b.betrag), 0);

  const letzte = alle.slice(0, 5);

  const bestellerStats = new Map<string, number>();
  for (const b of alle) {
    bestellerStats.set(b.besteller_kuerzel, (bestellerStats.get(b.besteller_kuerzel) || 0) + 1);
  }

  const aktionenNoetig = alle.filter(
    (b) => b.status === "abweichung" || b.status === "ls_fehlt" || b.status === "vollstaendig"
  );

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Dashboard</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">Willkommen, {profil.name}.</p>
        </div>
        {/* Industrial corner ornament */}
        <div className="hidden md:block">
          <svg width="48" height="32" viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-[0.08]">
            <line x1="0" y1="31" x2="48" y2="31" stroke="#570006" strokeWidth="1" />
            <line x1="47" y1="0" x2="47" y2="32" stroke="#570006" strokeWidth="1" />
            <line x1="40" y1="31" x2="48" y2="23" stroke="#570006" strokeWidth="0.75" />
            <rect x="44" y="28" width="3" height="3" fill="#570006" opacity="0.5" />
          </svg>
        </div>
      </div>

      <DashboardKIZusammenfassung />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Offen" value={offen} color="#2563eb" />
        <StatCard label="Abweichungen" value={abweichungen} color="#dc2626" alert={abweichungen > 0} />
        <StatCard label="LS fehlt" value={lsFehlt} color="#d97706" />
        <StatCard label="Freigegeben" value={freigegeben} color="#059669" />
      </div>

      {/* Industrielle Akzentlinie */}
      <div className="industrial-line my-4" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Erwartet" value={erwartet} color="#8b8b8b" />
        <StatCard label="Vollständig" value={vollstaendig} color="#16a34a" />
        <StatCard label="Gesamt" value={alle.length} color="#570006" />
        <div className="card card-hover p-5">
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">Freigegebenes Volumen</p>
          <p className="font-mono-amount text-xl font-bold text-[#1a1a1a] mt-2">{formatBetrag(freigegebenBetrag)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="card p-5 border-l-[3px] border-l-[#dc2626] corner-marks">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Aktion erforderlich</h2>
            {aktionenNoetig.length > 0 && (
              <span className="font-mono-amount text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                {aktionenNoetig.length}
              </span>
            )}
          </div>
          {aktionenNoetig.length === 0 ? (
            <p className="text-sm text-[#c4c2bf] py-4 text-center">Keine offenen Aktionen.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {aktionenNoetig.slice(0, 10).map((b) => {
                const s = getStatusConfig(b.status);
                return (
                  <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#fafaf9] hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-3">
                      <AktionIcon status={b.status} />
                      <div>
                        <p className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#570006] transition-colors">
                          <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                          <span className="text-[#9a9a9a] font-normal"> – {b.haendler_name || "–"}</span>
                        </p>
                        <p className="text-[11px] text-[#c4c2bf]">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                      </div>
                    </div>
                    <span className={`status-tag ${s.bg} ${s.text}`}>
                      <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                      {s.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Letzte Bestellungen</h2>
            <Link href="/bestellungen" className="text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors">Alle anzeigen</Link>
          </div>
          {letzte.length === 0 ? (
            <p className="text-sm text-[#c4c2bf] py-4 text-center">Noch keine Bestellungen.</p>
          ) : (
            <div className="space-y-1">
              {letzte.map((b) => {
                const s = getStatusConfig(b.status);
                return (
                  <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#fafaf9] hover:shadow-sm transition-all group">
                    <div>
                      <p className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#570006] transition-colors">
                        <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                        <span className="text-[#9a9a9a] font-normal"> – {b.haendler_name || "–"}</span>
                      </p>
                      <p className="text-[11px] text-[#c4c2bf]">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {b.betrag && (
                        <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">{formatBetrag(b.betrag, b.waehrung || "EUR")}</span>
                      )}
                      <span className={`status-tag ${s.bg} ${s.text}`}>
                        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                        {s.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <DashboardPriorisierung />
      </div>

      {bestellerStats.size > 0 && (
        <div className="card p-5 mt-6">
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-4">Bestellungen pro Besteller</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from(bestellerStats.entries()).map(([kuerzel, count]) => (
              <div key={kuerzel} className="flex items-center gap-3 p-3 rounded-lg bg-[#fafaf9] border border-[#f0eeeb]">
                <div className="w-9 h-9 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[11px] font-bold">{kuerzel}</div>
                <div>
                  <p className="font-mono-amount text-lg font-bold text-[#1a1a1a]">{count}</p>
                  <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">Bestellungen</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      {/* Dezenter Gradient-Schimmer oben */}
      <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">{label}</p>
      <div className="flex items-end justify-between mt-2 relative">
        <p className={`font-mono-amount text-3xl font-bold text-[#1a1a1a] ${alert ? "text-red-600" : ""}`}>{value}</p>
        {alert && value > 0 && (
          <span className="pulse-urgent w-2 h-2 rounded-full bg-red-500 mb-2" />
        )}
      </div>
    </div>
  );
}

function AktionIcon({ status }: { status: string }) {
  if (status === "abweichung") {
    return (
      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (status === "ls_fehlt") {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}
