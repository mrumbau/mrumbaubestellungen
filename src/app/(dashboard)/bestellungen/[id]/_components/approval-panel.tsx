"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { IconCheck, IconTrash } from "@/components/ui/icons";
import type { Bestellung, Freigabe } from "./types";
import type { BenutzerProfil } from "@/lib/auth";

/**
 * ApprovalPanel (UX-R3, 03.06.2026) — Aktion-Block der Detail-Sidebar.
 *
 * CTA-Hierarchie nach DESIGN.md v2 Section 3:
 *   - **Primary** = Freigeben (der eigentliche Workflow-Schritt). Magnetic
 *     btn-primary, full-width, Hero.
 *   - **Secondary** = Mahnung quittieren. Warning-getöntes Pill, aber
 *     visuell zurückgenommen. Niemals primary — Mahnung quittieren ist
 *     Pflege-Aktion, nicht Workflow-Abschluss.
 *   - **Ghost / Destructive** = Bestellung verwerfen. Ghost-Style mit
 *     hover:error Affordance, durch industrial-line vom Rest abgetrennt.
 *     Modal (variant="destructive") ist die echte Sicherheits-Brücke.
 *
 * Drei-Sprachen-Disziplin: max 1 Primary CTA pro Surface. Wenn freigegeben:
 * Statt-CTA = Success-State-Card. Wenn !hatRechnung: Statt-CTA = ruhiger
 * Helper-Hinweis. Verwerfen darf parallel sichtbar bleiben — es ist ein
 * Eskape-Pfad, nicht Workflow.
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
  const istGutschrift = bestellung.ist_gutschrift === true;

  // Mobile bottom bar — only Freigabe CTA, no other controls
  if (variant === "mobile-bar") {
    if (istGutschrift) return null;
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

  const showVerwerfen =
    profil.rolle === "admin" ||
    (profil.rolle === "besteller" &&
      (bestellung.besteller_kuerzel === profil.kuerzel ||
        bestellung.bestellungsart === "subunternehmer" ||
        bestellung.bestellungsart === "abo"));

  return (
    <div className="flex flex-col gap-3">
      {/* Gutschrift-Info-Banner — ersetzt den Freigabe-CTA */}
      {istGutschrift && !freigabe && (
        <Card padding="md" className="bg-success-bg border-success-border">
          <div className="flex items-center gap-2">
            <IconCheck className="h-4 w-4 text-success" />
            <p className="font-headline text-body-sm text-success">Gutschrift</p>
          </div>
          <p className="text-meta text-success/80 mt-1.5 ml-6">
            Rückerstattung — keine Freigabe nötig. Direkt in der Buchhaltung sichtbar.
          </p>
        </Card>
      )}

      {/* Primary CTA — Freigeben ODER bereits-freigegeben-State ODER helper */}
      {!istGutschrift && freigabe ? (
        <Card padding="md" className="bg-success-bg border-success-border">
          <div className="flex items-center gap-2">
            <IconCheck className="h-4 w-4 text-success" />
            <p className="font-headline text-body-sm text-success">Freigegeben</p>
          </div>
          <p className="text-meta text-success/80 mt-1.5 ml-6">
            Von {freigabe.freigegeben_von_name} am{" "}
            {new Date(freigabe.freigegeben_am).toLocaleString("de-DE")}
          </p>
          {freigabe.kommentar && (
            <p className="text-meta text-success/80 mt-1 ml-6 italic">
              {freigabe.kommentar}
            </p>
          )}
        </Card>
      ) : kannFreigeben && !istGutschrift ? (
        hatRechnung ? (
          <Card
            padding={isMobile ? "none" : "md"}
            className={isMobile ? "p-0 bg-transparent border-0 shadow-none" : ""}
          >
            <Button
              size={isMobile ? "lg" : "md"}
              fullWidth
              onClick={onOpenFreigabeDialog}
              disabled={loading}
              loading={loading}
              iconLeft={<IconCheck />}
            >
              Rechnung freigeben
            </Button>
            {freigabeError && (
              <Alert tone="error" className="mt-2">
                {freigabeError}
              </Alert>
            )}
          </Card>
        ) : (
          !isMobile && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-line-subtle bg-canvas text-meta text-foreground-muted">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-foreground-faint"
              />
              <span>Freigabe möglich, sobald eine Rechnung eingeht.</span>
            </div>
          )
        )
      ) : null}

      {/* Secondary CTA — Mahnung quittieren. Visuell zurückgenommen
          (warning-getöntes Pill, nicht laut). Pflege-Aktion, niemals
          primary. */}
      {bestellung.mahnung_am && (
        <button
          type="button"
          onClick={onMahnungQuittieren}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 text-meta font-medium rounded-md",
            "border border-warning-border bg-warning-bg/40 text-warning",
            "hover:bg-warning-bg hover:border-warning transition-colors",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          )}
        >
          <IconCheck className="h-3.5 w-3.5" />
          Mahnung quittieren
        </button>
      )}

      {/* Ghost/Destructive — Bestellung verwerfen. Durch industrial-line
          vom Rest getrennt. Ghost-Style mit hover:error Affordance.
          Modal (variant="destructive") ist die echte Sicherheits-Brücke. */}
      {showVerwerfen && (
        <>
          <div className="industrial-line my-1" aria-hidden="true" />
          <button
            type="button"
            onClick={onOpenVerwerfenDialog}
            disabled={verwerfenLoading}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5 py-2 text-meta font-medium rounded-md",
              "text-foreground-subtle bg-transparent border border-transparent",
              "hover:text-error hover:bg-error-bg transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            )}
          >
            <IconTrash className="h-3.5 w-3.5" />
            Bestellung verwerfen
          </button>
        </>
      )}
    </div>
  );
}
