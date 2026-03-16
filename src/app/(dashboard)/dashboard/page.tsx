import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardKIZusammenfassung } from "@/components/dashboard-ki";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";

export default async function DashboardPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  // Neueste 100 Bestellungen laden (Performance-Limit)
  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const alle = bestellungen || [];

  // Statistiken berechnen
  const offen = alle.filter((b) => b.status === "offen").length;
  const abweichungen = alle.filter((b) => b.status === "abweichung").length;
  const lsFehlt = alle.filter((b) => b.status === "ls_fehlt").length;
  const freigegeben = alle.filter((b) => b.status === "freigegeben").length;
  const erwartet = alle.filter((b) => b.status === "erwartet").length;
  const vollstaendig = alle.filter((b) => b.status === "vollstaendig").length;

  // Gesamt-Volumen freigegebener Rechnungen
  const freigegebenBetrag = alle
    .filter((b) => b.status === "freigegeben" && b.betrag)
    .reduce((sum, b) => sum + Number(b.betrag), 0);

  // Letzte 5 Bestellungen
  const letzte = alle.slice(0, 5);

  // Besteller-Statistik
  const bestellerStats = new Map<string, number>();
  for (const b of alle) {
    bestellerStats.set(b.besteller_kuerzel, (bestellerStats.get(b.besteller_kuerzel) || 0) + 1);
  }

  // Aktionen nötig
  const aktionenNoetig = alle.filter(
    (b) => b.status === "abweichung" || b.status === "ls_fehlt" || b.status === "vollstaendig"
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Willkommen, {profil.name}. Hier ist deine Übersicht.
        </p>
      </div>

      {/* KI-Zusammenfassung */}
      <DashboardKIZusammenfassung />

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Offen" value={offen} color="bg-blue-50 text-blue-700" />
        <StatCard label="Abweichungen" value={abweichungen} color="bg-red-50 text-red-700" />
        <StatCard label="LS fehlt" value={lsFehlt} color="bg-yellow-50 text-yellow-700" />
        <StatCard label="Freigegeben" value={freigegeben} color="bg-green-50 text-green-700" />
      </div>

      {/* Zweite Reihe */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <StatCard label="Erwartet" value={erwartet} color="bg-slate-50 text-slate-600" />
        <StatCard label="Vollständig" value={vollstaendig} color="bg-emerald-50 text-emerald-700" />
        <StatCard label="Gesamt" value={alle.length} color="bg-indigo-50 text-indigo-700" />
        <div className="rounded-xl p-5 bg-white border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 tracking-wide">Freigegebenes Volumen</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {formatBetrag(freigegebenBetrag)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Aktionen nötig */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Aktion erforderlich</h2>
          {aktionenNoetig.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Keine offenen Aktionen.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {aktionenNoetig.slice(0, 10).map((b) => (
                <Link
                  key={b.id}
                  href={`/bestellungen/${b.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <AktionIcon status={b.status} />
                    <div>
                      <p className="text-sm font-medium text-slate-900 group-hover:text-[#1E4D8C]">
                        {b.bestellnummer || "Ohne Nr."} – {b.haendler_name || "–"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.besteller_name} · {formatDatum(b.created_at)}
                      </p>
                    </div>
                  </div>
                  <StatusBadgeMini status={b.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Letzte Bestellungen */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Letzte Bestellungen</h2>
            <Link href="/bestellungen" className="text-xs text-[#1E4D8C] hover:underline">
              Alle anzeigen
            </Link>
          </div>
          {letzte.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Noch keine Bestellungen.</p>
          ) : (
            <div className="space-y-2">
              {letzte.map((b) => (
                <Link
                  key={b.id}
                  href={`/bestellungen/${b.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 group-hover:text-[#1E4D8C]">
                      {b.bestellnummer || "Ohne Nr."} – {b.haendler_name || "–"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {b.besteller_name} · {formatDatum(b.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {b.betrag && (
                      <span className="text-sm font-semibold text-slate-700">
                        {formatBetrag(b.betrag, b.waehrung || "EUR")}
                      </span>
                    )}
                    <StatusBadgeMini status={b.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Besteller-Übersicht */}
      {bestellerStats.size > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Bestellungen pro Besteller</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from(bestellerStats.entries()).map(([kuerzel, count]) => (
              <div key={kuerzel} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1E4D8C] text-white flex items-center justify-center text-xs font-bold">
                  {kuerzel}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">Bestellungen</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-5 ${color}`}>
      <p className="text-xs font-semibold opacity-70 tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatusBadgeMini({ status }: { status: string }) {
  const s = getStatusConfig(status);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function AktionIcon({ status }: { status: string }) {
  if (status === "abweichung") {
    return (
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (status === "ls_fehlt") {
    return (
      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}
