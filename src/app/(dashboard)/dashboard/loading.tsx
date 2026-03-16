export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 bg-slate-200 rounded w-40" />
        <div className="h-4 bg-slate-100 rounded w-64 mt-2" />
      </div>

      {/* Statistik-Karten Reihe 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-5 bg-slate-100">
            <div className="h-3 bg-slate-200 rounded w-16 mb-3" />
            <div className="h-8 bg-slate-200 rounded w-12" />
          </div>
        ))}
      </div>

      {/* Statistik-Karten Reihe 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-5 bg-slate-100">
            <div className="h-3 bg-slate-200 rounded w-20 mb-3" />
            <div className="h-8 bg-slate-200 rounded w-16" />
          </div>
        ))}
      </div>

      {/* Zwei Spalten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Aktionen */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="h-4 bg-slate-200 rounded w-36 mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="flex-1">
                  <div className="h-3.5 bg-slate-100 rounded w-48 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Letzte Bestellungen */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="h-4 bg-slate-200 rounded w-40 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div>
                  <div className="h-3.5 bg-slate-100 rounded w-40 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-28" />
                </div>
                <div className="h-5 bg-slate-100 rounded-full w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
