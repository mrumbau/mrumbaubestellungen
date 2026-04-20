"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  IconChevronDown,
  IconPlus,
  IconTrash,
  IconCheck,
} from "./icons";

/**
 * Saved Views — benannte Filter-Kombinationen pro Tabelle mit Default-Auto-Load.
 *
 * Persistenz: localStorage["saved-views.<tableKey>"] — User-spezifisch nicht über
 * DB, weil Views individuell sind. Für Team-Views kann später ein Supabase-
 * Layer dazukommen (jeder User seine eigenen).
 *
 * Generic Config: TConfig ist das Shape dessen, was in der View gespeichert wird
 * (Filter + Sort + Density + ViewMode). Jede Tabelle definiert ihr eigenes.
 */
export type SavedView<TConfig> = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  config: TConfig;
};

export type UseSavedViewsResult<TConfig> = {
  views: SavedView<TConfig>[];
  defaultView: SavedView<TConfig> | null;
  saveView: (name: string, config: TConfig, isDefault?: boolean) => string;
  deleteView: (id: string) => void;
  toggleDefault: (id: string) => void;
  renameView: (id: string, name: string) => void;
  /** Replace the config of an existing view (without changing id/name/isDefault). */
  updateViewConfig: (id: string, config: TConfig) => void;
};

function storageKey(tableKey: string) {
  return `saved-views.${tableKey}`;
}

export function useSavedViews<TConfig>(
  tableKey: string,
): UseSavedViewsResult<TConfig> {
  const [views, setViews] = React.useState<SavedView<TConfig>[]>([]);

  // Load on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(tableKey));
      if (raw) {
        const parsed = JSON.parse(raw) as SavedView<TConfig>[];
        if (Array.isArray(parsed)) setViews(parsed);
      }
    } catch {
      /* storage blocked or invalid JSON */
    }
  }, [tableKey]);

  const persist = React.useCallback(
    (next: SavedView<TConfig>[]) => {
      setViews(next);
      try {
        window.localStorage.setItem(storageKey(tableKey), JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
    },
    [tableKey],
  );

  const saveView = React.useCallback(
    (name: string, config: TConfig, isDefault = false): string => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const next: SavedView<TConfig> = {
        id,
        name: name.trim() || "Unbenannt",
        isDefault,
        createdAt: new Date().toISOString(),
        config,
      };
      // If marking as default, un-default the others
      const cleaned = isDefault ? views.map((v) => ({ ...v, isDefault: false })) : views;
      persist([...cleaned, next]);
      return id;
    },
    [views, persist],
  );

  const deleteView = React.useCallback(
    (id: string) => {
      persist(views.filter((v) => v.id !== id));
    },
    [views, persist],
  );

  const toggleDefault = React.useCallback(
    (id: string) => {
      const target = views.find((v) => v.id === id);
      if (!target) return;
      const wasDefault = target.isDefault;
      const next = views.map((v) => ({
        ...v,
        isDefault: v.id === id ? !wasDefault : false,
      }));
      persist(next);
    },
    [views, persist],
  );

  const renameView = React.useCallback(
    (id: string, name: string) => {
      persist(
        views.map((v) =>
          v.id === id ? { ...v, name: name.trim() || v.name } : v,
        ),
      );
    },
    [views, persist],
  );

  const updateViewConfig = React.useCallback(
    (id: string, config: TConfig) => {
      persist(views.map((v) => (v.id === id ? { ...v, config } : v)));
    },
    [views, persist],
  );

  const defaultView = views.find((v) => v.isDefault) ?? null;

  return {
    views,
    defaultView,
    saveView,
    deleteView,
    toggleDefault,
    renameView,
    updateViewConfig,
  };
}

// ─── UI: SavedViewsMenu ────────────────────────────────────────────────

export function SavedViewsMenu<TConfig>({
  views,
  activeViewId,
  onApply,
  onSave,
  onDelete,
  onToggleDefault,
  className,
  currentConfigIsDirty = false,
}: {
  views: SavedView<TConfig>[];
  activeViewId: string | null;
  onApply: (view: SavedView<TConfig>) => void;
  /** Called with a user-entered name to save the *current* config. */
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string) => void;
  className?: string;
  /** True when current state deviates from the applied saved view. */
  currentConfigIsDirty?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [showSaveInput, setShowSaveInput] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSaveInput(false);
        setSaveName("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const activeView = activeViewId ? views.find((v) => v.id === activeViewId) : null;
  const label = activeView ? activeView.name : "Ansichten";

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!saveName.trim()) return;
    onSave(saveName.trim());
    setSaveName("");
    setShowSaveInput(false);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line",
          "bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 text-foreground-subtle"
          aria-hidden="true"
        >
          <path d="M2.5 3.5h11M4 8h8M6 12.5h4" />
        </svg>
        <span className="max-w-[160px] truncate">
          {label}
          {activeView && currentConfigIsDirty && (
            <span className="text-foreground-subtle" title="Änderungen nicht gespeichert">
              {" "}
              •
            </span>
          )}
        </span>
        <IconChevronDown
          className={cn(
            "h-3 w-3 text-foreground-subtle transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-72 z-30 bg-surface border border-line rounded-md shadow-[var(--shadow-elevated)] overflow-hidden animate-scale-in"
        >
          <div className="px-3 py-2 border-b border-line-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
              Meine Ansichten
            </p>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {views.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-foreground-subtle text-center">
                Noch keine gespeicherten Ansichten.
              </li>
            ) : (
              views.map((v) => (
                <li key={v.id} className="group">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors",
                      activeViewId === v.id && "bg-brand/[0.04]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApply(v);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex-1 min-w-0 text-left text-[13px]",
                        "focus-visible:outline-none rounded",
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-foreground">{v.name}</span>
                        {v.isDefault && (
                          <span
                            aria-label="Standard-Ansicht"
                            title="Standard-Ansicht"
                            className="text-warning text-[11px]"
                          >
                            ★
                          </span>
                        )}
                        {activeViewId === v.id && (
                          <IconCheck className="h-3 w-3 text-brand shrink-0" />
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDefault(v.id)}
                      aria-label={
                        v.isDefault ? "Standard entfernen" : "Als Standard setzen"
                      }
                      title={
                        v.isDefault ? "Standard entfernen" : "Als Standard setzen"
                      }
                      className={cn(
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                        "inline-flex h-6 w-6 items-center justify-center rounded text-[12px]",
                        v.isDefault
                          ? "text-warning hover:bg-warning-bg"
                          : "text-foreground-subtle hover:text-warning hover:bg-canvas",
                        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                      )}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(v.id)}
                      aria-label={`${v.name} löschen`}
                      className={cn(
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                        "inline-flex h-6 w-6 items-center justify-center rounded",
                        "text-foreground-subtle hover:text-error hover:bg-error-bg",
                        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                      )}
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-line-subtle p-2">
            {showSaveInput ? (
              <form onSubmit={handleSave} className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name der Ansicht"
                  autoFocus
                  className={cn(
                    "flex-1 h-7 px-2 text-[12px] rounded border border-line bg-input text-foreground",
                    "focus:outline-none focus:border-brand focus:bg-surface focus:shadow-[var(--shadow-focus-ring)]",
                  )}
                />
                <button
                  type="submit"
                  disabled={!saveName.trim()}
                  className={cn(
                    "btn-primary h-7 px-2.5 text-[11px] rounded font-semibold",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  Speichern
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] rounded",
                  "text-brand hover:bg-brand/[0.06] transition-colors",
                  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                )}
              >
                <IconPlus className="h-3.5 w-3.5" />
                Aktuelle Ansicht speichern…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
