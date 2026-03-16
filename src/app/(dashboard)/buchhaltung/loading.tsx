export default function BuchhaltungLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-slate-200 rounded w-40" />
          <div className="h-4 bg-slate-100 rounded w-48 mt-2" />
        </div>
        <div className="h-9 bg-slate-200 rounded-lg w-28" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-3 bg-slate-200 rounded w-28 mb-3" />
            <div className="h-6 bg-slate-200 rounded w-24" />
          </div>
        ))}
      </div>

      {/* Suche */}
      <div className="mt-6">
        <div className="h-10 bg-slate-100 rounded-lg w-80" />
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-20" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-16" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-24" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-24" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-8" /></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(6)].map((_, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-28" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 bg-slate-100 rounded mx-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
