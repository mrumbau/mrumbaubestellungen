"use client";

/**
 * BestellungenConfirmDialogs — die 3 ConfirmDialogs der Bestellungen-Tabelle:
 *   - Bulk-Delete (destructive)
 *   - Quick-Freigabe (single-row)
 *   - Bulk-Freigabe (mit Skipped-Hinweis)
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Sprint 3).
 * 03.06.2026: Migration von ConfirmDialog auf <Modal variant="..."> (UX-R5).
 */

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { Bestellung } from "./types";

export interface BestellungenConfirmDialogsProps {
  // Bulk-Delete
  showDeleteDialog: boolean;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  deleteLoading: boolean;
  // Quick-Freigabe (single row)
  freigabeConfirmId: string | null;
  onCloseFreigabeConfirm: () => void;
  onConfirmQuickFreigabe: (id: string) => void;
  // Bulk-Freigabe
  showFreigebenDialog: boolean;
  onCloseFreigebenDialog: () => void;
  onConfirmBulkFreigeben: () => void;
  bulkFreigebenLoading: boolean;
  // Context für message-Texte
  bestellungen: Bestellung[];
  selected: Set<string>;
}

export function BestellungenConfirmDialogs({
  showDeleteDialog,
  onCloseDeleteDialog,
  onConfirmDelete,
  deleteLoading,
  freigabeConfirmId,
  onCloseFreigabeConfirm,
  onConfirmQuickFreigabe,
  showFreigebenDialog,
  onCloseFreigebenDialog,
  onConfirmBulkFreigeben,
  bulkFreigebenLoading,
  bestellungen,
  selected,
}: BestellungenConfirmDialogsProps) {
  const freigabeFaehig = bestellungen.filter(
    (b) => selected.has(b.id) && b.hat_rechnung && b.status !== "freigegeben",
  ).length;
  const skipped = selected.size - freigabeFaehig;

  return (
    <>
      {/* Bulk-Verwerfen Dialog — 03.06.2026 (Phase 4 Polish): domain-Sprache
          analog zu Single-Verwerfen-Dialog im Bestelldetail. */}
      <Modal
        open={showDeleteDialog}
        onClose={onCloseDeleteDialog}
        size="sm"
        variant="destructive"
        title={selected.size === 1 ? "Bestellung verwerfen?" : `${selected.size} Bestellungen verwerfen?`}
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={onCloseDeleteDialog}
              disabled={deleteLoading}
              data-modal-cancel
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              loading={deleteLoading}
            >
              {deleteLoading ? "Verwerfe…" : "Verwerfen"}
            </Button>
          </>
        )}
      >
        <p className="text-body-sm text-foreground-muted">
          {selected.size === 1
            ? "Die Bestellung wird komplett aus dem System entfernt — mit allen Belegen, Mahnungen und Kommentaren. Das kann nicht rückgängig gemacht werden."
            : `Die ${selected.size} ausgewählten Bestellungen werden komplett aus dem System entfernt — mit allen Belegen, Mahnungen und Kommentaren. Das kann nicht rückgängig gemacht werden.`}
        </p>
      </Modal>

      {/* Quick-Freigabe Bestätigung */}
      <Modal
        open={!!freigabeConfirmId}
        onClose={onCloseFreigabeConfirm}
        size="sm"
        variant="default"
        title="Rechnung freigeben?"
        footer={(
          <>
            <Button variant="secondary" onClick={onCloseFreigabeConfirm}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={() => freigabeConfirmId && onConfirmQuickFreigabe(freigabeConfirmId)}
              autoFocus
            >
              Freigeben
            </Button>
          </>
        )}
      >
        <p className="text-body-sm text-foreground-muted">
          Die Rechnung wird an die Buchhaltung übermittelt.
        </p>
      </Modal>

      {/* Bulk-Freigabe Bestätigung */}
      <Modal
        open={showFreigebenDialog}
        onClose={onCloseFreigebenDialog}
        size="sm"
        variant="default"
        title={freigabeFaehig === 1 ? "Rechnung freigeben?" : `${freigabeFaehig} Rechnungen freigeben?`}
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={onCloseFreigebenDialog}
              disabled={bulkFreigebenLoading}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={onConfirmBulkFreigeben}
              loading={bulkFreigebenLoading}
              autoFocus
            >
              {bulkFreigebenLoading ? "Gebe frei…" : "Freigeben"}
            </Button>
          </>
        )}
      >
        <p className="text-body-sm text-foreground-muted">
          {skipped > 0
            ? `${freigabeFaehig} Rechnung${freigabeFaehig === 1 ? "" : "en"} werden an die Buchhaltung übermittelt. ${skipped} ausgewählte Bestellung${skipped === 1 ? "" : "en"} überspringen wir — keine Rechnung oder bereits freigegeben.`
            : `${freigabeFaehig} Rechnung${freigabeFaehig === 1 ? "" : "en"} werden an die Buchhaltung übermittelt.`}
        </p>
      </Modal>
    </>
  );
}
