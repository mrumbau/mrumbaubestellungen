export default function BestellungenLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-slate-200 rounded w-44" />
          <div className="h-4 bg-slate-100 rounded w-36 mt-2" />
        </div>
      </div>

      {/* Filter-Leiste */}
      <div className="flex gap-3 mt-6">
        <div className="h-10 bg-slate-100 rounded-lg w-80" />
        <div className="h-10 bg-slate-100 rounded-lg w-40" />
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-20" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-16" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-10" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-6" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-6" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-14" /></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(8)].map((_, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 bg-slate-100 rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 bg-slate-100 rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 bg-slate-100 rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 bg-slate-100 rounded-full w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 bg-slate-100 rounded w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
