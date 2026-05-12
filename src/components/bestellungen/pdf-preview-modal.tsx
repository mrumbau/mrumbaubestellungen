"use client";

/**
 * PdfPreviewModal — Vollbild-Modal mit iframe-PDF.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 * Backdrop-Click + Close-Button schließen, iframe nutzt Same-Origin-Proxy
 * (`/api/pdfs/<id>?typ=<typ>`) damit Browser-X-Frame-Options nicht blocken.
 */

import { IconX } from "@/components/ui/icons";

export interface PdfPreviewModalProps {
  open: boolean;
  url: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({ open, url, onClose }: PdfPreviewModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
          <h3 className="font-headline text-sm text-foreground tracking-tight">
            PDF-Vorschau
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-canvas transition-colors"
            aria-label="PDF-Vorschau schließen"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {url ? (
            <iframe
              src={url}
              className="w-full h-full border-0"
              title="PDF-Vorschau"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground-faint">
              <svg
                className="w-12 h-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
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
        </div>
      </div>
    </div>
  );
}
