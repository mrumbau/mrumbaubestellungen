export default function KundenLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-slate-200 rounded w-28" />
          <div className="h-4 bg-slate-100 rounded w-40 mt-2" />
        </div>
        <div className="h-10 bg-slate-200 rounded-lg w-36" />
      </div>

      <div className="flex gap-3 mt-6">
        <div className="h-10 bg-slate-100 rounded-lg w-80" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-200 rounded-lg" />
              <div>
                <div className="h-4 bg-slate-200 rounded w-32" />
                <div className="h-3 bg-slate-100 rounded w-20 mt-1.5" />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="h-3 bg-slate-100 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
