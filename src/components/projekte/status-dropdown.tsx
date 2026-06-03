"use client";

/**
 * StatusDropdown + StatusIcon + STATUS_OPTIONS für Projekt-Statuswechsel.
 * Aus projekte-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 *
 * Verwendung: pro Projekt-Card als kleines Pill-Dropdown.
 */

import { useState, useRef, useEffect } from "react";

// 19.05.2026 (A4.11) — alle Pill-Farben über Tokens; "abgeschlossen" nutzt
// neutrale canvas-soft+foreground-muted+line-Tokens statt bg-gray-*.
export const STATUS_OPTIONS = [
  { value: "aktiv", label: "Aktiv", icon: "circle", color: "var(--success)", bg: "bg-success-bg", text: "text-success", border: "border-success-border" },
  { value: "pausiert", label: "Pausiert", icon: "pause", color: "var(--warning)", bg: "bg-warning-bg", text: "text-warning", border: "border-warning-border" },
  { value: "abgeschlossen", label: "Abgeschlossen", icon: "check", color: "var(--text-tertiary)", bg: "bg-input", text: "text-foreground-muted", border: "border-line" },
  { value: "archiviert", label: "Archivieren", icon: "archive", color: "var(--error)", bg: "bg-error-bg", text: "text-error", border: "border-error-border" },
];

export function getStatusCfg(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

export function StatusIcon({ type, className }: { type: string; className?: string }) {
  const cls = className || "w-3 h-3";
  switch (type) {
    case "circle":
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="currentColor">
          <circle cx="6" cy="6" r="4" />
        </svg>
      );
    case "pause":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
        </svg>
      );
    case "check":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "archive":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
        </svg>
      );
    default:
      return null;
  }
}

export function StatusDropdown({
  currentStatus,
  onSelect,
  disabled,
}: {
  currentStatus: string;
  onSelect: (status: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = getStatusCfg(currentStatus);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border transition-[box-shadow,background-color,border-color] ${cfg.bg} ${cfg.text} ${cfg.border} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-sm cursor-pointer"}`}
      >
        <StatusIcon type={cfg.icon} className="w-2.5 h-2.5" />
        {cfg.value === "archiviert" ? "Archiviert" : cfg.label}
        {!disabled && (
          <svg
            className={`w-2.5 h-2.5 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-surface rounded-lg shadow-lg border border-line py-1 min-w-[160px]">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = opt.value === currentStatus;
            return (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (!isActive) onSelect(opt.value);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-meta transition-colors ${
                  isActive
                    ? "bg-input font-semibold text-foreground"
                    : opt.value === "archiviert"
                      ? "text-error hover:bg-error-bg"
                      : "text-foreground-muted hover:bg-input"
                }`}
              >
                <span style={{ color: opt.color }}>
                  <StatusIcon type={opt.icon} className="w-3.5 h-3.5" />
                </span>
                <span>{opt.value === "archiviert" ? "Archivieren" : opt.label}</span>
                {isActive && (
                  <svg
                    className="w-3 h-3 ml-auto text-brand"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
