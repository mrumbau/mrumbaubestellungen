"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { formatDatum } from "@/lib/formatters";
import {
  DOKUMENT_CONFIG,
  type Bestellungsart,
} from "@/lib/bestellung-utils";
import { IconChevronDown } from "@/components/ui/icons";
import { DOK_ICON_MAP, RechnungIcon } from "./dokument-icons";
import type { Bestellung, Dokument } from "./types";

/**
 * DocumentPanel — the main content column on desktop, the "dokumente" tab on mobile.
 *
 * Contains, in one structural card:
 *   1. Horizontal tab rail (Bestell / Lieferschein / Rechnung / …)
 *   2. Main viewer area: PDF iframe, extracted KI-data, or empty state
 *   3. Article drawer (slides up from bottom when artikel present)
 *
 * Hidden file inputs are mounted here and forwarded via refs so both desktop
 * and mobile action-tabs can trigger them without duplicating the inputs.
 *
 * activeTab is owned here (internal state) — parent only needs to know which
 * tab is active via the `onTabChange` callback if it wants to. In this app the
 * parent does not need to react to tab changes, so we keep it local.
 */
export function DocumentPanel({
  bestellung,
  dokumente,
  scanLoading,
  scanError,
  fileSizeError,
  onClearScanError,
  fileInputRef,
  cameraInputRef,
  onFileSelected,
  onZipDownload,
  activeTab,
  onTabChange,
}: {
  bestellung: Bestellung;
  dokumente: Dokument[];
  scanLoading: boolean;
  scanError: string | null;
  fileSizeError: string | null;
  onClearScanError: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelected: (file: File, erwarteterTyp: string) => void;
  onZipDownload: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const [artikelDrawerOpen, setArtikelDrawerOpen] = useState(false);
  // 07.05.2026 — Sub-Selector-Index für Tabs mit mehreren Dokumenten desselben
  // Typs (z.B. Raab-Karcher-Sammelbestellung mit 2 Teilrechnungen).
  const [sectionIndex, setSectionIndex] = useState(0);

  const dokTabs = useMemo(() => getDokTabs(bestellung.bestellungsart), [bestellung.bestellungsart]);

  // Alle Dokumente des aktuellen Typs — Liste statt First-Match. Sortiert nach
  // created_at damit "Rechnung 1/2" stabil das ältere ist.
  const aktiveDokumente = useMemo(
    () =>
      dokumente
        .filter((d) => d.typ === activeTab)
        .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
    [dokumente, activeTab],
  );
  const safeIndex = Math.min(sectionIndex, Math.max(0, aktiveDokumente.length - 1));
  const aktivesDokument = aktiveDokumente[safeIndex];
  const pdfCount = dokumente.filter((d) => d.storage_pfad).length;

  // Bei Tab-Wechsel zurück auf erstes Dokument
  // (sonst zeigt z.B. "Rechnung 2/2" → Wechsel zu Lieferschein → out-of-range).
  useEffect(() => {
    setSectionIndex(0);
  }, [activeTab]);

  return (
    <div className="flex-1 card flex flex-col overflow-hidden relative">
      {/* Tabs — overflow-x-auto verhindert Text-Crush auf Mobile bei 6 Tabs */}
      <div role="tablist" aria-label="Dokument-Typen" className="flex border-b border-line overflow-x-auto scrollbar-hide">
        {dokTabs.map((tab) => {
          const dok = dokumente.find((d) => d.typ === tab.key);
          const isActive = activeTab === tab.key;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onTabChange(tab.key);
                setArtikelDrawerOpen(false);
              }}
              className={cn(
                "relative flex items-center gap-2 px-5 py-3.5 text-[12px] font-medium transition-colors shrink-0 whitespace-nowrap",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                isActive
                  ? "text-brand bg-surface"
                  : dok
                    ? "text-foreground-muted hover:text-foreground hover:bg-surface-hover"
                    // 02.06.2026 (UX-Polish): fehlende Tabs deutlich gedimmter
                    // (text-foreground-faint statt -subtle) damit auf einen Blick
                    // klar ist welche Tabs bestückt sind und welche nicht.
                    : "text-foreground-faint hover:text-foreground-subtle",
              )}
              aria-label={`${tab.label} ${dok ? "vorhanden" : "fehlt"}`}
            >
              <IconComp
                className={cn(
                  "h-4 w-4",
                  isActive
                    ? "text-brand"
                    : dok
                      ? "text-foreground-subtle"
                      : "text-line-strong",
                )}
              />
              <span>{tab.label}</span>
              {dok ? (
                <span
                  aria-hidden="true"
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success-bg shrink-0"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-2 w-2 text-status-freigegeben"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8.5l3 3 7-7"
                    />
                  </svg>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed border-line-strong shrink-0"
                />
              )}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand"
                />
              )}
            </button>
          );
        })}

        {pdfCount > 0 && (
          <div className="ml-auto flex items-center pr-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onZipDownload}
              title={pdfCount === 1 ? "PDF herunterladen" : `Alle ${pdfCount} PDFs herunterladen`}
              className="text-[12px]"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M3 11v1.5a1 1 0 001 1h8a1 1 0 001-1V11M5.5 7.5L8 10l2.5-2.5M8 10V2" />
              </svg>
              {pdfCount}
            </Button>
          </div>
        )}
      </div>

      {/* Sub-Selector wenn mehrere Dokumente vom gleichen Typ existieren (z.B. mehrere Teilrechnungen) */}
      {aktiveDokumente.length > 1 && (
        <div
          role="tablist"
          aria-label={`${dokTabs.find((t) => t.key === activeTab)?.label ?? "Dokument"} — Auswahl`}
          className="flex items-center gap-1 px-3 py-2 border-b border-line-subtle bg-canvas overflow-x-auto scrollbar-hide"
        >
          <span className="text-[12px] text-foreground-subtle uppercase tracking-wide font-mono-amount mr-2 shrink-0">
            {aktiveDokumente.length} {pluralLabel(activeTab, aktiveDokumente.length)}
          </span>
          {aktiveDokumente.map((d, i) => {
            const isActive = i === safeIndex;
            const nr = d.bestellnummer_erkannt
              ?? `${i + 1}/${aktiveDokumente.length}`;
            const betrag = d.gesamtbetrag != null
              ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(d.gesamtbetrag)
              : null;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSectionIndex(i)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors whitespace-nowrap",
                  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                  isActive
                    ? "bg-brand text-white font-medium"
                    : "bg-surface text-foreground-muted hover:bg-surface-hover border border-line",
                )}
              >
                <span className="font-mono-amount tabular-nums">{nr}</span>
                {betrag && (
                  <span className={cn(
                    "text-[12px]",
                    isActive ? "text-white/70" : "text-foreground-subtle",
                  )}>
                    {betrag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          "flex items-center justify-center bg-input",
          aktivesDokument?.storage_pfad ? "flex-1 min-h-[500px]" : "flex-1",
        )}
      >
        {aktivesDokument?.storage_pfad ? (
          <>
            {/* 22.05.2026 (Perf) — loading="lazy" verhindert PDF-Fetch wenn
                der iframe in einem display:none-Parent ist. Bestelldetail-Shell
                mountet DocumentPanel 2× (Desktop + Mobile-Variante via Tailwind
                hidden/md:hidden). Ohne lazy lädt jede Variante ihre PDFs
                parallel — pro Tab-Open also ~600ms × 2 Roundtrips verschenkt.
                Mit lazy lädt nur der iframe der wirklich im Viewport ist. */}
            <iframe
              src={`/api/pdfs/${aktivesDokument.id}`}
              loading="lazy"
              className="w-full h-full"
              title={`PDF: ${dokTabs.find((t) => t.key === activeTab)?.label ?? "Dokument"}`}
            />
            <noscript>
              <a
                href={`/api/pdfs/${aktivesDokument.id}`}
                className="absolute inset-0 flex items-center justify-center bg-canvas text-foreground underline"
              >
                PDF herunterladen
              </a>
            </noscript>
          </>
        ) : aktivesDokument ? (
          <ExtractedDocument
            dokument={aktivesDokument}
            scanLoading={scanLoading}
            onOpenCamera={() => cameraInputRef.current?.click()}
            onOpenFile={() => fileInputRef.current?.click()}
          />
        ) : (
          <EmptyDocument
            scanLoading={scanLoading}
            onOpenCamera={() => cameraInputRef.current?.click()}
            onOpenFile={() => fileInputRef.current?.click()}
          />
        )}
      </div>

      {/* Error banners (scan / size) — anchored to bottom of content */}
      {(scanError || fileSizeError) && (
        <div className="px-4 py-2 border-t border-line-subtle">
          <Alert
            tone="error"
            onDismiss={() => {
              onClearScanError();
            }}
          >
            {scanError || fileSizeError}
          </Alert>
        </div>
      )}

      {/* Article drawer */}
      {aktivesDokument?.artikel && aktivesDokument.artikel.length > 0 && (
        <ArticleDrawer
          dokument={aktivesDokument}
          open={artikelDrawerOpen}
          onToggle={() => setArtikelDrawerOpen(!artikelDrawerOpen)}
        />
      )}

      {/* Hidden file inputs (shared with mobile aktionen tab via refs) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f, activeTab);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f, activeTab);
          e.target.value = "";
        }}
      />
    </div>
  );
}

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

// 07.05.2026 — Korrektes deutsches Plural pro Doku-Typ. Naive "+en"-Suffix
// erzeugt "Lieferscheinen" statt "Lieferscheine".
const PLURAL_LABEL: Record<string, { singular: string; plural: string }> = {
  bestellbestaetigung: { singular: "Bestätigung", plural: "Bestätigungen" },
  lieferschein: { singular: "Lieferschein", plural: "Lieferscheine" },
  rechnung: { singular: "Rechnung", plural: "Rechnungen" },
  versandbestaetigung: { singular: "Versandbestätigung", plural: "Versandbestätigungen" },
  aufmass: { singular: "Aufmaß", plural: "Aufmaße" },
  leistungsnachweis: { singular: "Leistungsnachweis", plural: "Leistungsnachweise" },
};

function pluralLabel(typ: string, count: number): string {
  const map = PLURAL_LABEL[typ];
  if (!map) return count === 1 ? "Dokument" : "Dokumente";
  return count === 1 ? map.singular : map.plural;
}

function EmptyDocument({
  scanLoading,
  onOpenCamera,
  onOpenFile,
}: {
  scanLoading: boolean;
  onOpenCamera: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div className="text-center px-6 max-w-xs">
      <div
        aria-hidden="true"
        className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-canvas text-foreground-subtle mx-auto mb-3 [&_svg]:h-7 [&_svg]:w-7"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-foreground-muted">Kein Dokument vorhanden</p>
      <p className="text-[12px] text-foreground-subtle mt-1 mb-4">
        Sobald ein Dokument per E-Mail eingeht, erscheint es hier automatisch.
        <span className="block mt-1 text-foreground-faint">Oder direkt hinzufügen:</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center items-stretch sm:items-center">
        <UploadButton
          onClick={onOpenFile}
          disabled={scanLoading}
          label="Hochladen"
          variant="file"
          emphasis="primary"
        />
        <UploadButton
          onClick={onOpenCamera}
          disabled={scanLoading}
          label="Scannen"
          variant="camera"
          emphasis="secondary"
        />
      </div>
      {scanLoading && (
        <div className="flex items-center gap-2 mt-3 justify-center">
          <Spinner size={12} />
          <span className="text-[12px] text-brand font-medium">Wird analysiert…</span>
        </div>
      )}
    </div>
  );
}

function ExtractedDocument({
  dokument,
  scanLoading,
  onOpenCamera,
  onOpenFile,
}: {
  dokument: Dokument;
  scanLoading: boolean;
  onOpenCamera: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div className="w-full h-full overflow-auto p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <Alert tone="warning">Kein PDF vorhanden — Daten aus E-Mail-Text extrahiert.</Alert>

        <dl className="bg-surface rounded-md border border-line divide-y divide-line-subtle">
          {dokument.bestellnummer_erkannt && (
            <DataRow label="Bestellnummer" value={dokument.bestellnummer_erkannt} mono />
          )}
          {dokument.auftragsnummer && (
            <DataRow label="Auftragsnummer" value={dokument.auftragsnummer} mono />
          )}
          {dokument.lieferscheinnummer && (
            <DataRow label="Lieferscheinnummer" value={dokument.lieferscheinnummer} mono />
          )}
          {dokument.kundennummer && (
            <DataRow label="Kundennummer" value={dokument.kundennummer} mono />
          )}
          {dokument.projekt_referenz && (
            <DataRow label="Projekt-Referenz" value={dokument.projekt_referenz} subtle />
          )}
          {dokument.besteller_im_dokument && (
            <DataRow label="Besteller laut Dokument" value={dokument.besteller_im_dokument} subtle />
          )}
          {dokument.gesamtbetrag != null && (
            <DataRow
              label="Gesamtbetrag"
              value={`${Number(dokument.gesamtbetrag).toFixed(2)} EUR`}
              mono
            />
          )}
          {dokument.netto != null && (
            <DataRow
              label="Netto"
              value={`${Number(dokument.netto).toFixed(2)} EUR`}
              mono
              subtle
            />
          )}
          {dokument.mwst != null && (
            <DataRow
              label="MwSt"
              value={`${Number(dokument.mwst).toFixed(2)} EUR`}
              mono
              subtle
            />
          )}
          {dokument.bestelldatum && (
            <DataRow label="Bestelldatum" value={formatDatum(dokument.bestelldatum)} mono />
          )}
          {dokument.lieferdatum && (
            <DataRow label="Lieferdatum" value={formatDatum(dokument.lieferdatum)} mono />
          )}
          {dokument.faelligkeitsdatum && (
            <DataRow label="Fälligkeit" value={formatDatum(dokument.faelligkeitsdatum)} mono />
          )}
          {dokument.iban && <DataRow label="IBAN" value={dokument.iban} mono subtle />}
          {dokument.email_betreff && (
            <DataRow label="E-Mail-Betreff" value={dokument.email_betreff} subtle truncate />
          )}
          {dokument.email_absender && (
            <DataRow label="Absender" value={dokument.email_absender} subtle />
          )}
          {dokument.ki_roh_daten?.tracking_nummer && (
            <DataRow
              label="Sendungsnummer"
              value={String(dokument.ki_roh_daten.tracking_nummer)}
              mono
            />
          )}
          {dokument.ki_roh_daten?.versanddienstleister && (
            <DataRow
              label="Versanddienstleister"
              value={String(dokument.ki_roh_daten.versanddienstleister)}
            />
          )}
          {dokument.ki_roh_daten?.tracking_url && (
            <div className="flex justify-between px-4 py-2.5 text-[12px]">
              <dt className="text-foreground-subtle">Tracking</dt>
              <dd>
                <a
                  href={String(dokument.ki_roh_daten.tracking_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  Sendung verfolgen
                </a>
              </dd>
            </div>
          )}
        </dl>

        {dokument.artikel && Array.isArray(dokument.artikel) && dokument.artikel.length > 0 && (
          <div className="bg-surface rounded-md border border-line">
            <div className="px-4 py-2.5 text-[12px] font-medium text-foreground-subtle border-b border-line-subtle uppercase tracking-wider">
              Artikel
            </div>
            <ul className="divide-y divide-line-subtle">
              {dokument.artikel.map((art, idx) => (
                <li key={idx} className="px-4 py-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground">{art.name || "Unbekannt"}</span>
                    {art.gesamtpreis != null && (
                      <span className="font-mono-amount font-medium text-foreground">
                        {Number(art.gesamtpreis).toFixed(2)} EUR
                      </span>
                    )}
                  </div>
                  {(art.menge != null || art.einzelpreis != null) && (
                    <div className="text-foreground-subtle font-mono-amount mt-0.5">
                      {art.menge != null && <span>{art.menge}x</span>}
                      {art.einzelpreis != null && (
                        <span> à {Number(art.einzelpreis).toFixed(2)} EUR</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dokument.ki_roh_daten?.email_text && (
          <div className="bg-surface rounded-md border border-line">
            <div className="px-4 py-2.5 text-[12px] font-medium text-foreground-subtle border-b border-line-subtle uppercase tracking-wider">
              E-Mail Inhalt
            </div>
            <div className="px-4 py-3 text-[12px] text-foreground-muted whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
              {String(dokument.ki_roh_daten.email_text)}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-center pt-2">
          <UploadButton onClick={onOpenCamera} disabled={scanLoading} label="PDF scannen" variant="camera" />
          <UploadButton onClick={onOpenFile} disabled={scanLoading} label="PDF hochladen" variant="file" />
        </div>
        {scanLoading && (
          <div className="flex items-center gap-2 justify-center">
            <Spinner size={12} />
            <span className="text-[12px] text-brand font-medium">Wird analysiert…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono = false,
  subtle = false,
  truncate = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  subtle?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5 text-[12px]">
      <dt className="text-foreground-subtle shrink-0">{label}</dt>
      <dd
        className={cn(
          subtle ? "text-foreground-muted" : "text-foreground font-medium",
          mono ? "font-mono-amount" : "",
          truncate ? "text-right max-w-[60%] truncate" : "text-right",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function UploadButton({
  onClick,
  disabled,
  label,
  variant,
  emphasis = "secondary",
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  variant: "camera" | "file";
  /**
   * 02.06.2026 (UX-Polish im Empty-State): "primary" rendert den Button als
   * Magnetic-Brand-CTA (Hochladen ist der häufigste Pfad, Mail-PDF), während
   * "secondary" das alte Ghost-Brand-Token bleibt für Scannen-Camera-Pfad.
   * Default "secondary" rückwärtskompatibel zu existing ExtractedDocument-CTAs.
   */
  emphasis?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12px] font-medium rounded-md min-h-[36px]",
        emphasis === "primary"
          ? "btn-primary text-foreground-inverse shadow-sm"
          : "text-brand bg-brand/5 hover:bg-brand/10 border border-transparent transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
      )}
    >
      {variant === "camera" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      )}
      {label}
    </button>
  );
}

