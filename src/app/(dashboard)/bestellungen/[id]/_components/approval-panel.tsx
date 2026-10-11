"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { IconCheck, IconLock, IconTrash } from "@/components/ui/icons";
import { PayPalBadge } from "@/components/ui/cells/paypal-badge";
import type { Bestellung, Freigabe } from "./types";
import type { BenutzerProfil } from "@/lib/auth";
import { darfEntsperren, darfSperren, istGesperrt } from "@/lib/sperre";

import { istVerwaltung } from "@/lib/rollen";
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
  bezahltBereits,
  zahlungsmethode,
  onOpenSperreDialog,
  onEntsperren,
  sperreLoading = false,
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
  /** 03.06.2026 — Aggregiert aus dokumente[] vom Shell. */
  bezahltBereits?: boolean | null;
  /** 03.06.2026 — Aggregiert aus dokumente[] vom Shell. */
  zahlungsmethode?: string | null;
  /** 11.10.2026 — Rechnung sperren mit Grund (lib/sperre.ts). */
  onOpenSperreDialog?: () => void;
  onEntsperren?: () => void;
  sperreLoading?: boolean;
  variant?: "sidebar" | "mobile" | "mobile-bar";
}) {
  const istGutschrift = bestellung.ist_gutschrift === true;
  // 11.10.2026 — Sperre: blockiert Freigabe (und in der Buchhaltung die
  // Zahlung), bleibt aber sichtbar. Wer sie setzen oder aufheben darf,
  // entscheidet lib/sperre.ts — hier nur die Anzeige.
  const gesperrt = istGesperrt(bestellung);
  const kannSperren =
    !!onOpenSperreDialog && !gesperrt && !bestellung.bezahlt_am && darfSperren(profil, bestellung);
  const kannEntsperren = !!onEntsperren && gesperrt && darfEntsperren(profil, bestellung);
  // 21.09.2026 — Vorausbezahlt (Amazon Business, PayPal-Shops) braucht wie
  // eine Gutschrift keine Freigabe: das Geld ist weg, es gibt nichts mehr
  // freizugeben. Die Bestellung bleibt trotzdem sichtbar — kontrolliert
  // werden muss ja noch, ob die Ware angekommen ist.
  const istVorausbezahlt = bestellung.vorausbezahlt === true;
  const ohneFreigabe = istGutschrift || istVorausbezahlt;

  // Mobile bottom bar — only Freigabe CTA, no other controls
  if (variant === "mobile-bar") {
    if (ohneFreigabe || gesperrt) return null;
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
    istVerwaltung(profil.rolle) ||
    (profil.rolle === "besteller" &&
      (bestellung.besteller_kuerzel === profil.kuerzel ||
        bestellung.bestellungsart === "subunternehmer" ||
        bestellung.bestellungsart === "abo"));

  return (
    <div className="flex flex-col gap-3">
      {/* 03.06.2026 — PayPal-/Bereits-bezahlt-Marker oben. Sofort sichtbar
          damit klar ist: KI hat erkannt dass diese Rechnung bereits beglichen
          ist, NJ muss nichts mehr klicken. */}
      {bezahltBereits && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-line-subtle bg-canvas">
          <PayPalBadge
            bezahltBereits={true}
            zahlungsmethode={zahlungsmethode ?? null}
            size="md"
          />
          <div className="flex flex-col">
            <span className="text-meta font-semibold text-foreground">
              {zahlungsmethode === "paypal" ? "PayPal bezahlt" : "Bereits bezahlt"}
            </span>
            <span className="text-eyebrow uppercase tracking-[0.14em] text-foreground-subtle">
              Auto-erkannt aus Rechnung
            </span>
          </div>
        </div>
      )}

      {/* Vorausbezahlt-Banner — ersetzt den Freigabe-CTA.
          Im Gegensatz zum "Bereits bezahlt"-Hinweis oben stammt das hier aus
          den Händler-Stammdaten und nicht aus der KI-Erkennung am Beleg. */}
      {istVorausbezahlt && !freigabe && (
        <Card padding="md" className="bg-success-bg border-success-border">
          <div className="flex items-center gap-2">
            <IconCheck className="h-4 w-4 text-success" />
            <p className="font-headline text-body-sm text-success">Vorausbezahlt</p>
          </div>
          <p className="text-meta text-success/80 mt-1.5 ml-6">
            Bei diesem Händler wird im Voraus bezahlt — keine Freigabe nötig.
            Bitte nur prüfen, ob die Ware angekommen ist.
          </p>
        </Card>
      )}

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

      {/* 11.10.2026 — Sperre: steht ueber allem, mit Urheber, Datum, Grund.
          Der Freigabe-CTA erscheint darunter nicht, solange sie gilt. */}
      {gesperrt && (
        <Card padding="md" className="bg-error-bg border-error/30">
          <div className="flex items-center gap-2">
            <IconLock className="h-4 w-4 text-error" />
            <p className="font-headline text-body-sm text-error">Rechnung gesperrt</p>
          </div>
          <p className="text-meta text-error/80 mt-1.5 ml-6">
            Von {bestellung.gesperrt_von ?? "?"} am{" "}
            {bestellung.gesperrt_am ? new Date(bestellung.gesperrt_am).toLocaleString("de-DE") : "–"}
          </p>
          {bestellung.sperrgrund && (
            <p className="text-meta text-foreground mt-1 ml-6 italic">{bestellung.sperrgrund}</p>
          )}
          <p className="text-meta text-error/80 mt-1.5 ml-6">
            Keine Freigabe, keine Zahlung, bis die Sperre aufgehoben ist.
          </p>
          {kannEntsperren && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 ml-6"
              onClick={onEntsperren}
              loading={sperreLoading}
              disabled={sperreLoading}
            >
              Sperre aufheben
            </Button>
          )}
        </Card>
      )}

      {/* Primary CTA — Freigeben ODER bereits-freigegeben-State ODER helper */}
      {gesperrt ? null : !ohneFreigabe && freigabe ? (
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
      ) : kannFreigeben && !ohneFreigabe ? (
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

      {/* 11.10.2026 — Rechnung sperren: Ghost wie Verwerfen, aber die
          sanftere Bremse. Der Vorgang bleibt, nur das Geld steht still. */}
      {kannSperren && (
        <>
          <div className="industrial-line my-1" aria-hidden="true" />
          <button
            type="button"
            onClick={onOpenSperreDialog}
            disabled={sperreLoading}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5 py-2 text-meta font-medium rounded-md",
              "text-foreground-subtle bg-transparent border border-transparent",
              "hover:text-error hover:bg-error-bg transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            )}
          >
            <IconLock className="h-3.5 w-3.5" />
            Rechnung sperren
          </button>
        </>
      )}

      {/* Ghost/Destructive — Bestellung verwerfen. Durch industrial-line
          vom Rest getrennt. Ghost-Style mit hover:error Affordance.
          Modal (variant="destructive") ist die echte Sicherheits-Brücke. */}
      {showVerwerfen && (
        <>
          {!kannSperren && <div className="industrial-line my-1" aria-hidden="true" />}
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
