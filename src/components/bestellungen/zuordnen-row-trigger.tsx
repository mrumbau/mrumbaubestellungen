"use client";

/**
 * ZuordnenRowTrigger (09.06.2026) — Inline-Reassign direkt in der Tabellen-
 * Zelle. Wird neben die BestellerCell gesetzt.
 *
 * Rendert einen kleinen ▼-Pfeil-Button. Klick öffnet Popover mit Bestellern.
 * Auswahl → Confirm-Modal → POST /api/bestellungen/[id]/zuordnen
 * (Single-Endpoint, weil pro Row).
 *
 * Caller (use-bestellung-columns.tsx) übergibt eigene Kürzel und die
 * komplette Besteller-Liste; Helper filtert auf Berechtigte + entfernt
 * aktuellen Owner + eigenen Kürzel.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  buildZuordnungActionLabel,
  buildZuordnungConfirmText,
  getAssignableBesteller,
  type AssignableBestellerOption,
} from "@/lib/zuordnung";

interface BestellerInput {
  kuerzel: string;
  name: string;
  rolle?: string;
}

export interface ZuordnenRowTriggerProps {
  bestellungId: string;
  currentKuerzel: string | null | undefined;
  eigenerKuerzel: string;
  alleBesteller: BestellerInput[];
  /** Optional — Status der Bestellung. Bei "freigegeben"/"verworfen"/"storniert" deaktiviert. */
  status?: string | null;
}

const TERMINAL_STATI = new Set(["freigegeben", "verworfen", "storniert"]);

export function ZuordnenRowTrigger({
  bestellungId,
  currentKuerzel,
  eigenerKuerzel,
  alleBesteller,
  status,
}: ZuordnenRowTriggerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmTarget, setConfirmTarget] = React.useState<AssignableBestellerOption | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const istTerminal = !!status && TERMINAL_STATI.has(status);

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

  const options = React.useMemo(
    () => getAssignableBesteller(alleBesteller, currentKuerzel ?? null, eigenerKuerzel),
    [alleBesteller, currentKuerzel, eigenerKuerzel],
  );

  if (istTerminal || options.length === 0) return null;

  async function submit(opt: AssignableBestellerOption) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bestellungen/zuordnen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bestellung_id: bestellungId,
          besteller_kuerzel: opt.kuerzel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success(
          opt.isGemeinschaft
            ? "Bestellung in Gemeinschaft zurückgegeben"
            : `Bestellung an ${opt.kuerzel} (${opt.name}) zugeordnet`,
        );
        router.refresh();
        return;
      }
      toast.error("Zuordnung fehlgeschlagen", {
        description: data.error ?? "Bitte erneut versuchen.",
      });
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Zuordnung konnte nicht gesendet werden.",
      });
    } finally {
      setSubmitting(false);
      setConfirmTarget(null);
    }
  }

  return (
    <>
      <div className="relative inline-block">
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Besteller umordnen"
          title="Besteller umordnen"
          className={cn(
            "ml-1 inline-flex items-center justify-center w-5 h-5 rounded",
            "text-foreground-subtle hover:text-foreground hover:bg-surface-hover",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            "transition-colors",
          )}
        >
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
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute z-30 mt-1 right-0 min-w-[180px] rounded-md border border-line bg-surface shadow-lg py-1",
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

      <Modal
        open={!!confirmTarget}
        onClose={() => !submitting && setConfirmTarget(null)}
        size="sm"
        variant="default"
        title={
          confirmTarget?.isGemeinschaft
            ? "In Gemeinschaft zurückgeben?"
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmTarget) submit(confirmTarget);
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
            {buildZuordnungConfirmText(confirmTarget.kuerzel, confirmTarget.name, 1)}
          </p>
        )}
      </Modal>
    </>
  );
}