function ArticleDrawer({
  dokument,
  open,
  onToggle,
}: {
  dokument: Dokument;
  open: boolean;
  onToggle: () => void;
}) {
  if (!dokument.artikel) return null;
  return (
    <>
      {/* Sticky-Bottom-Toggle: keine Position-Toggle = kein Layout-Shift beim Öffnen/Schließen */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "sticky bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-2 w-full",
          "bg-surface/95 backdrop-blur-sm border-t border-line",
          "hover:bg-surface-hover transition-colors z-20",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        )}
      >
        <IconChevronDown
          className={cn(
            "h-3.5 w-3.5 text-foreground-subtle transition-transform duration-200",
            open ? "rotate-0" : "rotate-180",
          )}
        />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
          Erkannte Artikel ({dokument.artikel.length})
        </span>
      </button>
      {open && (
        <div className="border-t border-line bg-surface max-h-[50%] overflow-auto z-10">
          <div className="p-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-foreground-subtle">
                  <th scope="col" className="pb-1.5 font-semibold uppercase tracking-wider text-[10px]">
                    Artikel
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-semibold uppercase tracking-wider text-[10px]">
                    Menge
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-semibold uppercase tracking-wider text-[10px]">
                    Einzelpreis
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-semibold uppercase tracking-wider text-[10px]">
                    Gesamt
                  </th>
                </tr>
              </thead>
              <tbody>
                {dokument.artikel.map((a, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    <td className="py-1.5 text-foreground">{a.name}</td>
                    <td className="py-1.5 text-right font-mono-amount text-foreground-muted">
                      {a.menge}
                    </td>
                    <td className="py-1.5 text-right font-mono-amount text-foreground-muted">
                      {a.einzelpreis?.toFixed(2)} €
                    </td>
                    <td className="py-1.5 text-right font-mono-amount font-semibold text-foreground">
                      {a.gesamtpreis?.toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 pt-3 border-t border-line space-y-1">
              {dokument.netto != null && (
                <SummenZeile label="Netto" value={dokument.netto} />
              )}
              {dokument.mwst != null && <SummenZeile label="MwSt" value={dokument.mwst} />}
              {dokument.gesamtbetrag != null && (
                <SummenZeile label="Gesamt" value={dokument.gesamtbetrag} bold />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummenZeile({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between text-[12px]",
        bold ? "font-semibold text-foreground" : "text-foreground-muted",
      )}
    >
      <span>{label}</span>
      <span className="font-mono-amount">
        {value.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
      </span>
    </div>
  );
}
