/**
 * CmdKSearch — cross-Lane-Search-Foundation für /bestellungen (UX-R2, 03.06.2026).
 *
 * Ersetzt den alten "Alle"-Tab. Cmd+K (oder Ctrl+K) öffnet einen Search-
 * Modal über die ganze Bestellungs-Tabelle (RLS-gefiltert). Treffer werden
 * mit Lane-Indikator (Pool / In Arbeit / Archiv) gerendert und führen zur
 * Detail-Page.
 *
 * Foundation-Variante: nur Modal + API-Aufruf + simple Result-Liste. Spätere
 * Wellen können erweitern (Fuzzy-Match, Tastatur-Pfeile, Recent-History,
 * Saved-Searches).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type Lane = "pool" | "in-arbeit" | "archiv";

interface SearchResult {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string | null;
  bestellungsart: string | null;
  status: string;
  betrag: number | null;
  waehrung: string | null;
  projekt_name: string | null;
  mahnung_am: string | null;
  lane: Lane;
}

const LANE_LABEL: Record<Lane, string> = {
  pool: "Pool",
  "in-arbeit": "In Arbeit",
  archiv: "Archiv",
};

export function CmdKSearchTrigger() {
  const [open, setOpen] = useState(false);

  // Global Cmd+K / Ctrl+K Listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Nur wenn kein Input fokussiert ist, sonst lassen wir's durch.
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 rounded-md",
          "border border-line bg-canvas text-foreground-muted text-meta",
          "hover:border-line-strong hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        )}
        aria-label="Suche öffnen (Cmd+K)"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
        <span>Suchen</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-line-subtle bg-surface text-foreground-faint font-mono-amount text-eyebrow uppercase">
          ⌘K
        </kbd>
      </button>
      {open && <CmdKSearchModal onClose={() => setOpen(false)} />}
    </>
  );
}

interface CmdKSearchModalProps {
  onClose: () => void;
}

function CmdKSearchModal({ onClose }: CmdKSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-Focus + ESC zum Schließen
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced Search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/bestellungen/search?q=${encodeURIComponent(query.trim())}`,
          { signal: ctrl.signal, credentials: "same-origin" },
        );
        if (!res.ok) {
          setResults([]);
        } else {
          const data = await res.json();
          setResults((data.results || []) as SearchResult[]);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  // Resultate gruppiert per Lane
  const grouped = useMemo(() => {
    const g: Record<Lane, SearchResult[]> = {
      pool: [],
      "in-arbeit": [],
      archiv: [],
    };
    for (const r of results) g[r.lane].push(r);
    return g;
  }, [results]);

  const handleSelect = useCallback(
    (id: string) => {
      onClose();
      router.push(`/bestellungen/${id}`);
    },
    [router, onClose],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cross-Lane-Suche"
      className="fixed inset-0 z-[var(--z-modal-overlay)] flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-fade-in"
      />
      <div
        className={cn(
          "relative w-full max-w-2xl rounded-xl border border-line bg-card shadow-lg overflow-hidden animate-scale-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4 text-foreground-subtle"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bestellnummer, Händler oder Projekt suchen…"
            className="flex-1 bg-transparent border-none outline-none text-body text-foreground placeholder:text-foreground-faint"
            aria-label="Suchbegriff"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-line-subtle bg-canvas text-foreground-faint font-mono-amount text-eyebrow uppercase">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <div className="px-4 py-8 text-center text-body-sm text-foreground-muted">
              Mindestens 2 Zeichen eingeben.
              <div className="mt-1 text-meta text-foreground-faint">
                Suche cross-Lane: Pool, In Arbeit, Archiv.
              </div>
            </div>
          )}
          {query.trim().length >= 2 && loading && (
            <div className="px-4 py-6 text-center text-body-sm text-foreground-muted">
              Suche läuft…
            </div>
          )}
          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-body-sm text-foreground-muted">
              Keine Treffer für „{query}".
            </div>
          )}
          {(["pool", "in-arbeit", "archiv"] as Lane[]).map((lane) =>
            grouped[lane].length > 0 ? (
              <div key={lane}>
                <div className="px-4 pt-3 pb-1 text-eyebrow uppercase tracking-[0.18em] text-foreground-subtle font-semibold">
                  {LANE_LABEL[lane]}
                  <span className="ml-2 font-mono-amount text-foreground-faint">
                    {grouped[lane].length}
                  </span>
                </div>
                <ul className="pb-2">
                  {grouped[lane].map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(r.id)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 flex items-center gap-3",
                          "hover:bg-surface-hover transition-colors",
                          "focus-visible:outline-none focus-visible:bg-surface-hover",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-amount text-body-sm font-medium text-brand truncate">
                              {r.bestellnummer || "Ohne Nr."}
                            </span>
                            {r.mahnung_am && (
                              <span className="text-eyebrow uppercase tracking-[0.14em] text-status-abweichung font-semibold">
                                Mahnung
                              </span>
                            )}
                          </div>
                          <div className="text-meta text-foreground-muted truncate">
                            {r.haendler_name || "Unbekannter Lieferant"}
                            {r.projekt_name && <> · {r.projekt_name}</>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono-amount text-body-sm tabular-nums text-foreground">
                            {r.betrag != null
                              ? `${r.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${r.waehrung || "€"}`
                              : "–"}
                          </div>
                          {r.besteller_kuerzel !== "UNBEKANNT" && (
                            <div className="text-eyebrow uppercase text-foreground-faint">
                              {r.besteller_kuerzel}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
