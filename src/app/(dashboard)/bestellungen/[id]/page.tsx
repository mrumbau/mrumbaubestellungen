export default async function BestellungDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Bestelldetail</h1>
      <p className="text-slate-500 mt-1">Bestellung {id}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Links: PDF-Viewer */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex gap-2 mb-4">
            {["Bestellbestätigung", "Lieferschein", "Rechnung"].map((tab) => (
              <button
                key={tab}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="h-96 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
            PDF-Viewer wird hier angezeigt
          </div>
        </div>

        {/* Rechts: KI-Abgleich + Aktionen */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-3">KI-Abgleich</h2>
            <p className="text-sm text-slate-400">
              Wird nach Eingang aller Dokumente durchgeführt.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-3">Aktionen</h2>
            <div className="space-y-2">
              <button className="w-full py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                Lieferschein scannen
              </button>
              <button
                disabled
                className="w-full py-2 text-sm bg-[#1E4D8C] text-white rounded-lg disabled:opacity-50"
              >
                Rechnung freigeben
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
