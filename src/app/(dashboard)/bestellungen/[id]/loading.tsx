export default function BestelldetailLoading() {
  return (
    <div className="animate-pulse">
      {/* Zurück-Link + Header */}
      <div className="mb-4">
        <div className="h-4 bg-slate-100 rounded w-24 mb-3" />
        <div className="h-7 bg-slate-200 rounded w-56" />
        <div className="h-4 bg-slate-100 rounded w-72 mt-2" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-4 bg-slate-50 border border-slate-200">
            <div className="h-3 bg-slate-200 rounded w-16 mb-2" />
            <div className="h-5 bg-slate-200 rounded w-24" />
          </div>
        ))}
      </div>

      {/* Split View */}
      <div className="flex flex-col md:flex-row gap-5 flex-1 min-h-0">
        {/* PDF Viewer */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 min-h-[400px]">
          <div className="flex gap-2 p-3 bg-slate-50/80 border-b border-slate-200">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-7 bg-slate-200 rounded-lg w-28" />
            ))}
          </div>
          <div className="h-64 flex items-center justify-center">
            <div className="w-12 h-12 bg-slate-100 rounded" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-24 mb-3" />
            <div className="h-3 bg-slate-100 rounded w-full mb-2" />
            <div className="h-3 bg-slate-100 rounded w-3/4" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-32 mb-3" />
            <div className="flex gap-2">
              <div className="flex-1 h-10 bg-slate-100 rounded-lg" />
              <div className="flex-1 h-10 bg-slate-100 rounded-lg" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-24 mb-3" />
            <div className="h-3 bg-slate-100 rounded w-full mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
