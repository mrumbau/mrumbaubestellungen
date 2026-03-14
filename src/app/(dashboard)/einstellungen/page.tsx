export default function EinstellungenPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
      <p className="text-slate-500 mt-1">Händler & Benutzerverwaltung</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Händlerliste */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Händler</h2>
            <button className="px-3 py-1.5 text-sm bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD]">
              + Hinzufügen
            </button>
          </div>
          <p className="text-sm text-slate-400">
            Noch keine Händler konfiguriert.
          </p>
        </div>

        {/* Benutzerverwaltung */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Benutzer</h2>
          <div className="space-y-3">
            {[
              { name: "Marlon Tschon", kuerzel: "MT", rolle: "besteller" },
              { name: "Carsten Reuter", kuerzel: "CR", rolle: "besteller" },
              { name: "Mohammed Hawrami", kuerzel: "MH", rolle: "besteller" },
              { name: "Nada Jerinic", kuerzel: "NJ", rolle: "buchhaltung" },
            ].map((user) => (
              <div
                key={user.kuerzel}
                className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1E4D8C] text-white flex items-center justify-center text-xs font-medium">
                    {user.kuerzel}
                  </div>
                  <span className="text-sm text-slate-700">{user.name}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 capitalize">
                  {user.rolle}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
