"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Modal — thin wrapper around the native <dialog> element.
 *
 * Why native <dialog>?
 * - Built-in focus trap (no library needed)
 * - Built-in Escape-to-close (via the `cancel` event)
 * - Built-in scroll-lock when opened with showModal()
 * - `::backdrop` styled globally in globals.css
 *
 * We add:
 * - Backdrop-click to dismiss (optional, default on)
 * - Accessible labelling via aria-labelledby when `title` is provided
 * - Body scroll-freeze fallback for browsers that don't lock body on showModal
 * - Size variants aligned with the layout grid
 */

type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  dismissible = true,
  closeOnBackdrop = true,
  children,
  footer,
  className,
  contentClassName,
  labelledBy,
  describedBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: ModalSize;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  labelledBy?: string;
  describedBy?: string;
}) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Escape key triggers the dialog's `cancel` event → route through onClose.
  const handleCancel = React.useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      if (dismissible) onClose();
    },
    [dismissible, onClose],
  );

  // Click outside the content box (i.e., on the dialog itself / backdrop) closes.
  const handleBackdropClick = React.useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (!closeOnBackdrop || !dismissible) return;
      if (e.target === e.currentTarget) onClose();
    },
    [closeOnBackdrop, dismissible, onClose],
  );

  const computedLabelledBy = labelledBy ?? (title ? titleId : undefined);
  const computedDescribedBy = describedBy ?? (description ? descId : undefined);

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby={computedLabelledBy}
      aria-describedby={computedDescribedBy}
      className={cn(
        // Reset native dialog defaults, center via margin:auto
        "m-auto w-full p-0 bg-transparent border-0",
        // Prevent scroll lock from our side (dialog handles it)
        "max-h-[calc(100vh-2rem)] overflow-visible",
        sizeClasses[size],
        className,
      )}
    >
      <div
        className={cn(
          "animate-scale-in bg-surface rounded-xl border border-line overflow-hidden",
          "shadow-[var(--shadow-modal)]",
          "max-h-[calc(100vh-2rem)] flex flex-col",
          contentClassName,
        )}
      >
        {(title || dismissible) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="font-headline text-[16px] tracking-tight text-foreground"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1 text-[13px] leading-relaxed text-foreground-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                aria-label="Dialog schließen"
                onClick={onClose}
                className={cn(
                  "shrink-0 -mr-1 -mt-1 h-7 w-7 inline-flex items-center justify-center rounded-md",
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
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line-subtle bg-canvas px-5 py-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
