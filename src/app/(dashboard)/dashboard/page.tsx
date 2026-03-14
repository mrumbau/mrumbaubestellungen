import { getBenutzerProfil } from "@/lib/auth";

export default async function DashboardPage() {
  const profil = await getBenutzerProfil();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-500 mt-1">
        Willkommen, {profil?.name}. Hier siehst du die Übersicht.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        {[
          { label: "Offene Bestellungen", value: "–", color: "bg-blue-50 text-blue-700" },
          { label: "Abweichungen", value: "–", color: "bg-red-50 text-red-700" },
          { label: "LS fehlt", value: "–", color: "bg-yellow-50 text-yellow-700" },
          { label: "Freigegeben", value: "–", color: "bg-green-50 text-green-700" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-5 ${stat.color}`}>
            <p className="text-sm font-medium opacity-70">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
