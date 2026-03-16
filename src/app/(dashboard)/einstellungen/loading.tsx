export default function EinstellungenLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 bg-slate-200 rounded w-40" />
        <div className="h-4 bg-slate-100 rounded w-56 mt-2" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <div className="h-9 bg-slate-200 rounded-lg w-28" />
        <div className="h-9 bg-slate-100 rounded-lg w-24" />
        <div className="h-9 bg-slate-100 rounded-lg w-28" />
      </div>

      {/* Händler-Formular */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="h-5 bg-slate-200 rounded w-36 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-slate-100 rounded w-20 mb-2" />
              <div className="h-10 bg-slate-50 rounded-lg border border-slate-200" />
            </div>
          ))}
        </div>
        <div className="h-10 bg-slate-200 rounded-lg w-32 mt-4" />
      </div>

      {/* Händler-Liste */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <div className="h-5 bg-slate-200 rounded w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 border-b border-slate-100">
              <div>
                <div className="h-4 bg-slate-100 rounded w-28 mb-1" />
                <div className="h-3 bg-slate-50 rounded w-36" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-8 bg-slate-100 rounded" />
                <div className="h-8 w-8 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
