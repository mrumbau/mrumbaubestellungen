export default function BuchhaltungPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buchhaltung</h1>
          <p className="text-slate-500 mt-1">Freigegebene Rechnungen</p>
        </div>
        <button className="px-4 py-2 text-sm bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD] transition-colors">
          CSV Export
        </button>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Bestellnr.</th>
              <th className="px-4 py-3 font-medium">Händler</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
              <th className="px-4 py-3 font-medium">Freigegeben von</th>
              <th className="px-4 py-3 font-medium">Freigegeben am</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
              <th className="px-4 py-3 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                Noch keine freigegebenen Rechnungen.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
