import { getBenutzerProfil } from "@/lib/auth";

export default async function BestellungenPage() {
  const profil = await getBenutzerProfil();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bestellungen</h1>
          <p className="text-slate-500 mt-1">
            {profil?.rolle === "admin"
              ? "Alle Bestellungen"
              : "Deine Bestellungen"}
          </p>
        </div>
      </div>

      {/* Filter-Leiste */}
      <div className="flex gap-3 mt-6">
        <input
          type="text"
          placeholder="Suche nach Bestellnummer, Händler..."
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D8C]"
        />
        <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          <option value="">Alle Status</option>
          <option value="erwartet">Erwartet</option>
          <option value="offen">Offen</option>
          <option value="vollstaendig">Vollständig</option>
          <option value="abweichung">Abweichung</option>
          <option value="ls_fehlt">LS fehlt</option>
          <option value="freigegeben">Freigegeben</option>
        </select>
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Bestellnr.</th>
              <th className="px-4 py-3 font-medium">Händler</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium text-center">Best.</th>
              <th className="px-4 py-3 font-medium text-center">LS</th>
              <th className="px-4 py-3 font-medium text-center">RE</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                Noch keine Bestellungen vorhanden.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
