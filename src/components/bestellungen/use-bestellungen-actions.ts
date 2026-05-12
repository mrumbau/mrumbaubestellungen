"use client";

/**
 * useBestellungenActions — Hook für Bulk- und Quick-Freigabe + Bulk-Delete.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Sprint 2).
 * Konsolidiert 3× async-Handler + 5× useState + Toast-Feedback.
 *
 * Returns:
 *   - deleteLoading, showDeleteDialog, setShowDeleteDialog, handleBulkDelete
 *   - bulkFreigebenLoading, showFreigebenDialog, setShowFreigebenDialog, handleBulkFreigeben
 *   - freigabeLoadingId, freigabeConfirmId, setFreigabeConfirmId, handleQuickFreigabe
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

export function useBestellungenActions({
  selected,
  setSelected,
}: {
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showFreigebenDialog, setShowFreigebenDialog] = useState(false);
  const [bulkFreigebenLoading, setBulkFreigebenLoading] = useState(false);
  const [freigabeLoadingId, setFreigabeLoadingId] = useState<string | null>(null);
  const [freigabeConfirmId, setFreigabeConfirmId] = useState<string | null>(null);

  async function handleQuickFreigabe(bestellungId: string) {
    setFreigabeConfirmId(null);
    setFreigabeLoadingId(bestellungId);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
        toast.success("Bestellung freigegeben");
        return;
      }
      const data = await res.json().catch(() => null);
      toast.error("Freigabe fehlgeschlagen", {
        description: data?.error ?? "Bitte erneut versuchen.",
      });
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Freigabe konnte nicht gesendet werden.",
      });
    } finally {
      setFreigabeLoadingId(null);
    }
  }

  async function handleBulkDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_ids: Array.from(selected) }),
      });
      if (res.ok) {
        const count = selected.size;
        setSelected(new Set());
        setShowDeleteDialog(false);
        router.refresh();
        toast.success(
          `${count} ${count === 1 ? "Bestellung entfernt" : "Bestellungen entfernt"}`,
        );
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Löschen fehlgeschlagen", {
          description: data.error || "Bitte erneut versuchen.",
        });
      }
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Bestellungen konnten nicht gelöscht werden.",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  /**
   * 11.05.2026 — Bulk-Freigabe: nutzt /api/bestellungen/bulk-freigeben.
   * Server skippt bereits-freigegebene/no-rechnung/no-permission und liefert
   * Summary zurück. Toast je nach Ergebnis (success/warning/info).
   */
  async function handleBulkFreigeben() {
    setBulkFreigebenLoading(true);
    try {
      const res = await fetch("/api/bestellungen/bulk-freigeben", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Bulk-Freigabe fehlgeschlagen", {
          description: data.error || "Bitte erneut versuchen.",
        });
        return;
      }
      const freigegebenN = (data.freigegeben ?? []).length;
      const alreadyN = (data.already_freigegeben ?? []).length;
      const noRechnungN = (data.no_rechnung ?? []).length;
      const noPermissionN = (data.no_permission ?? []).length;
      const errorsN = (data.errors ?? []).length;
      const parts: string[] = [];
      if (freigegebenN > 0) parts.push(`${freigegebenN} freigegeben`);
      if (alreadyN > 0) parts.push(`${alreadyN} bereits freigegeben`);
      if (noRechnungN > 0) parts.push(`${noRechnungN} ohne Rechnung`);
      if (noPermissionN > 0) parts.push(`${noPermissionN} ohne Berechtigung`);
      if (errorsN > 0) parts.push(`${errorsN} Fehler`);

      setShowFreigebenDialog(false);
      setSelected(new Set());
      router.refresh();

      if (errorsN > 0 || noRechnungN > 0 || noPermissionN > 0) {
        toast.warning("Bulk-Freigabe teilweise erfolgreich", {
          description: parts.join(" · "),
        });
      } else if (freigegebenN > 0) {
        toast.success(parts.join(" · "));
      } else {
        toast.info("Keine Bestellung freigegeben", { description: parts.join(" · ") });
      }
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Bulk-Freigabe konnte nicht ausgeführt werden.",
      });
    } finally {
      setBulkFreigebenLoading(false);
    }
  }

  return {
    // Delete
    showDeleteDialog,
    setShowDeleteDialog,
    deleteLoading,
    handleBulkDelete,
    // Bulk-Freigabe
    showFreigebenDialog,
    setShowFreigebenDialog,
    bulkFreigebenLoading,
    handleBulkFreigeben,
    // Quick-Freigabe
    freigabeLoadingId,
    freigabeConfirmId,
    setFreigabeConfirmId,
    handleQuickFreigabe,
  };
}
