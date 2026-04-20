"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { IconCheck, IconTrash } from "@/components/ui/icons";
import type { Bestellung, Freigabe } from "./types";
import type { BenutzerProfil } from "@/lib/auth";

/**
 * ApprovalPanel — three destructive-aware control surfaces.
 *
 * Renders a variant that matches its location:
 *   - variant="sidebar"    → compact sidebar cards (default)
 *   - variant="mobile"     → larger buttons for the mobile aktionen-tab
 *   - variant="mobile-bar" → the fixed bottom bar with only the Freigabe CTA
 *
 * Role-gating:
 *   - Freigabe: only visible when `kannFreigeben` is true (besteller, admin, or SU/Abo)
 *   - Verwerfen: admin-only
 *   - Mahnung-quittieren: visible to everyone who sees the order with an open Mahnung
 */
export function ApprovalPanel({
  bestellung,
  freigabe,
  profil,
  kannFreigeben,
  hatRechnung,
  loading,
  verwerfenLoading,
  freigabeError,
  onOpenFreigabeDialog,
  onOpenVerwerfenDialog,
  onMahnungQuittieren,
  variant = "sidebar",
}: {
  bestellung: Bestellung;
  freigabe: Freigabe | null;
  profil: BenutzerProfil;
  kannFreigeben: boolean;
  hatRechnung: boolean;
  loading: boolean;
  verwerfenLoading: boolean;
  freigabeError: string | null;
  onOpenFreigabeDialog: () => void;
  onOpenVerwerfenDialog: () => void;
  onMahnungQuittieren: () => void;
  variant?: "sidebar" | "mobile" | "mobile-bar";
}) {
  // Mobile bottom bar — only Freigabe CTA, no other controls
  if (variant === "mobile-bar") {
    if (!kannFreigeben || freigabe || !hatRechnung) return null;
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-surface/95 backdrop-blur-sm border-t border-line z-50 safe-area-bottom">
        <Button
          size="lg"
          fullWidth
          onClick={onOpenFreigabeDialog}
          loading={loading}
          iconLeft={<IconCheck />}
        >
          Rechnung freigeben
        </Button>
      </div>
    );
  }

  const isMobile = variant === "mobile";

  return (
    <>
      {/* Freigabe state */}
      {freigabe ? (
        <Card padding="md" className="bg-success-bg border-success-border">
          <div className="flex items-center gap-2">
            <IconCheck className="h-4 w-4 text-success" />
            <p className="font-headline text-[13px] text-success">Freigegeben</p>
          </div>
          <p className="text-[11.5px] text-success/80 mt-1.5 ml-6">
            Von {freigabe.freigegeben_von_name} am{" "}
            {new Date(freigabe.freigegeben_am).toLocaleString("de-DE")}
          </p>
          {freigabe.kommentar && (
            <p className="text-[11.5px] text-success/80 mt-1 ml-6 italic">
              {freigabe.kommentar}
            </p>
          )}
        </Card>
      ) : kannFreigeben ? (
        <Card padding={isMobile ? "none" : "md"} className={isMobile ? "p-0 bg-transparent border-0 shadow-none" : ""}>
          <Button
            size={isMobile ? "lg" : "md"}
            fullWidth
            onClick={onOpenFreigabeDialog}
            disabled={loading || !hatRechnung}
            loading={loading}
            iconLeft={<IconCheck />}
            className={cn(
              !hatRechnung && "bg-line text-foreground-subtle cursor-not-allowed hover:bg-line hover:translate-y-0 hover:shadow-none",
            )}
            title={!hatRechnung ? "Rechnung muss zuerst vorhanden sein" : undefined}
          >
            {hatRechnung ? "Rechnung freigeben" : "Rechnung fehlt noch"}
          </Button>
          {!hatRechnung && !isMobile && (
            <p className="text-[10px] text-foreground-subtle mt-2 text-center">
              Die Freigabe wird möglich sobald eine Rechnung vorliegt.
            </p>
          )}
          {freigabeError && (
            <Alert tone="error" className="mt-2">
              {freigabeError}
            </Alert>
          )}
        </Card>
      ) : null}

      {/* Mahnung quittieren */}
      {bestellung.mahnung_am && (
        <button
          type="button"
          onClick={onMahnungQuittieren}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-medium rounded-lg",
            "border border-warning-border bg-warning-bg text-warning",
            "hover:bg-warning hover:border-warning hover:text-white transition-colors",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          )}
        >
          <IconCheck className="h-3.5 w-3.5" />
          Mahnung quittieren
        </button>
      )}

      {/* Bestellung verwerfen — admin only */}
      {profil.rolle === "admin" && (
        <button
          type="button"
          onClick={onOpenVerwerfenDialog}
          disabled={verwerfenLoading}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-medium rounded-lg",
            "border border-error-border bg-transparent text-error",
            "hover:bg-error hover:border-error hover:text-white transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          )}
        >
          <IconTrash className="h-3.5 w-3.5" />
          Bestellung verwerfen
        </button>
      )}
    </>
  );
}
