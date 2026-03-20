"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { BenutzerProfil } from "@/lib/auth";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DOKUMENT_CONFIG, BESTELLUNGSART_LABELS, type Bestellungsart } from "@/lib/bestellung-utils";

interface Dokument {
  id: string;
  typ: string;
  quelle: string;
  storage_pfad: string | null;
  artikel: { name: string; menge: number; einzelpreis: number; gesamtpreis: number }[] | null;
  gesamtbetrag: number | null;
  netto: number | null;
  mwst: number | null;
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
  budget?: number | null;
}

interface SubunternehmerInfo {
  id: string;
  firma: string;
  gewerk: string | null;
  ansprechpartner: string | null;
  telefon: string | null;
  email: string | null;
}

interface Bestellung {
  id: string;
  status: string;
  bestellungsart: Bestellungsart | null;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
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
  hat_versandbestaetigung?: boolean;
  tracking_nummer?: string | null;
  versanddienstleister?: string | null;
  tracking_url?: string | null;
  voraussichtliche_lieferung?: string | null;
}

// ─── Icons ──────────────────────────────────────────────

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""} ${className || ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function BestellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  );
}

function LieferscheinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

function RechnungIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}

function VersandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────

function CollapsibleWidget({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
  widgetId,
  openWidgetId,
  onToggleWidget,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  widgetId?: string;
  openWidgetId?: string | null;
  onToggleWidget?: (id: string) => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = widgetId !== undefined && onToggleWidget !== undefined;
  const open = isControlled ? openWidgetId === widgetId : localOpen;
  const handleToggle = () => {
    if (isControlled) {
      onToggleWidget!(widgetId!);
    } else {
      setLocalOpen(!localOpen);
    }
  };
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
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
          <div className="pt-3 max-h-[40vh] overflow-y-auto">{children}</div>
        </div>
      )}
    </div>
  );
}

const DOK_ICON_MAP: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  bestellbestaetigung: BestellIcon,
  lieferschein: LieferscheinIcon,
  rechnung: RechnungIcon,
  aufmass: RechnungIcon,
  leistungsnachweis: LieferscheinIcon,
  versandbestaetigung: VersandIcon,
};

function getDokTabs(bestellungsart: Bestellungsart | null) {
  const art: Bestellungsart = bestellungsart || "material";
  return DOKUMENT_CONFIG[art].map((d) => ({
    key: d.typ,
    label: d.label,
    kurzLabel: d.kurzLabel,
    vorhanden: d.flag,
    icon: DOK_ICON_MAP[d.typ] || RechnungIcon,
  }));
}

// ─── Main Component ─────────────────────────────────────

