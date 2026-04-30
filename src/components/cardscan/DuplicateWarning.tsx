"use client";

import type { DuplicateMatch } from "@/lib/cardscan/types";

type DuplicateAction = "none" | "override" | "update";

interface DuplicateWarningProps {
  matches: DuplicateMatch[];
  onOverride: () => void;
  onUpdate: (match: DuplicateMatch) => void;
  action: DuplicateAction;
}

export function DuplicateWarning({
  matches,
  onOverride,
  onUpdate,
  action,
}: DuplicateWarningProps) {
  if (matches.length === 0) return null;

  const bestMatch = matches[0];
  const scorePercent = Math.round(bestMatch.score * 100);

  return (
    <div className="card p-4 mb-4 border-warning-border bg-warning-bg" role="alert">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-warning-bg flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warning">
            Möglicherweise bereits vorhanden ({scorePercent}% Übereinstimmung)
          </p>
          <div className="mt-2 space-y-1.5">
            {matches.slice(0, 3).map((m, i) => (
              <div key={i} className="text-xs text-warning bg-warning-bg/50 rounded px-2 py-1">
                <span className="font-medium uppercase text-[10px] mr-1.5">
                  {m.crm === "crm1" ? "CRM 1" : "CRM 2"}
                </span>
                {m.companyName && <span>{m.companyName} – </span>}
                {m.firstName} {m.lastName}
                {m.email && <span className="text-warning"> ({m.email})</span>}
                <span className="block text-warning mt-0.5">{m.reason}</span>
              </div>
            ))}
          </div>

          {action === "none" && (
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => onUpdate(bestMatch)}
                className="text-xs font-medium px-4 py-2.5 rounded-md bg-warning text-white hover:bg-warning transition-colors min-h-[44px]"
              >
                Daten ergänzen
              </button>
              <button
                onClick={onOverride}
                className="text-xs font-medium text-warning hover:text-warning underline transition-colors min-h-[44px] flex items-center"
              >
                Trotzdem neu anlegen
              </button>
            </div>
          )}
          {action === "update" && (
            <p className="mt-2 text-xs text-warning font-medium">
              Bestehender Kunde wird aktualisiert
            </p>
          )}
          {action === "override" && (
            <p className="mt-2 text-xs text-warning font-medium">
              Wird trotz Duplikat neu angelegt
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
