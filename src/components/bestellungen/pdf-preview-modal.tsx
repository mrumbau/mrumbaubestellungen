"use client";

/**
 * PdfPreviewModal — Vollbild-Modal mit iframe-PDF.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 * 12.05.2026 (DESIGN-Critique #8): Migriert auf shared <Modal> für
 * native-dialog-A11y (Focus-Trap, ESC, aria-labelledby, backdrop-click).
 * iframe nutzt Same-Origin-Proxy (`/api/pdfs/<id>?typ=<typ>`) damit Browser-
 * X-Frame-Options nicht blocken.
 */

import { Modal } from "@/components/ui/modal";

export interface PdfPreviewModalProps {
  open: boolean;
  url: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({ open, url, onClose }: PdfPreviewModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="PDF-Vorschau"
      size="2xl"
      className="h-[85vh]"
      contentClassName="h-[85vh]"
      bodyClassName="overflow-hidden p-0"
    >
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