export function BestelldetailClient({
  bestellung,
  dokumente,
  abgleich,
  kommentare,
  freigabe,
  profil,
  projekte = [],
  subunternehmer,
}: {
  bestellung: Bestellung;
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  kommentare: Kommentar[];
  freigabe: Freigabe | null;
  profil: BenutzerProfil;
  projekte?: ProjektOption[];
  subunternehmer?: SubunternehmerInfo;
}) {
  const router = useRouter();
  const dokTabs = useMemo(() => getDokTabs(bestellung.bestellungsart), [bestellung.bestellungsart]);
  const [activeTab, setActiveTab] = useState(dokTabs[0].key);
  const [bestellungsartLoading, setBestellungsartLoading] = useState(false);
  const [aktuelleArt, setAktuelleArt] = useState<Bestellungsart>(bestellung.bestellungsart || "material");
  const [kommentarText, setKommentarText] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [kiZusammenfassung, setKiZusammenfassung] = useState<string | null>(null);
  const [kiLoading, setKiLoading] = useState(false);
  const [showFreigabeDialog, setShowFreigabeDialog] = useState(false);
  const [freigabeError, setFreigabeError] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [duplikatResult, setDuplikatResult] = useState<{ ist_duplikat: boolean; konfidenz: number; duplikat_von: string | null; begruendung: string } | null>(null);
  const [duplikatLoading, setDuplikatLoading] = useState(false);
  const [katResult, setKatResult] = useState<{ kategorien: { artikel: string; kategorie: string }[]; zusammenfassung: Record<string, number> } | null>(null);
  const [katLoading, setKatLoading] = useState(false);
  const [projektLoading, setProjektLoading] = useState(false);
  const [showProjektSelect, setShowProjektSelect] = useState(false);
  const [projektSuche, setProjektSuche] = useState("");
  const [projektStats, setProjektStats] = useState<{ gesamt_ausgaben: number; budget: number | null; budget_auslastung_prozent: number | null } | null>(null);
  const [vorschlagLoading, setVorschlagLoading] = useState(false);
  const [showVorschlagKorrektur, setShowVorschlagKorrektur] = useState(false);
  const [artikelDrawerOpen, setArtikelDrawerOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<"dokumente" | "details" | "aktionen">("dokumente");
  const [openWidgetId, setOpenWidgetId] = useState<string | null>(null);
  const toggleWidget = (id: string) => setOpenWidgetId((prev) => (prev === id ? null : id));
  const [openAbweichungen, setOpenAbweichungen] = useState<Record<number, boolean>>({});
  const [showVerwerfenDialog, setShowVerwerfenDialog] = useState(false);
  const [verwerfenLoading, setVerwerfenLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bestellung.projekt_id) { setProjektStats(null); return; }
    fetch(`/api/projekte/${bestellung.projekt_id}/stats`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setProjektStats({ gesamt_ausgaben: data.gesamt_ausgaben, budget: data.budget, budget_auslastung_prozent: data.budget_auslastung_prozent }))
      .catch(() => setProjektStats(null));
  }, [bestellung.projekt_id]);

  // Filtered projects for Combobox
  const filteredProjekte = useMemo(() => {
    if (!projektSuche.trim()) return projekte;
    const q = projektSuche.toLowerCase();
    return projekte.filter((p) => p.name.toLowerCase().includes(q));
  }, [projekte, projektSuche]);

  // Build timeline
  const timeline = useMemo(() => {
    const items: { zeit: string; label: string; typ: "dok" | "abgleich" | "freigabe" | "kommentar"; farbe: string }[] = [];
    for (const d of dokumente) {
      const typLabels: Record<string, string> = { bestellbestaetigung: "Bestellbestätigung", lieferschein: "Lieferschein", rechnung: "Rechnung", aufmass: "Aufmaß", leistungsnachweis: "Leistungsnachweis", versandbestaetigung: "Versandbestätigung" };
      items.push({ zeit: d.created_at, label: `${typLabels[d.typ] || d.typ} eingegangen`, typ: "dok", farbe: "#2563eb" });
    }
    if (abgleich) items.push({ zeit: abgleich.erstellt_am, label: `KI-Abgleich: ${abgleich.status === "ok" ? "OK" : "Abweichung"}`, typ: "abgleich", farbe: abgleich.status === "ok" ? "#16a34a" : "#dc2626" });
    if (freigabe) items.push({ zeit: freigabe.freigegeben_am, label: `Freigegeben von ${freigabe.freigegeben_von_name}`, typ: "freigabe", farbe: "#059669" });
    for (const k of kommentare) items.push({ zeit: k.erstellt_am, label: `${k.autor_kuerzel}: "${k.text.slice(0, 60)}${k.text.length > 60 ? "…" : ""}"`, typ: "kommentar", farbe: "#9a9a9a" });
    return items.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime());
  }, [dokumente, abgleich, freigabe, kommentare]);

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
        setProjektSuche("");
        setActionError(null);
        router.refresh();
      } else {
        setActionError("Projekt-Zuordnung fehlgeschlagen");
      }
    } catch { setActionError("Netzwerkfehler bei der Projekt-Zuordnung"); } finally {
      setProjektLoading(false);
    }
  }

  async function handleVorschlagAktion(aktion: "bestaetigen" | "ablehnen", korrektesProjektId?: string) {
    setVorschlagLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellung.id}/projekt-bestaetigen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion, ...(korrektesProjektId ? { korrektes_projekt_id: korrektesProjektId } : {}) }),
      });
      if (res.ok) { setShowVorschlagKorrektur(false); setActionError(null); router.refresh(); }
      else { setActionError("Projekt-Bestätigung fehlgeschlagen"); }
    } catch { setActionError("Netzwerkfehler bei der Projekt-Bestätigung"); } finally {
      setVorschlagLoading(false);
    }
  }

  async function handleVerwerfen() {
    setVerwerfenLoading(true);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellung.id }),
      });
      if (res.ok) {
        router.push("/bestellungen");
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Bestellung konnte nicht verworfen werden");
      }
    } catch {
      setActionError("Netzwerkfehler beim Verwerfen");
    } finally {
      setVerwerfenLoading(false);
      setShowVerwerfenDialog(false);
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
      if (res.ok) { router.refresh(); }
      else {
        const data = await res.json().catch(() => ({}));
        setFreigabeError(data.error || "Freigabe fehlgeschlagen");
      }
    } catch { setFreigabeError("Netzwerkfehler bei der Freigabe"); }
    finally { setLoading(false); }
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
    if (res.ok) { setKommentarText(""); router.refresh(); }
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
      if (res.ok) { setKiZusammenfassung(data.zusammenfassung); setActionError(null); }
      else { setActionError("KI-Zusammenfassung fehlgeschlagen"); }
    } catch { setActionError("Netzwerkfehler bei der KI-Zusammenfassung"); } finally { setKiLoading(false); }
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
      if (res.ok) { setDuplikatResult(data); setActionError(null); }
      else { setActionError("Duplikat-Check fehlgeschlagen"); }
    } catch { setActionError("Netzwerkfehler beim Duplikat-Check"); } finally { setDuplikatLoading(false); }
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
      if (res.ok) { setKatResult(data); setActionError(null); }
      else { setActionError("Kategorisierung fehlgeschlagen"); }
    } catch { setActionError("Netzwerkfehler bei der Kategorisierung"); } finally { setKatLoading(false); }
  }

  async function handleBestellungsartChange(neueArt: Bestellungsart) {
    if (neueArt === aktuelleArt) return;
    setBestellungsartLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellung.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellungsart: neueArt }),
      });
      if (res.ok) {
        setAktuelleArt(neueArt);
        setActionError(null);
        router.refresh();
      } else {
        setActionError("Bestellungsart konnte nicht geändert werden");
      }
    } catch {
      setActionError("Netzwerkfehler beim Ändern der Bestellungsart");
    } finally {
      setBestellungsartLoading(false);
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
          body: JSON.stringify({ bestellung_id: bestellung.id, base64, mime_type: file.type, datei_name: file.name }),
        });
        let data;
        try {
          data = await res.json();
        } catch {
          setScanError(`Server-Fehler (${res.status}). Bitte kleinere Datei versuchen.`);
          setScanLoading(false);
          return;
        }
        if (!res.ok) {
          setScanError(data.error || "Upload fehlgeschlagen");
          setScanLoading(false);
        } else {
          router.refresh();
          setScanLoading(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
        setScanError(`Upload fehlgeschlagen: ${msg}`);
        setScanLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleZipDownload() {
    const pdfDokumente = dokumente.filter((d) => d.storage_pfad);
    if (pdfDokumente.length === 0) return;

    try {
      const res = await fetch(`/api/pdfs/zip?bestellung_id=${bestellung.id}`);
      if (!res.ok) {
        let msg = "Download fehlgeschlagen";
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        setActionError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] || "Dokumente.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Download fehlgeschlagen. Bitte erneut versuchen.");
    }
  }

  // ─── Render: Sidebar content ──────────────────────────

  function renderUploadArea() {
    return (
      <>
        <div className="flex gap-2">
          <button onClick={() => cameraInputRef.current?.click()} disabled={scanLoading} aria-label="Dokument mit Kamera scannen" className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors">
            <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            Kamera
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={scanLoading} aria-label="Datei hochladen" className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors">
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
        {scanError && <p className="text-xs text-red-600 mt-2 font-medium">{scanError}</p>}
        {fileSizeError && <p className="text-xs text-red-600 mt-2 font-medium">{fileSizeError}</p>}
      </>
    );
  }

  function renderSidebar() {
    return (
      <>
        {/* ── SECTION: Aktionen (immer oben) ────────────── */}

        {/* Freigabe */}
        {freigabe ? (
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-headline text-sm text-emerald-700">Freigegeben</p>
            </div>
            <p className="text-xs text-emerald-600 mt-1.5 ml-6">
              Von {freigabe.freigegeben_von_name} am {new Date(freigabe.freigegeben_am).toLocaleString("de-DE")}
            </p>
            {freigabe.kommentar && <p className="text-xs text-emerald-600 mt-1 ml-6 italic">{freigabe.kommentar}</p>}
          </div>
        ) : kannFreigeben ? (
          <div className="card p-4">
            <button
              type="button"
              onClick={() => setShowFreigabeDialog(true)}
              disabled={loading || !hatRechnung}
              title={!hatRechnung ? "Rechnung muss zuerst vorhanden sein" : undefined}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors ${
                hatRechnung ? "btn-primary disabled:opacity-50" : "bg-[#e8e6e3] text-[#9a9a9a] cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {hatRechnung ? "Rechnung freigeben" : "Rechnung fehlt noch"}
            </button>
            {!hatRechnung && (
              <p className="text-[10px] text-[#c4c2bf] mt-2 text-center">Die Freigabe wird möglich sobald eine Rechnung vorliegt.</p>
            )}
            {freigabeError && <p className="text-xs text-red-600 mt-2 font-medium">{freigabeError}</p>}
          </div>
        ) : null}

        {/* Upload Card */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Dokument hochladen</h3>
            {/* PDF Download als dezenter Icon-Link */}
            {(() => {
              const pdfCount = dokumente.filter((d) => d.storage_pfad).length;
              if (pdfCount === 0) return null;
              return (
                <button
                  onClick={handleZipDownload}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#9a9a9a] hover:text-[#570006] rounded-md hover:bg-[#fafaf9] transition-colors"
                  title={pdfCount === 1 ? "PDF herunterladen" : `Alle ${pdfCount} PDFs herunterladen`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {pdfCount}
                </button>
              );
            })()}
          </div>
          <p className="text-xs text-[#9a9a9a] mb-3 leading-relaxed">
            Dokumenttyp wird automatisch erkannt.
          </p>
          {renderUploadArea()}
        </div>

        {/* Metadaten: Bestellungsart + Projekt */}
        <div className="card p-4 space-y-3">
          {/* Bestellungsart — kompakte Zeile */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#9a9a9a] uppercase tracking-wider">Art</span>
            {(profil.rolle === "admin" || profil.kuerzel === bestellung.besteller_kuerzel) ? (
              <div className="relative">
                <select
                  value={aktuelleArt}
                  onChange={(e) => handleBestellungsartChange(e.target.value as Bestellungsart)}
                  disabled={bestellungsartLoading}
                  className="appearance-none bg-[#fafaf9] border border-[#e8e6e3] rounded-lg px-2.5 py-1.5 text-xs text-[#1a1a1a] pr-7 disabled:opacity-50 transition-colors hover:bg-[#f5f4f2] cursor-pointer"
                >
                  <option value="material">Material</option>
                  <option value="subunternehmer">Subunternehmer</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9a9a9a] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            ) : (
              <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-medium ${
                aktuelleArt === "subunternehmer" ? "bg-cyan-50 text-cyan-700" : "bg-blue-50 text-blue-700"
              }`}>
                {BESTELLUNGSART_LABELS[aktuelleArt]}
              </span>
            )}
          </div>
          {bestellungsartLoading && (
            <div className="flex items-center gap-1.5">
              <div className="spinner w-3 h-3" />
              <span className="text-[10px] text-[#9a9a9a]">Status wird neu berechnet...</span>
            </div>
          )}

          <div className="h-px bg-[#f0eeeb]" />

          {/* Projekt — kompakte Zeile */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#9a9a9a] uppercase tracking-wider">Projekt</span>
            {bestellung.projekt_name ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs text-[#1a1a1a]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: projekte.find((p) => p.id === bestellung.projekt_id)?.farbe || "#570006" }} />
                  {bestellung.projekt_name}
                </span>
                <button onClick={() => handleProjektZuordnen(null)} disabled={projektLoading} className="text-[#c4c2bf] hover:text-red-600 transition-colors" title="Zuordnung entfernen">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : showProjektSelect ? (
              <div className="flex-1 ml-3">
                <div className="relative">
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={projektSuche}
                    onChange={(e) => setProjektSuche(e.target.value)}
                    placeholder="Suchen..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-1 focus:ring-[#570006]/15 transition-colors"
                    autoFocus
                  />
                </div>
                <div className="max-h-32 overflow-auto space-y-0.5 mt-1">
                  {filteredProjekte.length === 0 ? (
                    <p className="text-[10px] text-[#c4c2bf] py-1 text-center">Nicht gefunden</p>
                  ) : (
                    filteredProjekte.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleProjektZuordnen(p.id)}
                        disabled={projektLoading}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-left rounded hover:bg-[#fafaf9] transition-colors disabled:opacity-50"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.farbe }} />
                        <span className="flex-1 truncate">{p.name}</span>
                      </button>
                    ))
                  )}
                </div>
                <button onClick={() => { setShowProjektSelect(false); setProjektSuche(""); }} className="text-[10px] text-[#9a9a9a] hover:text-[#6b6b6b] mt-1 transition-colors">Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setShowProjektSelect(true)} className="text-[10px] font-medium text-[#570006] hover:text-[#7a1a1f] transition-colors">
                Zuordnen
              </button>
            )}
          </div>
          {bestellung.projekt_name && projektStats?.budget != null && projektStats.budget_auslastung_prozent != null && (
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-[#9a9a9a]">Budget</span>
                <span className="font-mono-amount font-medium text-[#6b6b6b]">
                  {projektStats.gesamt_ausgaben.toLocaleString("de-DE", { minimumFractionDigits: 2 })} / {projektStats.budget!.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                </span>
              </div>
              <div className="h-1.5 bg-[#f0eeeb] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${projektStats.budget_auslastung_prozent >= 90 ? "bg-red-500" : projektStats.budget_auslastung_prozent >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(projektStats.budget_auslastung_prozent, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-[#c4c2bf] mt-0.5 font-mono-amount">{projektStats.budget_auslastung_prozent.toFixed(0)}% ausgelastet</p>
            </div>
          )}
        </div>

        {/* ── Subunternehmer-Info ───────────────────── */}
        {aktuelleArt === "subunternehmer" && subunternehmer && (
          <div className="card p-4 border-l-[3px] border-l-[#0891b2]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-cyan-50 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-[#0891b2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-[#0891b2] tracking-widest uppercase">Subunternehmer</span>
            </div>
            <p className="text-sm font-medium text-[#1a1a1a]">{subunternehmer.firma}</p>
            {subunternehmer.gewerk && (
              <span className="inline-block mt-1 text-[10px] font-semibold text-[#0891b2] bg-[#0891b2]/10 px-1.5 py-0.5 rounded uppercase tracking-wide">{subunternehmer.gewerk}</span>
            )}
            {subunternehmer.ansprechpartner && (
              <p className="text-[11px] text-[#6b6b6b] mt-1.5">{subunternehmer.ansprechpartner}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {subunternehmer.telefon && <p className="text-[11px] text-[#9a9a9a]">{subunternehmer.telefon}</p>}
              {subunternehmer.email && <p className="text-[11px] text-[#9a9a9a]">{subunternehmer.email}</p>}
            </div>
          </div>
        )}

        {/* ── Versand-Info ─────────────────────────── */}
        {aktuelleArt === "material" && bestellung.hat_versandbestaetigung && (
          <div className="card p-4 border-l-[3px] border-l-[#8b5cf6]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center">
                <VersandIcon className="w-3.5 h-3.5 text-[#8b5cf6]" />
              </div>
              <span className="text-[10px] font-bold text-[#8b5cf6] tracking-widest uppercase">Versand</span>
            </div>
            {bestellung.versanddienstleister && (
              <p className="text-sm font-medium text-[#1a1a1a]">{bestellung.versanddienstleister}</p>
            )}
            {bestellung.tracking_nummer && (
              <p className="text-xs text-[#6b6b6b] font-mono-amount mt-1">{bestellung.tracking_nummer}</p>
            )}
            {bestellung.tracking_url && (
              <a
                href={bestellung.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#570006] hover:underline mt-2"
              >
                Sendung verfolgen
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}
            {bestellung.voraussichtliche_lieferung && (
              <p className="text-[10px] text-[#9a9a9a] mt-1.5">
                Voraussichtlich: {new Date(bestellung.voraussichtliche_lieferung).toLocaleDateString("de-DE")}
              </p>
            )}
          </div>
        )}

        {/* ── SECTION: Status (mitte) ───────────────────── */}

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
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.farbe || "#570006" }} />
              <span className="text-sm font-medium text-[#1a1a1a]">{projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.name || "Unbekanntes Projekt"}</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono-amount text-[11px] font-bold text-amber-700">{Math.round((bestellung.projekt_vorschlag_konfidenz || 0) * 100)}%</span>
              <span className="text-[10px] text-[#9a9a9a]">{METHODEN_LABELS[bestellung.projekt_vorschlag_methode || ""] || bestellung.projekt_vorschlag_methode}</span>
            </div>

            {bestellung.projekt_vorschlag_begruendung && (
              <p className="text-[11px] text-[#9a9a9a] italic mb-3">&ldquo;{bestellung.projekt_vorschlag_begruendung}&rdquo;</p>
            )}

            {/* Budget im Vorschlag-Banner */}
            {(() => {
              const vorschlagProjekt = projekte.find((p) => p.id === bestellung.projekt_vorschlag_id);
              if (vorschlagProjekt?.budget) {
                return (
                  <div className="px-2.5 py-1.5 bg-[#f5f4f2] rounded-lg mb-3 text-[10px] text-[#9a9a9a]">
                    Budget: <span className="font-mono-amount font-medium text-[#6b6b6b]">{vorschlagProjekt.budget.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                  </div>
                );
              }
              return null;
            })()}

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
                <button onClick={() => handleVorschlagAktion("bestaetigen")} disabled={vorschlagLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Korrekt
                </button>
                <button onClick={() => setShowVorschlagKorrektur(true)} disabled={vorschlagLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  Falsch
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[#9a9a9a]">Korrektes Projekt auswählen:</p>
                {projekte.filter((p) => p.id !== bestellung.projekt_vorschlag_id).map((p) => (
                  <button key={p.id} onClick={() => handleVorschlagAktion("ablehnen", p.id)} disabled={vorschlagLoading} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg border border-[#e8e6e3] hover:bg-[#fafaf9] transition-colors disabled:opacity-50">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.farbe }} />
                    {p.name}
                  </button>
                ))}
                <div className="flex gap-2">
                  <button onClick={() => handleVorschlagAktion("ablehnen")} disabled={vorschlagLoading} className="text-[11px] text-[#9a9a9a] hover:text-red-600 transition-colors">Ohne Korrektur ablehnen</button>
                  <button onClick={() => setShowVorschlagKorrektur(false)} className="text-[11px] text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors">Abbrechen</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SECTION: Collapsible Widgets ───────────────── */}

        {/* Timeline */}
        {timeline.length > 0 && (
          <CollapsibleWidget
            title="Aktivitätsverlauf"
            icon={<svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            badge={<span className="font-mono-amount text-[10px] font-bold text-[#9a9a9a] bg-[#f0eeeb] px-1.5 py-0.5 rounded">{timeline.length}</span>}
            widgetId="timeline"
            openWidgetId={openWidgetId}
            onToggleWidget={toggleWidget}
          >
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#e8e6e3]" />
              <div className="space-y-3">
                {timeline.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    <span className="w-[15px] h-[15px] rounded-full border-2 border-white shrink-0 z-10" style={{ background: t.farbe }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#1a1a1a] leading-relaxed">{t.label}</p>
                      <p className="text-[10px] text-[#c4c2bf]">{new Date(t.zeit).toLocaleString("de-DE")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleWidget>
        )}

        {/* KI-Tools (Abgleich + Zusammenfassung + Duplikat + Kategorien) */}
        <CollapsibleWidget
          title="KI-Tools"
          icon={<svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>}
          badge={abgleich?.status === "ok"
            ? <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            : abgleich?.status === "abweichung"
              ? <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              : undefined}
          widgetId="ki-tools"
          openWidgetId={openWidgetId}
          onToggleWidget={toggleWidget}
        >
          {/* KI-Abgleich (integriert) */}
          {abgleich ? (
            abgleich.status === "ok" ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg mb-3">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-700">Alle Dokumente stimmen überein</p>
                  <p className="text-[10px] text-green-600/70">{new Date(abgleich.erstellt_am).toLocaleDateString("de-DE")}</p>
                </div>
              </div>
            ) : (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                  <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs font-semibold text-red-700">
                    {abgleich.abweichungen?.length === 1 ? "1 Abweichung" : `${abgleich.abweichungen?.length || 0} Abweichungen`}
                  </p>
                </div>
                {abgleich.abweichungen && abgleich.abweichungen.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {abgleich.abweichungen.map((a, i) => (
                      <div key={i}>
                        <button
                          type="button"
                          onClick={() => setOpenAbweichungen((prev) => ({ ...prev, [i]: !prev[i] }))}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-red-50/70 hover:bg-red-100/50 transition-colors text-[11px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.schwere === "hoch" ? "bg-red-600" : "bg-amber-500"}`} />
                            <span className="font-medium text-red-700">{a.feld}</span>
                            {a.artikel && <span className="text-red-500 truncate max-w-[100px]">({a.artikel})</span>}
                          </div>
                          <ChevronIcon open={!!openAbweichungen[i]} className="text-red-400 w-3 h-3" />
                        </button>
                        {openAbweichungen[i] && (
                          <div className="ml-4 mt-0.5 mb-1 px-2.5 py-1.5 bg-red-50/30 rounded text-[10px] text-red-600 space-y-0.5">
                            <div className="flex gap-3">
                              <span>Erwartet: <span className="font-medium">{a.erwartet}</span></span>
                              <span>Gefunden: <span className="font-medium">{a.gefunden}</span></span>
                            </div>
                            <div className="text-red-400">{a.dokument} · {a.schwere}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {abgleich.ki_zusammenfassung && (
                  <p className="text-[11px] text-[#6b6b6b] mt-2 leading-relaxed">{abgleich.ki_zusammenfassung}</p>
                )}
              </div>
            )
          ) : (
            <div className="mb-3">
              <p className="text-[11px] text-[#9a9a9a] mb-2">Abgleich startet sobald alle Dokumente vorliegen.</p>
              <div className="flex gap-1.5">
                {[
                  { key: "hat_bestellbestaetigung", label: "Best." },
                  { key: "hat_lieferschein", label: "LS" },
                  { key: "hat_rechnung", label: "RE" },
                ].map((d) => {
                  const vorhanden = bestellung[d.key as keyof Bestellung];
                  return (
                    <span key={d.key} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] ${vorhanden ? "bg-green-50 text-green-700 font-medium" : "bg-[#fafaf9] text-[#c4c2bf]"}`}>
                      {vorhanden ? (
                        <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[#d1cfc9]" />
                      )}
                      {d.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="h-px bg-[#f0eeeb] mb-3" />

          {/* Zusammenfassung */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-[#9a9a9a] uppercase tracking-wider">Zusammenfassung</span>
              <button onClick={handleKiZusammenfassung} disabled={kiLoading} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-[#570006] bg-[#570006]/5 rounded hover:bg-[#570006]/10 disabled:opacity-50 transition-colors">
                {kiLoading ? "Lädt..." : "Generieren"}
              </button>
            </div>
            {kiZusammenfassung ? (
              <p className="text-xs text-[#6b6b6b] leading-relaxed">{kiZusammenfassung}</p>
            ) : (
              <p className="text-xs text-[#c4c2bf]">KI-Zusammenfassung generieren.</p>
            )}
          </div>

          <div className="h-px bg-[#f0eeeb] mb-3" />

          {/* Analyse-Aktionen */}
          <div className="flex gap-2">
            <button onClick={handleDuplikatCheck} disabled={duplikatLoading} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors">
              <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
              {duplikatLoading ? "Prüft..." : "Duplikat?"}
            </button>
            <button onClick={handleKategorisierung} disabled={katLoading} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium bg-[#fafaf9] border border-[#e8e6e3] rounded-lg hover:bg-[#f5f4f2] disabled:opacity-50 transition-colors">
              <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
              {katLoading ? "Lädt..." : "Kategorien"}
            </button>
          </div>
          {duplikatResult && (
            <div className={`rounded-lg p-2.5 text-xs mt-2 ${duplikatResult.ist_duplikat ? "bg-red-50" : "bg-green-50"}`}>
              <span className={`font-semibold ${duplikatResult.ist_duplikat ? "text-red-700" : "text-green-700"}`}>{duplikatResult.ist_duplikat ? "Mögliches Duplikat!" : "Kein Duplikat"}</span>
              <p className={`mt-1 ${duplikatResult.ist_duplikat ? "text-red-600" : "text-green-600"}`}>{duplikatResult.begruendung}</p>
            </div>
          )}
          {katResult && katResult.kategorien.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(katResult.zusammenfassung).map(([kat, anzahl]) => (
                  <span key={kat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#570006]/5 text-[#570006]">{kat} ({anzahl})</span>
                ))}
              </div>
              <div className="text-[10px] text-[#c4c2bf]">{katResult.kategorien.map((k) => `${k.artikel}: ${k.kategorie}`).join(" · ")}</div>
            </div>
          )}
        </CollapsibleWidget>

        {/* Kommentare */}
        <CollapsibleWidget
          title="Kommentare"
          icon={<svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>}
          badge={kommentare.length > 0 ? <span className="font-mono-amount text-[10px] font-bold text-[#9a9a9a] bg-[#f0eeeb] px-1.5 py-0.5 rounded">{kommentare.length}</span> : undefined}
          widgetId="kommentare"
          openWidgetId={openWidgetId}
          onToggleWidget={toggleWidget}
        >
          {kommentare.length > 0 ? (
            <div className="space-y-3 mb-3">
              {kommentare.map((k) => (
                <div key={k.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[9px] font-bold">{k.autor_kuerzel}</div>
                    <span className="text-xs font-semibold text-[#1a1a1a]">{k.autor_name}</span>
                    <span className="text-[11px] text-[#c4c2bf]">{new Date(k.erstellt_am).toLocaleDateString("de-DE")}</span>
                  </div>
                  <p className="text-xs text-[#6b6b6b] mt-1 ml-8 leading-relaxed">{k.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#c4c2bf] mb-3">Noch keine Kommentare.</p>
          )}
          <form onSubmit={handleKommentar} className="flex gap-2">
            <input type="text" value={kommentarText} onChange={(e) => setKommentarText(e.target.value)} placeholder="Kommentar schreiben..." className="flex-1 px-3 py-2 text-xs bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
            <button type="submit" disabled={loading || !kommentarText.trim()} aria-label="Kommentar senden" className="px-3 py-2 text-xs font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] disabled:opacity-50 transition-colors">Senden</button>
          </form>
        </CollapsibleWidget>

        {/* Bestellung verwerfen — nur für Admin */}
        {profil.rolle === "admin" && (
          <button
            type="button"
            onClick={() => setShowVerwerfenDialog(true)}
            disabled={verwerfenLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Bestellung verwerfen
          </button>
        )}
      </>
    );
  }

  // ─── Render: PDF viewer area ──────────────────────────

  function renderDocumentArea() {
    return (
      <div className="flex-1 card flex flex-col overflow-hidden relative">
        {/* Tabs — bigger, with doc-type icons */}
        <div className="flex border-b border-[#e8e6e3]">
          {dokTabs.map((tab) => {
            const dok = dokumente.find((d) => d.typ === tab.key);
            const isActive = activeTab === tab.key;
            const IconComp = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setArtikelDrawerOpen(false); }}
                className={`relative flex items-center gap-2 px-5 py-3.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-[#570006] bg-white"
                    : dok
                      ? "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#fafaf9]"
                      : "text-[#c4c2bf] hover:text-[#9a9a9a]"
                }`}
              >
                <IconComp className={`w-4 h-4 ${isActive ? "text-[#570006]" : dok ? "text-[#9a9a9a]" : "text-[#d1cfc9]"}`} />
                <span>{tab.label}</span>
                {dok ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <svg className="w-2 h-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-dashed border-[#d1cfc9] shrink-0" />
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#570006]" />}
              </button>
            );
          })}
        </div>

        {/* PDF Viewer or Empty State with integrated upload */}
        <div className={`flex items-center justify-center bg-[#fafaf9] ${aktivesDokument?.storage_pfad ? "flex-1 min-h-[500px]" : "flex-1"}`}>
          {aktivesDokument?.storage_pfad ? (
            <iframe src={`/api/pdfs/${aktivesDokument.id}`} className="w-full h-full" title="PDF Vorschau" />
          ) : (
            <div className="text-center px-6 max-w-xs">
              <div className="w-14 h-14 rounded-xl bg-[#f0eeeb] flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#9a9a9a]">Kein Dokument vorhanden</p>
              <p className="text-[11px] text-[#c4c2bf] mt-1 mb-4">Wird automatisch angezeigt sobald ein Dokument per E-Mail eingeht.</p>
              {/* Integrated upload in empty state */}
              <div className="flex gap-2 justify-center">
                <button onClick={() => cameraInputRef.current?.click()} disabled={scanLoading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#570006] bg-[#570006]/5 rounded-lg hover:bg-[#570006]/10 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Scannen
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={scanLoading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#570006] bg-[#570006]/5 rounded-lg hover:bg-[#570006]/10 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Hochladen
                </button>
              </div>
              {scanLoading && (
                <div className="flex items-center gap-2 mt-3 justify-center">
                  <div className="spinner w-3 h-3" />
                  <span className="text-xs text-[#570006] font-medium">Wird analysiert...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Artikel Drawer — slides up over the PDF */}
        {aktivesDokument?.artikel && aktivesDokument.artikel.length > 0 && (
          <>
            {/* Toggle button */}
            <button
              type="button"
              onClick={() => setArtikelDrawerOpen(!artikelDrawerOpen)}
              className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-2 bg-white/95 backdrop-blur-sm border-t border-[#e8e6e3] hover:bg-[#fafaf9] transition-colors z-20"
              style={artikelDrawerOpen ? { position: "relative" } : {}}
            >
              <svg className={`w-3.5 h-3.5 text-[#9a9a9a] transition-transform duration-200 ${artikelDrawerOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
              <span className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">
                Erkannte Artikel ({aktivesDokument.artikel.length})
              </span>
            </button>
            {artikelDrawerOpen && (
              <div className="border-t border-[#e8e6e3] bg-white max-h-[50%] overflow-auto z-10">
                <div className="p-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[#9a9a9a]">
                        <th className="pb-1.5">Artikel</th>
                        <th className="pb-1.5 text-right">Menge</th>
                        <th className="pb-1.5 text-right">Einzelpreis</th>
                        <th className="pb-1.5 text-right">Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aktivesDokument.artikel.map((a, i) => (
                        <tr key={i} className="border-t border-[#f0eeeb]">
                          <td className="py-1.5 text-[#1a1a1a]">{a.name}</td>
                          <td className="py-1.5 text-right font-mono-amount text-[#6b6b6b]">{a.menge}</td>
                          <td className="py-1.5 text-right font-mono-amount text-[#6b6b6b]">{a.einzelpreis?.toFixed(2)} €</td>
                          <td className="py-1.5 text-right font-mono-amount font-semibold text-[#1a1a1a]">{a.gesamtpreis?.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Summenzeile mit Netto/MwSt */}
                  <div className="mt-3 pt-3 border-t border-[#e8e6e3] space-y-1">
                    {aktivesDokument.netto != null && (
                      <div className="flex justify-between text-xs text-[#6b6b6b]">
                        <span>Netto</span>
                        <span className="font-mono-amount">{aktivesDokument.netto.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                    )}
                    {aktivesDokument.mwst != null && (
                      <div className="flex justify-between text-xs text-[#6b6b6b]">
                        <span>MwSt</span>
                        <span className="font-mono-amount">{aktivesDokument.mwst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                    )}
                    {aktivesDokument.gesamtbetrag != null && (
                      <div className="flex justify-between text-xs font-semibold text-[#1a1a1a]">
                        <span>Gesamt</span>
                        <span className="font-mono-amount">{aktivesDokument.gesamtbetrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Render: Main layout ──────────────────────────────

  return (
    <>
      {/* Action error banner */}
      {actionError && (
        <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {/* Mobile section tabs */}
      <div className="md:hidden flex border-b border-[#e8e6e3] mb-4 -mx-4 px-4">
        {([
          { key: "dokumente", label: "Dokumente", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
          { key: "details", label: "Details", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg> },
          { key: "aktionen", label: "Aktionen", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMobileSection(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors relative ${
              mobileSection === tab.key ? "text-[#570006]" : "text-[#9a9a9a]"
            }`}
          >
            {tab.icon}
            {tab.label}
            {mobileSection === tab.key && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#570006]" />}
          </button>
        ))}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex flex-row gap-5 flex-1 min-h-0">
        {renderDocumentArea()}
        <div className="w-80 flex flex-col gap-4 overflow-auto">
          {renderSidebar()}
        </div>
      </div>

      {/* Mobile layout — tab-based */}
      <div className="md:hidden flex flex-col flex-1 min-h-0">
        {mobileSection === "dokumente" && renderDocumentArea()}
        {mobileSection === "details" && (
          <div className="flex flex-col gap-4 overflow-auto pb-20">
            {/* KI-Vorschlag Banner (wenn vorhanden) */}
            {bestellung.projekt_vorschlag_id && !bestellung.projekt_bestaetigt && !bestellung.projekt_id && (
              <div className="card p-4 border-l-[3px] border-l-[#d97706]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 tracking-widest uppercase">KI-Vorschlag</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.farbe || "#570006" }} />
                  <span className="text-sm font-medium text-[#1a1a1a]">{projekte.find((p) => p.id === bestellung.projekt_vorschlag_id)?.name || "Unbekanntes Projekt"}</span>
                  <span className="font-mono-amount text-[11px] font-bold text-amber-700 ml-auto">{Math.round((bestellung.projekt_vorschlag_konfidenz || 0) * 100)}%</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => handleVorschlagAktion("bestaetigen")} disabled={vorschlagLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Korrekt
                  </button>
                  <button onClick={() => setShowVorschlagKorrektur(true)} disabled={vorschlagLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Falsch
                  </button>
                </div>
              </div>
            )}

            {/* KI-Abgleich kompakt */}
            <div className={`card overflow-hidden ${
              abgleich?.status === "ok" ? "border-l-[3px] border-l-green-600" : abgleich?.status === "abweichung" ? "border-l-[3px] border-l-red-600" : ""
            }`}>
              {abgleich ? (
                abgleich.status === "ok" ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50">
                    <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-700">Alle Dokumente stimmen überein</p>
                      <p className="text-[10px] text-green-600/70 mt-0.5">Geprüft am {new Date(abgleich.erstellt_am).toLocaleString("de-DE")}</p>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-red-50">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-red-700">{abgleich.abweichungen?.length || 0} Abweichung(en) gefunden</p>
                        <p className="text-[11px] text-red-600 mt-0.5">Prüfe die Positionen bevor du freigibst.</p>
                      </div>
                    </div>
                    {abgleich.ki_zusammenfassung && <p className="text-xs text-red-600/80 mt-2">{abgleich.ki_zusammenfassung}</p>}
                  </div>
                )
              ) : (
                <div className="p-4">
                  <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-1">KI-Abgleich</h3>
                  <p className="text-xs text-[#9a9a9a]">Startet automatisch sobald alle Dokumente vorliegen.</p>
                </div>
              )}
            </div>

            {/* Projekt */}
            <div className="card p-4">
              <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-2">Projekt</h3>
              {bestellung.projekt_name ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-[#1a1a1a]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: projekte.find((p) => p.id === bestellung.projekt_id)?.farbe || "#570006" }} />
                  {bestellung.projekt_name}
                </span>
              ) : (
                <button onClick={() => { setShowProjektSelect(true); setMobileSection("dokumente"); }} className="text-xs font-medium text-[#570006] hover:text-[#7a1a1f] border border-[#570006]/20 rounded-lg px-3 py-2 transition-colors">
                  Projekt zuordnen
                </button>
              )}
            </div>

            {/* Timeline */}
            {timeline.length > 0 && (
              <CollapsibleWidget
                title="Aktivitätsverlauf"
                icon={<svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                badge={<span className="font-mono-amount text-[10px] font-bold text-[#9a9a9a] bg-[#f0eeeb] px-1.5 py-0.5 rounded">{timeline.length}</span>}
                widgetId="m-timeline"
                openWidgetId={openWidgetId}
                onToggleWidget={toggleWidget}
              >
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#e8e6e3]" />
                  <div className="space-y-3">
                    {timeline.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 relative">
                        <span className="w-[15px] h-[15px] rounded-full border-2 border-white shrink-0 z-10" style={{ background: t.farbe }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#1a1a1a] leading-relaxed">{t.label}</p>
                          <p className="text-[10px] text-[#c4c2bf]">{new Date(t.zeit).toLocaleString("de-DE")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleWidget>
            )}

            {/* Kommentare */}
            {kommentare.length > 0 && (
              <CollapsibleWidget
                title="Kommentare"
                icon={<svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>}
                badge={<span className="font-mono-amount text-[10px] font-bold text-[#9a9a9a] bg-[#f0eeeb] px-1.5 py-0.5 rounded">{kommentare.length}</span>}
                widgetId="m-kommentare"
                openWidgetId={openWidgetId}
                onToggleWidget={toggleWidget}
              >
                <div className="space-y-3">
                  {kommentare.map((k) => (
                    <div key={k.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[9px] font-bold">{k.autor_kuerzel}</div>
                        <span className="text-xs font-semibold text-[#1a1a1a]">{k.autor_name}</span>
                        <span className="text-[11px] text-[#c4c2bf]">{new Date(k.erstellt_am).toLocaleDateString("de-DE")}</span>
                      </div>
                      <p className="text-xs text-[#6b6b6b] mt-1 ml-8 leading-relaxed">{k.text}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleWidget>
            )}
          </div>
        )}
        {mobileSection === "aktionen" && (
          <div className="flex flex-col gap-4 overflow-auto pb-20">
            {/* Freigabe + Upload prominent on mobile */}
            {freigabe ? (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-sm font-medium text-emerald-700">Freigegeben von {freigabe.freigegeben_von_name}</p>
                </div>
              </div>
            ) : kannFreigeben ? (
              <button
                type="button"
                onClick={() => setShowFreigabeDialog(true)}
                disabled={loading || !hatRechnung}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl text-base font-medium transition-colors ${
                  hatRechnung ? "btn-primary disabled:opacity-50" : "bg-[#e8e6e3] text-[#9a9a9a] cursor-not-allowed"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {hatRechnung ? "Rechnung freigeben" : "Rechnung fehlt noch"}
              </button>
            ) : null}

            {/* Scan prominent on mobile */}
            <div className="card p-4">
              <h3 className="font-headline text-base text-[#1a1a1a] tracking-tight mb-3">Dokument scannen / hochladen</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraInputRef.current?.click()} disabled={scanLoading} className="flex flex-col items-center gap-2 py-4 text-sm font-medium bg-[#570006]/5 text-[#570006] rounded-xl hover:bg-[#570006]/10 transition-colors">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Kamera
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={scanLoading} className="flex flex-col items-center gap-2 py-4 text-sm font-medium bg-[#570006]/5 text-[#570006] rounded-xl hover:bg-[#570006]/10 transition-colors">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Datei
                </button>
              </div>
              {scanLoading && (
                <div className="flex items-center gap-2 mt-3 justify-center">
                  <div className="spinner w-3 h-3" />
                  <span className="text-xs text-[#570006] font-medium">Wird analysiert...</span>
                </div>
              )}
              {scanError && <p className="text-xs text-red-600 mt-2 font-medium">{scanError}</p>}
            </div>

            {/* Quick comment on mobile */}
            <div className="card p-4">
              <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-2">Kommentar</h3>
              <form onSubmit={handleKommentar} className="flex gap-2">
                <input type="text" value={kommentarText} onChange={(e) => setKommentarText(e.target.value)} placeholder="Kommentar schreiben..." className="flex-1 px-3 py-2 text-sm bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
                <button type="submit" disabled={loading || !kommentarText.trim()} className="px-4 py-2 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] disabled:opacity-50 transition-colors">Senden</button>
              </form>
            </div>

            {/* Bestellung verwerfen — nur für Admin (mobile) */}
            {profil.rolle === "admin" && (
              <button
                type="button"
                onClick={() => setShowVerwerfenDialog(true)}
                disabled={verwerfenLoading}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Bestellung verwerfen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile fixed bottom bar — Freigabe CTA */}
      {kannFreigeben && !freigabe && hatRechnung && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-[#e8e6e3] z-50">
          <button
            type="button"
            onClick={() => setShowFreigabeDialog(true)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium btn-primary disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Rechnung freigeben
          </button>
        </div>
      )}

      {/* Hidden file inputs (shared between desktop & mobile) */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])} />

      {/* Shared confirm dialog */}
      <ConfirmDialog
        open={showFreigabeDialog}
        title="Rechnung freigeben"
        message="Soll diese Rechnung wirklich freigegeben werden? Sie wird danach für die Buchhaltung sichtbar."
        confirmLabel="Freigeben"
        onConfirm={handleFreigabe}
        onCancel={() => setShowFreigabeDialog(false)}
      />
      <ConfirmDialog
        open={showVerwerfenDialog}
        title="Bestellung verwerfen"
        message="Diese Bestellung und alle zugehörigen Dokumente, Abgleiche und Kommentare unwiderruflich löschen?"
        confirmLabel="Endgültig löschen"
        onConfirm={handleVerwerfen}
        onCancel={() => setShowVerwerfenDialog(false)}
      />
    </>
  );
}
