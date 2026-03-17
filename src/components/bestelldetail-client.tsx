"use client";

import { useState, useRef, useEffect } from "react";
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

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}

interface Bestellung {
  id: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  besteller_kuerzel: string;
  projekt_id: string | null;
  projekt_name: string | null;
  kunden_id: string | null;
  kunden_name: string | null;
  lieferadresse_erkannt: string | null;
  projekt_vorschlag_id: string | null;
  projekt_vorschlag_konfidenz: number | null;
  projekt_vorschlag_methode: string | null;
  projekt_vorschlag_begruendung: string | null;
  projekt_bestaetigt: boolean;
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""} ${className || ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CollapsibleWidget({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#fafaf9] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight">{title}</h3>
          {badge}
        </div>
        <ChevronIcon open={open} className="text-[#c4c2bf]" />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[#f0eeeb]">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
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
  projekte = [],
}: {
  bestellung: Bestellung;
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  kommentare: Kommentar[];
  freigabe: Freigabe | null;
  profil: BenutzerProfil;
  projekte?: ProjektOption[];
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
  const [freigabeError, setFreigabeError] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [duplikatResult, setDuplikatResult] = useState<{ ist_duplikat: boolean; konfidenz: number; duplikat_von: string | null; begruendung: string } | null>(null);
  const [duplikatLoading, setDuplikatLoading] = useState(false);
  const [katResult, setKatResult] = useState<{ kategorien: { artikel: string; kategorie: string }[]; zusammenfassung: Record<string, number> } | null>(null);
  const [katLoading, setKatLoading] = useState(false);
  const [projektLoading, setProjektLoading] = useState(false);
  const [showProjektSelect, setShowProjektSelect] = useState(false);
  const [projektStats, setProjektStats] = useState<{ gesamt_ausgaben: number; budget: number | null; budget_auslastung_prozent: number | null } | null>(null);
  const [vorschlagLoading, setVorschlagLoading] = useState(false);
  const [showVorschlagKorrektur, setShowVorschlagKorrektur] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bestellung.projekt_id) { setProjektStats(null); return; }
    fetch(`/api/projekte/${bestellung.projekt_id}/stats`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setProjektStats({ gesamt_ausgaben: data.gesamt_ausgaben, budget: data.budget, budget_auslastung_prozent: data.budget_auslastung_prozent }))
      .catch(() => {});
  }, [bestellung.projekt_id]);

  async function handleProjektZuordnen(projektId: string | null) {
    setProjektLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellung.id}/projekt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projekt_id: projektId }),
      });
      if (res.ok) {
        setShowProjektSelect(false);
        router.refresh();
      }
    } catch { /* ignore */ } finally {
      setProjektLoading(false);
    }
  }

  async function handleVorschlagAktion(aktion: "bestaetigen" | "ablehnen", korrektesProjektId?: string) {
    setVorschlagLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellung.id}/projekt-bestaetigen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aktion,
          ...(korrektesProjektId ? { korrektes_projekt_id: korrektesProjektId } : {}),
        }),
      });
      if (res.ok) {
        setShowVorschlagKorrektur(false);
        router.refresh();
      }
    } catch { /* ignore */ } finally {
      setVorschlagLoading(false);
    }
  }

  const METHODEN_LABELS: Record<string, string> = {
    lieferadresse: "Lieferadresse",
    kundenname: "Kundenname",
    projektname_text: "Projektname im Text",
    besteller_affinitaet: "Besteller-Muster",
  };

  const aktivesDokument = dokumente.find((d) => d.typ === activeTab);
  const hatRechnung = bestellung.hat_rechnung;
  const kannFreigeben =
    !freigabe &&
    bestellung.status !== "freigegeben" &&
    (profil.rolle === "admin" || profil.kuerzel === bestellung.besteller_kuerzel);

  async function handleFreigabe() {
    setShowFreigabeDialog(false);
    setFreigabeError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellung.id}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setFreigabeError(data.error || "Freigabe fehlgeschlagen");
      }
    } catch {
      setFreigabeError("Netzwerkfehler bei der Freigabe");
    } finally {
      setLoading(false);
    }
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
                className={`relative px-4 py-3 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? "text-[#570006]"
                    : dok
                      ? "text-[#6b6b6b] hover:text-[#1a1a1a]"
                      : "text-[#c4c2bf]"
                }`}
              >
                {dok ? (
                  <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full border-[1.5px] border-dashed border-[#d1cfc9] shrink-0" />
                )}
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#570006]" />
                )}
              </button>
            );
          })}
        </div>

        <div className={`flex items-center justify-center bg-[#fafaf9] ${aktivesDokument?.storage_pfad ? "flex-1 min-h-[400px]" : "py-12"}`}>
          {aktivesDokument?.storage_pfad ? (
            <iframe
              src={`/api/pdfs/${aktivesDokument.id}`}
              className="w-full h-full"
              title="PDF Vorschau"
            />
          ) : (
            <div className="text-center px-6">
              <div className="w-12 h-12 rounded-xl bg-[#f0eeeb] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#9a9a9a]">Kein Dokument vorhanden</p>
              <p className="text-[11px] text-[#c4c2bf] mt-1">Wird automatisch angezeigt sobald ein Dokument per E-Mail oder Upload eingeht.</p>
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

      {/* Rechts: Projekt + KI-Abgleich + Scan + Freigabe + Kommentare */}
      <div className="w-full md:w-80 flex flex-col gap-4 overflow-auto">
        {/* KI-Vorschlag Banner */}
        {bestellung.projekt_vorschlag_id && !bestellung.projekt_bestaetigt && !bestellung.projekt_id && (
          <div className="card p-4 border-l-[3px] border-l-[#d97706]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-amber-700 tracking-widest uppercase">KI-Vorschlag</span>
            </div>

            {bestellung.lieferadresse_erkannt && (
              <div className="flex items-start gap-2 mb-2.5 px-2.5 py-2 bg-amber-50/50 rounded-lg">
                <svg className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs text-[#6b6b6b]">{bestellung.lieferadresse_erkannt}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.farbe || "#570006" }}
              />
              <span className="text-sm font-medium text-[#1a1a1a]">
                {projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.name || "Unbekanntes Projekt"}
              </span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono-amount text-[11px] font-bold text-amber-700">
                {Math.round((bestellung.projekt_vorschlag_konfidenz || 0) * 100)}%
              </span>
              <span className="text-[10px] text-[#9a9a9a]">
                {METHODEN_LABELS[bestellung.projekt_vorschlag_methode || ""] || bestellung.projekt_vorschlag_methode}
              </span>
            </div>

            {bestellung.projekt_vorschlag_begruendung && (
              <p className="text-[11px] text-[#9a9a9a] italic mb-3">
                &ldquo;{bestellung.projekt_vorschlag_begruendung}&rdquo;
              </p>
            )}

            {bestellung.kunden_name && (
              <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-[#f5f4f2] rounded-lg">
                <svg className="w-3 h-3 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[11px] text-[#6b6b6b]">Kunde: <span className="font-medium text-[#1a1a1a]">{bestellung.kunden_name}</span></span>
              </div>
            )}

            {!showVorschlagKorrektur ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVorschlagAktion("bestaetigen")}
                  disabled={vorschlagLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Korrekt
                </button>
                <button
                  onClick={() => setShowVorschlagKorrektur(true)}
                  disabled={vorschlagLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Falsch
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[#9a9a9a]">Korrektes Projekt auswählen:</p>
                {projekte.filter((p) => p.id !== bestellung.projekt_vorschlag_id).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleVorschlagAktion("ablehnen", p.id)}
                    disabled={vorschlagLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg border border-[#e8e6e3] hover:bg-[#fafaf9] transition-colors disabled:opacity-50"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.farbe }} />
                    {p.name}
                  </button>
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVorschlagAktion("ablehnen")}
                    disabled={vorschlagLoading}
                    className="text-[11px] text-[#9a9a9a] hover:text-red-600 transition-colors"
                  >
                    Ohne Korrektur ablehnen
                  </button>
                  <button
                    onClick={() => setShowVorschlagKorrektur(false)}
                    className="text-[11px] text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Projekt-Zuordnung */}
        <div className="card p-4">
          <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-2">Projekt</h3>
          {bestellung.projekt_name ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm text-[#1a1a1a]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: projekte.find((p) => p.id === bestellung.projekt_id)?.farbe || "#570006" }}
                  />
                  {bestellung.projekt_name}
                </span>
                <button
                  onClick={() => handleProjektZuordnen(null)}
                  disabled={projektLoading}
                  className="text-[10px] text-[#9a9a9a] hover:text-red-600 transition-colors"
                  title="Zuordnung entfernen"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {projektStats?.budget != null && projektStats.budget_auslastung_prozent != null && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-[#9a9a9a]">Budget</span>
                    <span className="font-mono-amount font-medium text-[#6b6b6b]">
                      {projektStats.gesamt_ausgaben.toLocaleString("de-DE", { minimumFractionDigits: 2 })} / {projektStats.budget!.toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#f0eeeb] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        projektStats.budget_auslastung_prozent >= 90 ? "bg-red-500" : projektStats.budget_auslastung_prozent >= 70 ? "bg-amber-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(projektStats.budget_auslastung_prozent, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#c4c2bf] mt-0.5 font-mono-amount">{projektStats.budget_auslastung_prozent.toFixed(0)}% ausgelastet</p>
                </div>
              )}
            </div>
          ) : showProjektSelect ? (
            <div className="space-y-2">
              {projekte.filter((p) => p.id !== bestellung.projekt_id).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProjektZuordnen(p.id)}
                  disabled={projektLoading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg border border-[#e8e6e3] hover:bg-[#fafaf9] transition-colors disabled:opacity-50"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.farbe }} />
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => setShowProjektSelect(false)}
                className="text-xs text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowProjektSelect(true)}
              className="text-xs font-medium text-[#570006] hover:text-[#7a1a1f] border border-[#570006]/20 rounded-lg px-3 py-2 transition-colors"
            >
              Projekt zuordnen
            </button>
          )}
        </div>

        {/* KI-Abgleich */}
        <div className={`card overflow-hidden ${
          abgleich?.status === "ok" ? "border-l-[3px] border-l-green-600" : abgleich?.status === "abweichung" ? "border-l-[3px] border-l-red-600" : ""
        }`}>
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
              <div>
                <p className="text-xs text-[#9a9a9a] mb-3">
                  Der Abgleich startet automatisch sobald alle Dokumente vorliegen.
                </p>
                <div className="space-y-2">
                  {[
                    { key: "hat_bestellbestaetigung", label: "Bestellbestätigung" },
                    { key: "hat_lieferschein", label: "Lieferschein" },
                    { key: "hat_rechnung", label: "Rechnung" },
                  ].map((d) => {
                    const vorhanden = bestellung[d.key as keyof Bestellung];
                    return (
                      <div key={d.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${vorhanden ? "bg-green-50" : "bg-[#fafaf9]"}`}>
                        {vorhanden ? (
                          <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border-[1.5px] border-dashed border-[#d1cfc9] shrink-0" />
                        )}
                        <span className={vorhanden ? "text-green-700 font-medium" : "text-[#9a9a9a]"}>{d.label}</span>
                        {!vorhanden && <span className="text-[10px] text-[#c4c2bf] ml-auto">ausstehend</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
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
              disabled={loading || !hatRechnung}
              title={!hatRechnung ? "Rechnung muss zuerst vorhanden sein" : undefined}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-colors ${
                hatRechnung
                  ? "btn-primary disabled:opacity-50"
                  : "bg-[#e8e6e3] text-[#9a9a9a] cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {hatRechnung ? "Rechnung freigeben" : "Rechnung fehlt noch"}
            </button>
            <ConfirmDialog
              open={showFreigabeDialog}
              title="Rechnung freigeben"
              message="Soll diese Rechnung wirklich freigegeben werden? Sie wird danach für die Buchhaltung sichtbar."
              confirmLabel="Freigeben"
              onConfirm={handleFreigabe}
              onCancel={() => setShowFreigabeDialog(false)}
            />
            {freigabeError && (
              <p className="text-xs text-red-600 mt-2 font-medium">{freigabeError}</p>
            )}
          </>
        ) : null}

        {/* KI-Zusammenfassung (collapsible) */}
        <CollapsibleWidget
          title="KI-Zusammenfassung"
          icon={
            <svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          }
        >
          <div className="flex items-center justify-end mb-2">
            <button
              onClick={handleKiZusammenfassung}
              disabled={kiLoading}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#570006] bg-[#570006]/5 rounded-lg hover:bg-[#570006]/10 disabled:opacity-50 transition-colors"
            >
              {kiLoading ? "Lädt..." : "Generieren"}
            </button>
          </div>
          {kiZusammenfassung ? (
            <p className="text-xs text-[#6b6b6b] leading-relaxed">{kiZusammenfassung}</p>
          ) : (
            <p className="text-xs text-[#c4c2bf]">
              Klicke auf &quot;Generieren&quot; für eine KI-Zusammenfassung.
            </p>
          )}
        </CollapsibleWidget>

        {/* KI-Analyse (collapsible) */}
        <CollapsibleWidget
          title="KI-Analyse"
          icon={
            <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          }
        >
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
        </CollapsibleWidget>

        {/* Kommentare (collapsible, default open if comments exist) */}
        <CollapsibleWidget
          title="Kommentare"
          defaultOpen={kommentare.length > 0}
          icon={
            <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          }
          badge={kommentare.length > 0 ? (
            <span className="font-mono-amount text-[10px] font-bold text-[#9a9a9a] bg-[#f0eeeb] px-1.5 py-0.5 rounded">
              {kommentare.length}
            </span>
          ) : undefined}
        >
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
        </CollapsibleWidget>
      </div>
    </div>
  );
}
