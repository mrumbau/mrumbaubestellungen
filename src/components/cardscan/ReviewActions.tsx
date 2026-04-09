"use client";

interface ReviewActionsProps {
  onConfirm: () => void;
  onDiscard: () => void;
  saving: boolean;
  canSubmit: boolean;
}

export function ReviewActions({
  onConfirm,
  onDiscard,
  saving,
  canSubmit,
}: ReviewActionsProps) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={onDiscard}
        className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors"
        disabled={saving}
        aria-label="Kontakt verwerfen"
      >
        Verwerfen
      </button>
      <button
        onClick={onConfirm}
        disabled={saving || !canSubmit}
        className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        aria-label="Kontakt bestätigen und im CRM anlegen"
      >
        {saving ? (
          <>
            <span className="spinner w-4 h-4" aria-hidden="true" />
            Lege an…
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            Bestätigen & Anlegen
          </>
        )}
      </button>
    </div>
  );
}
