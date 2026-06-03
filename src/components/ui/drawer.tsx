"use client";

/**
 * Drawer — slide-out container über native `<dialog>`-API.
 *
 * 03.06.2026 (Pool 2.0 Sprint 1): UX-Multiplikator für Pool-Triage.
 * Card-Click öffnet Drawer mit Quick-Actions statt Page-Wechsel; zurück
 * = sofort wieder Pool, ohne State-Loss.
 *
 * Visual contract:
 * - Desktop (≥ md):  slide-from-right, fixed `width: min(60vw, 720px)`
 * - Mobile  (< md):  slide-from-bottom, `height: 90dvh`, `vh` bewusst
 *                    vermieden (iOS Safari Adress-Leisten-Bug)
 *
 * A11y:
 * - native `<dialog>` liefert focus-trap + ESC + Scroll-Lock
 * - `aria-labelledby` automatisch via title-slot
 * - backdrop-click optional via `closeOnBackdrop` (default true)
 *
 * Motion:
 * - 280ms cubic-bezier(0.23, 1, 0.32, 1) (--ease-out-strong)
 * - transform + opacity only (kein layout-thrash)
 * - `data-state="open|closed"` steuert die Transition; close wartet
 *   die Animation ab bevor dialog.close() ruft
 */

import * as React from "react";
import { cn } from "@/lib/cn";

const ANIMATION_MS = 280;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Title slot — rendert als h2 + aria-labelledby. */
  title?: React.ReactNode;
  /** Optionale Description direkt unter dem Titel. */
  description?: React.ReactNode;
  /** Rechts neben dem Titel, vor dem Close-X (z. B. Status-Badge, Eyebrow). */
  titleSlot?: React.ReactNode;
  /** Footer mit gap-2-Justify-End-Layout (z. B. Quick-Actions). */
  footer?: React.ReactNode;
  /** ESC + Close-Button rendern (default true). */
  dismissible?: boolean;
  /** Click auf Backdrop schließt (default true). */
  closeOnBackdrop?: boolean;
  /** Wrapper-Klassen für das dialog-Element (z. B. nutzdefinierte Breite). */
  className?: string;
  /** Klassen für den Body-Slot (overflow-y-auto default). */
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  titleSlot,
  footer,
  dismissible = true,
  closeOnBackdrop = true,
  className,
  bodyClassName,
  children,
}: DrawerProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [state, setState] = React.useState<"open" | "closed">("closed");
  const titleId = React.useId();
  const descId = React.useId();

  // Open/Close-Lifecycle: showModal() öffnet sofort, dann nächster Frame
  // setzt data-state="open" und triggert die Slide-In-Transition. Beim
  // Schließen umgekehrt: data-state="closed", Animation abwarten, dann
  // dialog.close() — sonst springt der Backdrop sofort weg.
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      // Doppel-RAF damit Initial-Style (closed) tatsächlich gepaintet wurde
      // bevor wir auf "open" wechseln. Ein-RAF würde manche Browser den
      // Style direkt mit dem neuen mergen lassen → kein Transition.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setState("open"));
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    }

    if (dialog.open) {
      setState("closed");
      const t = setTimeout(() => {
        if (dialog.open) dialog.close();
      }, ANIMATION_MS);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleCancel = React.useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      if (dismissible) onClose();
    },
    [dismissible, onClose],
  );

  const handleBackdropClick = React.useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (!closeOnBackdrop || !dismissible) return;
      if (e.target === e.currentTarget) onClose();
    },
    [closeOnBackdrop, dismissible, onClose],
  );

  const computedLabelledBy = title ? titleId : undefined;
  const computedDescribedBy = description ? descId : undefined;

  return (
    <dialog
      ref={dialogRef}
      data-state={state}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby={computedLabelledBy}
      aria-describedby={computedDescribedBy}
      className={cn(
        // Native dialog-Reset, an Bildschirm-Rand verankern (kein margin:auto).
        "fixed inset-0 m-0 p-0 max-h-none max-w-none border-0 bg-transparent",
        "h-dvh w-screen",
        // Backdrop hat Default-Styles aus globals.css ::backdrop
        "pointer-events-none",
        "[&[data-state='open']]:pointer-events-auto",
        className,
      )}
    >
      {/* Layout-Wrapper:
          - Mobile: items-end (Bottom-Sheet)
          - Desktop md+: items-stretch + justify-end (Right-Slide) */}
      <div className="flex h-full w-full items-end justify-end pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto bg-surface shadow-[var(--shadow-modal)] flex flex-col overflow-hidden",
            // Mobile bottom-sheet
            "w-full h-[90dvh] rounded-t-2xl",
            // Desktop right slide
            "md:h-dvh md:w-[min(60vw,720px)] md:rounded-none md:rounded-l-2xl",
            // Animation tokens — gesetzt von data-state via Tailwind-Variants
            "translate-y-full md:translate-y-0 md:translate-x-full opacity-0",
            "transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
            "[[data-state='open']_>_div_>_&]:translate-y-0",
            "md:[[data-state='open']_>_div_>_&]:translate-x-0",
            "[[data-state='open']_>_div_>_&]:opacity-100",
          )}
        >
          {(title || dismissible) && (
            <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line-subtle">
              <div className="flex-1 min-w-0">
                {title && (
                  <h2
                    id={titleId}
                    className="font-headline text-[18px] leading-tight tracking-tight text-foreground"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descId}
                    className="mt-1 text-[13px] leading-relaxed text-foreground-muted"
                  >
                    {description}
                  </p>
                )}
              </div>
              {titleSlot && <div className="shrink-0 pt-0.5">{titleSlot}</div>}
              {dismissible && (
                <button
                  type="button"
                  aria-label="Drawer schließen"
                  onClick={onClose}
                  className={cn(
                    "shrink-0 -mr-1 h-9 w-9 inline-flex items-center justify-center rounded-md",
                    "text-foreground-subtle hover:text-foreground hover:bg-canvas transition-colors",
                    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                  )}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <div className={cn("flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-line-subtle bg-canvas px-5 py-3 flex items-center justify-end gap-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
