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
  onAffectedRows,
}: {
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  /**
   * 12.05.2026 (Continuity-Patch): wird mit den effektiv erfolgreichen IDs
   * gerufen, BEVOR der Refresh startet. Caller kann Bulk-Success-Flash
   * setzen. Refresh wird dann 1100ms verzögert damit die Flash-Animation
   * im Sichtfeld bleibt bevor die Rows ggf. aus der "offen"-Liste fallen.
   */
  onAffectedRows?: (ids: string[]) => void;
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
        // 12.05.2026 (Continuity-Patch): Single-Row-Freigabe bekommt auch
        // den Success-Flash damit der "ich hab's geklickt → es ist passiert"
        // Moment visuell verbunden ist.
        onAffectedRows?.([bestellungId]);
        if (onAffectedRows) {
          setTimeout(() => router.refresh(), 1100);
        } else {
          router.refresh();
        }
        toast.success("Bestellung freigegeben");
        return;
      }
      const data = await res.json().catch(() => null);

      // 12.05.2026 (Freigabe-Bug-Härtung):
      // - 409 "bereits freigegeben" ist KEIN Fehler — passiert wenn ein
      //   anderer User (oder Tab) gerade freigegeben hat. Silent-Refresh
      //   damit der UI-State frisch ist + info-Toast statt error-Toast.
      // - 403 "Keine Berechtigung" mit klarerer Erklärung.
      // - Sonstige Fehler bekommen den Server-Error-Text mit eingeblendet.
      if (res.status === 409) {
        router.refresh();
        toast.info("Bereits freigegeben", {
          description: "Diese Bestellung wurde inzwischen von einem anderen Tab oder User freigegeben.",
        });
        return;
      }
      if (res.status === 403) {
        toast.error("Keine Berechtigung", {
          description:
            "Du kannst nur deine eigenen Material-Bestellungen freigeben (Subunternehmer + Abo dürfen alle).",
        });
        return;
      }
      toast.error("Freigabe fehlgeschlagen", {
        description: data?.error ?? `Server antwortete mit Status ${res.status}.`,
      });
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Freigabe konnte nicht gesendet werden. Bitte Verbindung prüfen.",
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

      // 12.05.2026 (Continuity-Patch): wenn Caller einen Flash-Receiver
      // bereitgestellt hat, emit affected IDs und delay refresh damit die
      // Rows kurz Success-Green aufleuchten bevor sie aus der Liste fallen.
      const freigegebenIds: string[] = (data.freigegeben ?? []).map(
        (x: { id?: string } | string) =>
          typeof x === "string" ? x : (x.id ?? ""),
      ).filter(Boolean);
      if (onAffectedRows && freigegebenIds.length > 0) {
        onAffectedRows(freigegebenIds);
        setTimeout(() => router.refresh(), 1100);
      } else {
        router.refresh();
      }

      // 12.05.2026 (Freigabe-Bug-Härtung): differenzierte Toast-Meldungen
      // statt pauschal "teilweise erfolgreich". Wenn 0 freigegeben +
      // alle als "bereits freigegeben" zurückkommen → kein Fehler-Gefühl
      // sondern info-Toast (Race mit anderem Tab/User).
      const problemsN = errorsN + noRechnungN + noPermissionN;
      if (freigegebenN > 0 && problemsN > 0) {
        toast.warning("Bulk-Freigabe teilweise erfolgreich", {
          description: parts.join(" · "),
        });
      } else if (freigegebenN === 0 && alreadyN > 0 && problemsN === 0) {
        toast.info("Bereits freigegeben", {
          description: `Alle ${alreadyN} Bestellungen waren schon freigegeben (vermutlich von einem anderen Tab oder User).`,
        });
      } else if (freigegebenN === 0 && noPermissionN > 0) {
        toast.error("Keine Berechtigung", {
          description: `${noPermissionN} ${noPermissionN === 1 ? "Bestellung gehört" : "Bestellungen gehören"} einem anderen Besteller. Nur eigene Material-Bestellungen freigebbar (SU + Abo: alle).`,
        });
      } else if (freigegebenN === 0 && noRechnungN > 0) {
        toast.error("Rechnung fehlt", {
          description: `${noRechnungN} ${noRechnungN === 1 ? "Bestellung hat" : "Bestellungen haben"} noch keine Rechnung. Erst Rechnung-PDF zuordnen, dann freigeben.`,
        });
      } else if (freigegebenN === 0 && errorsN > 0) {
        toast.error("Server-Fehler bei Freigabe", {
          description: `${errorsN} Bestellung${errorsN === 1 ? "" : "en"} konnte${errorsN === 1 ? "" : "n"} nicht freigegeben werden. Logs prüfen.`,
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
