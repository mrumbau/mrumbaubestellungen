"use client";

import { Modal } from "./ui/modal";
import { Button } from "./ui/button";

/**
 * ConfirmDialog — kept as a stable façade over the new Modal + Button primitives.
 * Existing call-sites across the codebase continue to work without changes.
 * Use `variant="danger"` for irreversible actions (delete, archive with cascade).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
  variant = "default",
  loading = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "default" | "danger";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={
        <span className="inline-flex items-center gap-2.5">
          {variant === "danger" && (
            <span
              aria-hidden="true"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-error-bg text-error"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </span>
          )}
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "primary"}
            size="md"
            onClick={onConfirm}
            loading={loading}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-foreground-muted">{message}</p>
    </Modal>
  );
}
