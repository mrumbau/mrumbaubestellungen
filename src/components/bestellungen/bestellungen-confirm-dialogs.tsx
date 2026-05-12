"use client";

/**
 * BestellungenConfirmDialogs — die 3 ConfirmDialogs der Bestellungen-Tabelle:
 *   - Bulk-Delete (destructive)
 *   - Quick-Freigabe (single-row)
 *   - Bulk-Freigabe (mit Skipped-Hinweis)
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Sprint 3).
 */

import { ConfirmDialog } from "@/components/confirm-dialog";
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
      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onCancel={onCloseDeleteDialog}
        onConfirm={onConfirmDelete}
        title="Bestellungen entfernen"
        message={`${selected.size} Bestellung${selected.size !== 1 ? "en" : ""} und alle zugehörigen Dokumente unwiderruflich löschen?`}
        confirmLabel={deleteLoading ? "Lösche..." : "Endgültig löschen"}
        variant="danger"
        loading={deleteLoading}
      />

      {/* Quick-Freigabe Bestätigung */}
      <ConfirmDialog
        open={!!freigabeConfirmId}
        onCancel={onCloseFreigabeConfirm}
        onConfirm={() => freigabeConfirmId && onConfirmQuickFreigabe(freigabeConfirmId)}
        title="Rechnung freigeben"
        message="Soll die Rechnung an die Buchhaltung freigegeben werden?"
        confirmLabel="Freigeben"
        variant="default"
      />

      {/* Bulk-Freigabe Bestätigung */}
      <ConfirmDialog
        open={showFreigebenDialog}
        onCancel={onCloseFreigebenDialog}
        onConfirm={onConfirmBulkFreigeben}
        title="Bestellungen freigeben"
        message={
          skipped > 0
            ? `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben und an die Buchhaltung übermitteln. ${skipped} ausgewählte werden übersprungen (keine Rechnung oder bereits freigegeben).`
            : `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben und an die Buchhaltung übermitteln?`
        }
        confirmLabel={bulkFreigebenLoading ? "Gebe frei..." : "Freigeben"}
        variant="default"
        loading={bulkFreigebenLoading}
      />
    </>
  );
}
