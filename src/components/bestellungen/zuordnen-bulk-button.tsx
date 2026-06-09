"use client";

/**
 * ZuordnenBulkButton (09.06.2026) — Bulk-Toolbar-Eintrag „Zuordnen ▼".
 *
 * Drei-Schritt-UX:
 *   1. Click auf den Button → Popover öffnet mit den Besteller-Optionen.
 *   2. User wählt Besteller (oder „Gemeinschaft") → Confirm-Modal öffnet.
 *   3. User bestätigt → Caller-Handler triggert POST /bulk-zuordnen.
 *
 * Popover schließt bei Outside-Click, Escape, oder Auswahl.
 * Confirm-Modal nutzt das gleiche Pattern wie die anderen Bulk-Confirms.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
  buildZuordnungActionLabel,
  buildZuordnungConfirmText,
  type AssignableBestellerOption,
} from "@/lib/zuordnung";

export interface ZuordnenBulkButtonProps {
  count: number;
  /** Optionen aus getAssignableBesteller(...) gefiltert. */
  options: AssignableBestellerOption[];
  loading?: boolean;
  /**
   * Wird gerufen nachdem der User im Confirm-Modal bestätigt hat.
   * Erwartet `besteller_kuerzel` (z.B. "MT" oder "UNBEKANNT") und das
   * Anzeige-Label (für Toast-Text).
   */
  onConfirm: (kuerzel: string, label: string) => Promise<void> | void;
}

export function ZuordnenBulkButton({
  count,
  options,
  loading = false,
  onConfirm,
}: ZuordnenBulkButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [confirmTarget, setConfirmTarget] = React.useState<AssignableBestellerOption | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Outside-Click / Escape schließt Popover
  React.useEffect(() => {
    if (!open) return;
    function handleDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDoc);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDoc);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const disabled = count === 0 || options.length === 0;
  const buttonTitle =
    count === 0
      ? "Keine Bestellungen ausgewählt"
      : options.length === 0
        ? "Keine Zuordnungs-Ziele verfügbar"
        : `${count} ${count === 1 ? "Bestellung" : "Bestellungen"} zuordnen`;

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          disabled={disabled || loading}
          title={buttonTitle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium",
            "bg-surface border border-line-strong text-foreground",
            "hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
          )}
        >
          <span>Zuordnen{count > 0 ? ` (${count})` : ""}</span>
          <svg
            aria-hidden="true"
            className={cn("w-3 h-3 transition-transform", open && "rotate-180")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "absolute z-30 mt-1 right-0 min-w-[180px] rounded-md border border-line bg-surface shadow-lg",
              "py-1",
            )}
          >
            {options.map((opt) => (
              <button
                key={opt.kuerzel + opt.name}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmTarget(opt);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[13px]",
                  "hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover",
                  opt.isGemeinschaft && "border-t border-line-subtle text-foreground-muted",
                )}
              >
                <span className="font-mono-amount font-semibold">{opt.kuerzel}</span>
                <span className="ml-2 text-foreground-subtle">{opt.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirm-Modal — gemeinsam für alle Auswahl-Ziele */}
      <Modal
        open={!!confirmTarget}
        onClose={() => !submitting && setConfirmTarget(null)}
        size="sm"
        variant="default"
        title={
          confirmTarget?.isGemeinschaft
            ? count === 1
              ? "In Gemeinschaft zurückgeben?"
              : "In Gemeinschaft zurückgeben?"
            : "Zuordnen?"
        }
        footer={
          confirmTarget ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={submitting}
                data-modal-cancel
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                onClick={async () => {
                  if (!confirmTarget) return;
                  setSubmitting(true);
                  try {
                    await onConfirm(confirmTarget.kuerzel, confirmTarget.name);
                  } finally {
                    setSubmitting(false);
                    setConfirmTarget(null);
                  }
                }}
              >
                {submitting
                  ? "Speichere…"
                  : buildZuordnungActionLabel(confirmTarget.kuerzel)}
              </Button>
            </>
          ) : null
        }
      >
        {confirmTarget && (
          <p className="text-body-sm text-foreground-muted">
            {buildZuordnungConfirmText(
              confirmTarget.kuerzel,
              confirmTarget.name,
              count,
            )}
          </p>
        )}
      </Modal>
    </>
  );
}
