"use client";

/**
 * PdfPreviewModal — Vollbild-Modal mit iframe-PDF.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 * 12.05.2026 (DESIGN-Critique #8): Migriert auf shared <Modal> für
 * native-dialog-A11y (Focus-Trap, ESC, aria-labelledby, backdrop-click).
 *
 * 12.05.2026 (User-Feedback Multi-Doc): wenn mehr als 1 Dokument vom
 * gleichen Typ existiert (z.B. Raab-Karcher mit 2 Teilrechnungen), bekommt
 * der User Prev/Next-Navigation + "1/N"-Counter. Pfeile sind Keyboard-
 * arrows-bedienbar.
 */

import { useEffect } from "react";
import { Modal } from "@/components/ui/modal";

export interface PdfPreviewDoc {
  id: string;
  created_at: string | null;
  gesamtbetrag: number | null;
}

export interface PdfPreviewModalProps {
  open: boolean;
  url: string | null;
  onClose: () => void;
  docs?: PdfPreviewDoc[];
  docIndex?: number;
  onGoTo?: (index: number) => void;
  typ?: string | null;
}

const TYP_LABEL: Record<string, string> = {
  bestellbestaetigung: "Bestellbestätigung",
  lieferschein: "Lieferschein",
  rechnung: "Rechnung",
  versandbestaetigung: "Versandbestätigung",
  aufmass: "Aufmaß",
  leistungsnachweis: "Leistungsnachweis",
};

export function PdfPreviewModal({
  open,
  url,
  onClose,
  docs = [],
  docIndex = 0,
  onGoTo,
  typ,
}: PdfPreviewModalProps) {
  const hasMulti = docs.length > 1 && !!onGoTo;
  const canPrev = hasMulti && docIndex > 0;
  const canNext = hasMulti && docIndex < docs.length - 1;
  const typLabel = typ && TYP_LABEL[typ] ? TYP_LABEL[typ] : "PDF";

  // Keyboard-Arrows zur Navigation zwischen Dokumenten
  useEffect(() => {
    if (!open || !hasMulti) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        onGoTo?.(docIndex - 1);
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        onGoTo?.(docIndex + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hasMulti, canPrev, canNext, docIndex, onGoTo]);

  const title = hasMulti ? (
    <span className="flex items-center gap-3">
      <span>{typLabel}</span>
      <span className="inline-flex items-center gap-2 rounded-full bg-canvas border border-line px-2 py-0.5 text-[11px] font-mono-amount text-foreground-muted">
        <button
          type="button"
          onClick={() => onGoTo?.(docIndex - 1)}
          disabled={!canPrev}
          aria-label="Vorheriges Dokument"
          className="inline-flex items-center justify-center w-5 h-5 rounded text-foreground-subtle hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="tabular-nums">
          {docIndex + 1} <span className="text-foreground-subtle">/</span> {docs.length}
        </span>
        <button
          type="button"
          onClick={() => onGoTo?.(docIndex + 1)}
          disabled={!canNext}
          aria-label="Nächstes Dokument"
          className="inline-flex items-center justify-center w-5 h-5 rounded text-foreground-subtle hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </span>
    </span>
  ) : (
    "PDF-Vorschau"
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="2xl"
      className="h-[85vh]"
      contentClassName="h-[85vh]"
      bodyClassName="overflow-hidden p-0"
    >
      {url ? (
        <iframe
          src={url}
          className="w-full h-full border-0"
          title={hasMulti ? `${typLabel} ${docIndex + 1} von ${docs.length}` : "PDF-Vorschau"}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground-faint">
          <svg
            className="w-12 h-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="text-sm">Keine PDF verfügbar</p>
        </div>
      )}
    </Modal>
  );
}
