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
      {/* Bulk-Verwerfen Dialog — 03.06.2026 (Phase 4 Polish): domain-Sprache
          analog zu Single-Verwerfen-Dialog im Bestelldetail. */}
      <ConfirmDialog
        open={showDeleteDialog}
        onCancel={onCloseDeleteDialog}
        onConfirm={onConfirmDelete}
        title={selected.size === 1 ? "Bestellung verwerfen?" : `${selected.size} Bestellungen verwerfen?`}
        message={
          selected.size === 1
            ? "Die Bestellung wird komplett aus dem System entfernt — mit allen Belegen, Mahnungen und Kommentaren. Das kann nicht rückgängig gemacht werden."
            : `Die ${selected.size} ausgewählten Bestellungen werden komplett aus dem System entfernt — mit allen Belegen, Mahnungen und Kommentaren. Das kann nicht rückgängig gemacht werden.`
        }
        confirmLabel={deleteLoading ? "Verwerfe…" : "Verwerfen"}
        variant="danger"
        loading={deleteLoading}
      />

      {/* Quick-Freigabe Bestätigung */}
      <ConfirmDialog
        open={!!freigabeConfirmId}
        onCancel={onCloseFreigabeConfirm}
        onConfirm={() => freigabeConfirmId && onConfirmQuickFreigabe(freigabeConfirmId)}
        title="Rechnung freigeben?"
        message="Die Rechnung wird an die Buchhaltung übermittelt."
        confirmLabel="Freigeben"
        variant="default"
      />

      {/* Bulk-Freigabe Bestätigung */}
      <ConfirmDialog
        open={showFreigebenDialog}
        onCancel={onCloseFreigebenDialog}
        onConfirm={onConfirmBulkFreigeben}
        title={freigabeFaehig === 1 ? "Rechnung freigeben?" : `${freigabeFaehig} Rechnungen freigeben?`}
        message={
          skipped > 0
            ? `${freigabeFaehig} Rechnung${freigabeFaehig === 1 ? "" : "en"} werden an die Buchhaltung übermittelt. ${skipped} ausgewählte Bestellung${skipped === 1 ? "" : "en"} überspringen wir — keine Rechnung oder bereits freigegeben.`
            : `${freigabeFaehig} Rechnung${freigabeFaehig === 1 ? "" : "en"} werden an die Buchhaltung übermittelt.`
        }
        confirmLabel={bulkFreigebenLoading ? "Gebe frei…" : "Freigeben"}
        variant="default"
        loading={bulkFreigebenLoading}
      />
    </>
  );
}
