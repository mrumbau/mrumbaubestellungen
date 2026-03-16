"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
  variant = "default",
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "default" | "danger";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto rounded-xl border border-[#e8e6e3] p-0"
      style={{ boxShadow: "var(--shadow-modal)" }}
      onClose={onCancel}
    >
      <div className="p-6 max-w-sm bg-white rounded-xl">
        {variant === "danger" && (
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        )}
        <h3 className="font-headline text-base text-[#1a1a1a] tracking-tight mb-2">{title}</h3>
        <p className="text-sm text-[#6b6b6b] leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#6b6b6b] bg-[#f5f4f2] border border-[#e8e6e3] rounded-lg hover:bg-[#ebe9e6] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#570006] hover:bg-[#7a1a1f] text-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
