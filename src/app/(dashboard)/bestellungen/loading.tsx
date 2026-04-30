export default function BestellungenLoading() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 skeleton rounded w-44" />
          <div className="h-4 skeleton rounded w-36 mt-2" />
        </div>
      </div>

      {/* Filter-Leiste */}
      <div className="flex gap-3 mt-6">
        <div className="h-10 skeleton rounded-lg w-80" />
        <div className="h-10 skeleton rounded-lg w-40" />
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-surface rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-input">
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-20" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-16" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-10" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-6" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-6" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-14" /></th>
              <th className="px-4 py-3"><div className="h-3 skeleton rounded w-14" /></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(8)].map((_, i) => (
              <tr key={i} className="border-t border-line-subtle">
                <td className="px-4 py-3.5"><div className="h-4 skeleton rounded w-24" /></td>
                <td className="px-4 py-3.5"><div className="h-4 skeleton rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 skeleton rounded w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 skeleton rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 skeleton rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-5 skeleton rounded-full mx-auto" /></td>
                <td className="px-4 py-3.5"><div className="h-5 skeleton rounded-full w-20" /></td>
                <td className="px-4 py-3.5"><div className="h-4 skeleton rounded w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
