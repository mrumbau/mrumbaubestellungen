export default function ArchivLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-slate-200 rounded w-32" />
          <div className="h-4 bg-slate-100 rounded w-48 mt-2" />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <div className="h-10 bg-slate-100 rounded-lg w-80" />
        <div className="h-10 bg-slate-100 rounded-lg w-40" />
        <div className="h-10 bg-slate-100 rounded-lg w-40" />
      </div>

      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80">
              {[20, 16, 14, 10, 6, 6, 14].map((w, i) => (
                <th key={i} className="px-4 py-3"><div className={`h-3 bg-slate-200 rounded w-${w}`} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-slate-100">
                {[28, 24, 16, 12, 4, 4, 16].map((w, j) => (
                  <td key={j} className="px-4 py-4"><div className={`h-4 bg-slate-100 rounded w-${w}`} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
