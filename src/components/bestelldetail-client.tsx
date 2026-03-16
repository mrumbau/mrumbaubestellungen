"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { BenutzerProfil } from "@/lib/auth";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  const [kiZusammenfassung, setKiZusammenfassung] = useState<string | null>(null);
  const [kiLoading, setKiLoading] = useState(false);
  const [showFreigabeDialog, setShowFreigabeDialog] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [duplikatResult, setDuplikatResult] = useState<{ ist_duplikat: boolean; konfidenz: number; duplikat_von: string | null; begruendung: string } | null>(null);
  const [duplikatLoading, setDuplikatLoading] = useState(false);
  const [katResult, setKatResult] = useState<{ kategorien: { artikel: string; kategorie: string }[]; zusammenfassung: Record<string, number> } | null>(null);
  const [katLoading, setKatLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const aktivesDokument = dokumente.find((d) => d.typ === activeTab);
  const kannFreigeben =
    !freigabe &&
    bestellung.status !== "freigegeben" &&
    (profil.rolle === "admin" || profil.kuerzel === bestellung.besteller_kuerzel);

  async function handleFreigabe() {
    setShowFreigabeDialog(false);
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

  async function handleKiZusammenfassung() {
    setKiLoading(true);
    try {
      const res = await fetch("/api/ki/bestellung-zusammenfassung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellung.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setKiZusammenfassung(data.zusammenfassung);
      }
    } catch {
      // Fehler ignorieren
    } finally {
      setKiLoading(false);
    }
  }

  async function handleDuplikatCheck() {
    setDuplikatLoading(true);
    try {
      const res = await fetch("/api/ki/duplikat-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellung.id }),
      });
      const data = await res.json();
      if (res.ok) setDuplikatResult(data);
    } catch { /* ignore */ } finally {
      setDuplikatLoading(false);
    }
  }

  async function handleKategorisierung() {
    setKatLoading(true);
    try {
      const res = await fetch("/api/ki/kategorisierung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellung.id }),
      });
      const data = await res.json();
      if (res.ok) setKatResult(data);
    } catch { /* ignore */ } finally {
      setKatLoading(false);
    }
  }

  async function handleScan(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setFileSizeError("Datei ist zu groß (max. 4 MB). Bitte eine kleinere Datei verwenden.");
      return;
    }
    setFileSizeError(null);

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
    <div className="flex flex-col md:flex-row gap-5 flex-1 min-h-0">
      {/* Links: PDF-Viewer */}
      <div className="flex-1 card flex flex-col overflow-hidden">
        {/* Underline Tabs */}
        <div className="flex border-b border-[#e8e6e3]">
          {DOK_TABS.map((tab) => {
            const dok = dokumente.find((d) => d.typ === tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-3 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "text-[#570006]"
                    : dok
                      ? "text-[#6b6b6b] hover:text-[#1a1a1a]"
                      : "text-[#c4c2bf]"
                }`}
              >
                {tab.label}
                {dok && (
                  <svg className="inline-block w-3 h-3 ml-1 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#570006]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex items-center justify-center bg-[#fafaf9]">
          {aktivesDokument?.storage_pfad ? (
            <iframe
              src={`/api/pdfs/${aktivesDokument.id}`}
              className="w-full h-full"
              title="PDF Vorschau"
            />
          ) : (
            <div className="text-center text-[#c4c2bf]">
              <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm">Kein Dokument vorhanden</p>
            </div>
          )}
        </div>

        {/* Artikelliste */}
        {aktivesDokument?.artikel && aktivesDokument.artikel.length > 0 && (
          <div className="border-t border-[#e8e6e3] p-4 max-h-48 overflow-auto">
            <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-2">Erkannte Artikel</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#9a9a9a]">
                  <th className="pb-1">Artikel</th>
                  <th className="pb-1 text-right">Menge</th>
                  <th className="pb-1 text-right">Einzelpreis</th>
                  <th className="pb-1 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {aktivesDokument.artikel.map((a, i) => (
                  <tr key={i} className="border-t border-[#f0eeeb]">
                    <td className="py-1 text-[#1a1a1a]">{a.name}</td>
                    <td className="py-1 text-right font-mono-amount text-[#6b6b6b]">{a.menge}</td>
                    <td className="py-1 text-right font-mono-amount text-[#6b6b6b]">{a.einzelpreis?.toFixed(2)} &euro;</td>
                    <td className="py-1 text-right font-mono-amount font-semibold text-[#1a1a1a]">{a.gesamtpreis?.toFixed(2)} &euro;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rechts: KI-Abgleich + Scan + Freigabe + Kommentare */}
      <div className="w-full md:w-80 flex flex-col gap-4 overflow-auto">
        {/* KI-Abgleich */}
        <div className="card overflow-hidden">
          <div className={`flex items-center justify-between px-4 py-3 ${
            abgleich?.status === "ok" ? "bg-green-50" : abgleich?.status === "abweichung" ? "bg-red-50" : "bg-[#fafaf9]"
          }`}>
            <span className={`text-sm font-semibold ${
              abgleich?.status === "ok" ? "text-green-700" : abgleich?.status === "abweichung" ? "text-red-700" : "text-[#6b6b6b]"
            }`}>
              KI-Abgleich
            </span>
            {abgleich && (
              <span className={`status-tag ${
                abgleich.status === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm ${abgleich.status === "ok" ? "bg-green-600" : "bg-red-600"}`} />
                {abgleich.status === "ok" ? "OK" : "Abweichung"}
              </span>
            )}
          </div>
          <div className="p-4">
            {abgleich ? (
              <>
                <p className="text-sm text-[#6b6b6b] leading-relaxed">
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
                          Erwartet: {a.erwartet} &rarr; Gefunden: {a.gefunden} ({a.dokument})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-[#c4c2bf] mt-3">
                  Geprüft am {new Date(abgleich.erstellt_am).toLocaleString("de-DE")}
                </p>
              </>
            ) : (
              <p className="text-sm text-[#c4c2bf]">
                Wird nach Eingang aller Dokumente durchgeführt.
              </p>
            )}
          </div>
        </div>

        {/* Scan */}
        <div className="card p-4">
          <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-2">Dokument hochladen</h3>
          <p className="text-xs text-[#9a9a9a] mb-3 leading-relaxed">
            Rechnung, Lieferschein oder Bestellbestätigung manuell hochladen. Der Dokumenttyp wird automatisch erkannt.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={scanLoading}
              aria-label="Dokument mit Kamera scannen"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              Kamera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanLoading}
              aria-label="Datei hochladen"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Datei
            </button>
          </div>
          {scanLoading && (
            <div className="flex items-center gap-2 mt-2">
              <div className="spinner w-3 h-3" />
              <span className="text-xs text-[#570006] font-medium">Wird analysiert...</span>
            </div>
          )}
          {scanError && (
            <p className="text-xs text-red-600 mt-2 font-medium">{scanError}</p>
          )}
          {fileSizeError && (
            <p className="text-xs text-red-600 mt-2 font-medium">{fileSizeError}</p>
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
            <p className="font-headline text-sm text-emerald-700">Freigegeben</p>
            <p className="text-xs text-emerald-600 mt-1">
              Von {freigabe.freigegeben_von_name} am {new Date(freigabe.freigegeben_am).toLocaleString("de-DE")}
            </p>
            {freigabe.kommentar && (
              <p className="text-xs text-emerald-600 mt-1 italic">{freigabe.kommentar}</p>
            )}
          </div>
        ) : kannFreigeben ? (
          <>
            <button
              type="button"
              onClick={() => setShowFreigabeDialog(true)}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Rechnung freigeben
            </button>
            <ConfirmDialog
              open={showFreigabeDialog}
              title="Rechnung freigeben"
              message="Soll diese Rechnung wirklich freigegeben werden? Sie wird danach für die Buchhaltung sichtbar."
              confirmLabel="Freigeben"
              onConfirm={handleFreigabe}
              onCancel={() => setShowFreigabeDialog(false)}
            />
          </>
        ) : null}

        {/* KI-Zusammenfassung */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight">KI-Zusammenfassung</h3>
            <button
              onClick={handleKiZusammenfassung}
              disabled={kiLoading}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#570006] bg-[#570006]/5 rounded-lg hover:bg-[#570006]/10 disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {kiLoading ? "Lädt..." : "Generieren"}
            </button>
          </div>
          {kiZusammenfassung ? (
            <p className="text-xs text-[#6b6b6b] leading-relaxed">{kiZusammenfassung}</p>
          ) : (
            <p className="text-xs text-[#c4c2bf]">
              Klicke auf &quot;Generieren&quot; für eine KI-Zusammenfassung dieser Bestellung.
            </p>
          )}
        </div>

        {/* Duplikat-Check + Kategorisierung */}
        <div className="card p-4">
          <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-3">KI-Analyse</h3>
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleDuplikatCheck}
              disabled={duplikatLoading}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
              {duplikatLoading ? "Prüft..." : "Duplikat?"}
            </button>
            <button
              onClick={handleKategorisierung}
              disabled={katLoading}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              {katLoading ? "Lädt..." : "Kategorien"}
            </button>
          </div>

          {/* Duplikat-Ergebnis */}
          {duplikatResult && (
            <div className={`rounded-lg p-2.5 text-xs mb-2 ${duplikatResult.ist_duplikat ? "bg-red-50" : "bg-green-50"}`}>
              <span className={`font-semibold ${duplikatResult.ist_duplikat ? "text-red-700" : "text-green-700"}`}>
                {duplikatResult.ist_duplikat ? "Mögliches Duplikat!" : "Kein Duplikat"}
              </span>
              <p className={`mt-1 ${duplikatResult.ist_duplikat ? "text-red-600" : "text-green-600"}`}>
                {duplikatResult.begruendung}
              </p>
            </div>
          )}

          {/* Kategorisierung-Ergebnis */}
          {katResult && katResult.kategorien.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(katResult.zusammenfassung).map(([kat, anzahl]) => (
                  <span key={kat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#570006]/5 text-[#570006]">
                    {kat} ({anzahl})
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-[#c4c2bf]">
                {katResult.kategorien.map((k) => `${k.artikel}: ${k.kategorie}`).join(" · ")}
              </div>
            </div>
          )}
        </div>

        {/* Kommentare */}
        <div className="card p-4">
          <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-3">Kommentare</h3>
          {kommentare.length > 0 ? (
            <div className="space-y-3 mb-3">
              {kommentare.map((k) => (
                <div key={k.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[9px] font-bold">{k.autor_kuerzel}</div>
                    <span className="text-xs font-semibold text-[#1a1a1a]">{k.autor_name}</span>
                    <span className="text-[11px] text-[#c4c2bf]">
                      {new Date(k.erstellt_am).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b6b6b] mt-1 ml-8 leading-relaxed">{k.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#c4c2bf] mb-3">Noch keine Kommentare.</p>
          )}
          <form onSubmit={handleKommentar} className="flex gap-2">
            <input
              type="text"
              value={kommentarText}
              onChange={(e) => setKommentarText(e.target.value)}
              placeholder="Kommentar schreiben..."
              className="flex-1 px-3 py-2 text-xs bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !kommentarText.trim()}
              aria-label="Kommentar senden"
              className="px-3 py-2 text-xs font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] disabled:opacity-50 transition-colors"
            >
              Senden
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
