"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { BenutzerProfil } from "@/lib/auth";

interface Dokument {
  id: string;
  typ: string;
  quelle: string;
  storage_pfad: string | null;
  artikel: { name: string; menge: number; einzelpreis: number; gesamtpreis: number }[] | null;
  gesamtbetrag: number | null;
  created_at: string;
}

interface Abgleich {
  id: string;
  status: string;
  abweichungen: { feld: string; artikel?: string; erwartet: string | number; gefunden: string | number; dokument: string; schwere: string }[] | null;
  ki_zusammenfassung: string | null;
  erstellt_am: string;
}

interface Kommentar {
  id: string;
  autor_kuerzel: string;
  autor_name: string;
  text: string;
  erstellt_am: string;
}

interface Freigabe {
  id: string;
  freigegeben_von_name: string;
  freigegeben_am: string;
  kommentar: string | null;
}

interface Bestellung {
  id: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  besteller_kuerzel: string;
}

const DOK_TABS = [
  { key: "bestellbestaetigung", label: "Bestellbestätigung" },
  { key: "lieferschein", label: "Lieferschein" },
  { key: "rechnung", label: "Rechnung" },
];

export function BestelldetailClient({
  bestellung,
  dokumente,
  abgleich,
  kommentare,
  freigabe,
  profil,
}: {
  bestellung: Bestellung;
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  kommentare: Kommentar[];
  freigabe: Freigabe | null;
  profil: BenutzerProfil;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(DOK_TABS[0].key);
  const [kommentarText, setKommentarText] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const aktivesDokument = dokumente.find((d) => d.typ === activeTab);
  const kannFreigeben =
    !freigabe &&
    bestellung.status !== "freigegeben" &&
    (profil.rolle === "admin" || profil.kuerzel === bestellung.besteller_kuerzel);

  async function handleFreigabe() {
    if (!confirm("Rechnung wirklich freigeben?")) return;
    setLoading(true);
    await fetch(`/api/bestellungen/${bestellung.id}/freigeben`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    router.refresh();
    setLoading(false);
  }

  async function handleKommentar(e: React.FormEvent) {
    e.preventDefault();
    if (!kommentarText.trim()) return;
    setLoading(true);
    const res = await fetch("/api/kommentare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestellung_id: bestellung.id, text: kommentarText }),
    });
    if (res.ok) {
      setKommentarText("");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleScan(file: File) {
    // Max 4MB prüfen (Vercel Body-Limit)
    if (file.size > 4 * 1024 * 1024) {
      alert("Datei ist zu groß (max. 4 MB). Bitte eine kleinere Datei verwenden.");
      return;
    }

    setScanLoading(true);
    setScanError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bestellung_id: bestellung.id,
            base64,
            mime_type: file.type,
            datei_name: file.name,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setScanError(data.error || "Upload fehlgeschlagen");
        } else {
          router.refresh();
        }
      } catch {
        setScanError("Netzwerkfehler beim Upload");
      } finally {
        setScanLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex gap-5 flex-1 min-h-0">
      {/* Links: PDF-Viewer */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="flex gap-2 p-3 bg-slate-50/80 border-b border-slate-200">
          {DOK_TABS.map((tab) => {
            const dok = dokumente.find((d) => d.typ === tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-[#1E4D8C] text-white"
                    : dok
                      ? "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      : "text-slate-400"
                }`}
              >
                {tab.label}
                {dok && " ✓"}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex items-center justify-center bg-slate-50">
          {aktivesDokument?.storage_pfad ? (
            <iframe
              src={`/api/pdfs/${aktivesDokument.id}`}
              className="w-full h-full"
              title="PDF Vorschau"
            />
          ) : (
            <div className="text-center text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm">Kein Dokument vorhanden</p>
            </div>
          )}
        </div>

        {/* Artikelliste wenn vorhanden */}
        {aktivesDokument?.artikel && aktivesDokument.artikel.length > 0 && (
          <div className="border-t border-slate-200 p-4 max-h-48 overflow-auto">
            <p className="text-xs font-semibold text-slate-500 mb-2">Erkannte Artikel</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-1">Artikel</th>
                  <th className="pb-1 text-right">Menge</th>
                  <th className="pb-1 text-right">Einzelpreis</th>
                  <th className="pb-1 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {aktivesDokument.artikel.map((a, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{a.name}</td>
                    <td className="py-1 text-right text-slate-500">{a.menge}</td>
                    <td className="py-1 text-right text-slate-500">{a.einzelpreis?.toFixed(2)} €</td>
                    <td className="py-1 text-right font-medium text-slate-700">{a.gesamtpreis?.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rechts: KI-Abgleich + Scan + Freigabe + Kommentare */}
      <div className="w-80 flex flex-col gap-4 overflow-auto">
        {/* KI-Abgleich */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className={`flex items-center justify-between px-4 py-3 ${
            abgleich?.status === "ok" ? "bg-green-50" : abgleich?.status === "abweichung" ? "bg-red-50" : "bg-slate-50"
          }`}>
            <span className={`text-sm font-semibold ${
              abgleich?.status === "ok" ? "text-green-700" : abgleich?.status === "abweichung" ? "text-red-700" : "text-slate-600"
            }`}>
              KI-Abgleich
            </span>
            {abgleich && (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                abgleich.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}>
                {abgleich.status === "ok" ? "OK" : "Abweichung"}
              </span>
            )}
          </div>
          <div className="p-4">
            {abgleich ? (
              <>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {abgleich.ki_zusammenfassung}
                </p>
                {abgleich.abweichungen && abgleich.abweichungen.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {abgleich.abweichungen.map((a, i) => (
                      <div key={i} className="bg-red-50 rounded-lg p-2.5 text-xs">
                        <span className="font-semibold text-red-700">{a.feld}</span>
                        {a.artikel && <span className="text-red-600"> ({a.artikel})</span>}
                        <br />
                        <span className="text-red-600">
                          Erwartet: {a.erwartet} → Gefunden: {a.gefunden} ({a.dokument})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-3">
                  Geprüft am {new Date(abgleich.erstellt_am).toLocaleString("de-DE")}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Wird nach Eingang aller Dokumente durchgeführt.
              </p>
            )}
          </div>
        </div>

        {/* Scan */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Dokument hochladen</h3>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Rechnung, Lieferschein oder Bestellbestätigung manuell hochladen. Der Dokumenttyp wird automatisch erkannt.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={scanLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              Kamera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Datei
            </button>
          </div>
          {scanLoading && (
            <p className="text-xs text-[#1E4D8C] mt-2 font-medium">Wird analysiert...</p>
          )}
          {scanError && (
            <p className="text-xs text-red-600 mt-2 font-medium">{scanError}</p>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])}
          />
        </div>

        {/* Freigabe */}
        {freigabe ? (
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <p className="text-sm font-semibold text-emerald-700">Freigegeben</p>
            <p className="text-xs text-emerald-600 mt-1">
              Von {freigabe.freigegeben_von_name} am {new Date(freigabe.freigegeben_am).toLocaleString("de-DE")}
            </p>
            {freigabe.kommentar && (
              <p className="text-xs text-emerald-600 mt-1 italic">{freigabe.kommentar}</p>
            )}
          </div>
        ) : kannFreigeben ? (
          <button
            onClick={handleFreigabe}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#1E4D8C] text-white rounded-xl font-semibold text-sm hover:bg-[#2E6BAD] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Rechnung freigeben
          </button>
        ) : null}

        {/* Kommentare */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Kommentare</h3>
          {kommentare.length > 0 ? (
            <div className="space-y-3 mb-3">
              {kommentare.map((k) => (
                <div key={k.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">{k.autor_name}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(k.erstellt_am).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{k.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mb-3">Noch keine Kommentare.</p>
          )}
          <form onSubmit={handleKommentar} className="flex gap-2">
            <input
              type="text"
              value={kommentarText}
              onChange={(e) => setKommentarText(e.target.value)}
              placeholder="Kommentar schreiben..."
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E4D8C]"
            />
            <button
              type="submit"
              disabled={loading || !kommentarText.trim()}
              className="px-3 py-2 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50"
            >
              Senden
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
