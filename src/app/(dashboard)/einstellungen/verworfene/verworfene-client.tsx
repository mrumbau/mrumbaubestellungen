"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { IconTrash, IconSearch } from "@/components/ui/icons";

export type VerworfeneDokuSnapshot = {
  id: string;
  typ: string;
  storage_pfad: string | null;
  dateiname?: string | null;
};

export type VerworfeneEntry = {
  id: string;
  absender_adresse: string | null;
  absender_domain: string | null;
  email_betreff: string | null;
  verworfen_von: string | null;
  created_at: string;
  bestellung_id: string | null;
  bestellnummer: string | null;
  betrag: number | null;
  dokumente_snapshot: VerworfeneDokuSnapshot[] | null;
};

/**
 * 21.05.2026 — Cutoff für Audit-Sicht.
 * Frühere Einträge sind Test-Verwerfungen + Spam-Cleanup aus der Pre-Audit-
 * Phase und werden ausgeblendet (sowohl Server-Query als auch Browser-Refresh).
 * Wert: 18.05.2026 14:19 Berliner Zeit = 12:19 UTC = erster "echter" Audit-
 * Eintrag (WK Transport / CR).
 */
export const AUDIT_CUTOFF_ISO = "2026-05-18T12:19:00Z";

/**
 * Verworfene-Audit-Liste — wer hat wann welche Mail verworfen.
 *
 * Filter: Suche (Sender/Subject/Kürzel) + Wer-hat-verworfen (Pill-Reihe).
 * Keine bestellung_id-Spalte, da `verworfene_emails` keine FK auf
 * `bestellungen` hat (Bestellung wurde beim Verwerfen mitgelöscht).
 */
export function VerworfeneClient({
  initialEntries,
}: {
  initialEntries: VerworfeneEntry[];
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<VerworfeneEntry[]>(initialEntries);
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState<string | "alle">("alle");
  const [refreshing, setRefreshing] = useState(false);

  // Distinct Verworfen-Von-Kürzel für Filter-Pills
  const actorCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const k = (e.verworfen_von ?? "?").trim() || "?";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (actorFilter !== "alle" && (e.verworfen_von ?? "?") !== actorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          e.absender_adresse,
          e.absender_domain,
          e.email_betreff,
          e.verworfen_von,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, actorFilter]);

  async function refresh() {
    setRefreshing(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("verworfene_emails")
        .select(
          "id, absender_adresse, absender_domain, email_betreff, verworfen_von, created_at, bestellung_id, bestellnummer, betrag, dokumente_snapshot",
        )
        .gte("created_at", AUDIT_CUTOFF_ISO)
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) setEntries(data as unknown as VerworfeneEntry[]);
      toast.success("Verworfen-Audit aktualisiert");
    } catch {
      toast.error("Aktualisierung fehlgeschlagen");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "Verworfen-Audit" },
        ]}
        title="Verworfen-Audit"
        description="Wer hat wann welche Mail als irrelevant verworfen? Transparenz für alle Mitarbeiter — Quelle: verworfene_emails-Tabelle (Pre-Filter für künftige Pipeline-Runs)."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {entries.length} Einträge
            </span>
            <span className="text-[12px] text-foreground-subtle">·</span>
            <span className="text-[12px] text-foreground-subtle">{filtered.length} sichtbar</span>
          </>
        }
        actions={
          <Button variant="subtle" size="sm" onClick={refresh} loading={refreshing}>
            Aktualisieren
          </Button>
        }
      />

      <SectionCard padding="none">
        <div className="px-5 py-3 border-b border-line-subtle flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              active={actorFilter === "alle"}
              onClick={() => setActorFilter("alle")}
              label={`Alle · ${entries.length}`}
            />
            {actorCounts.map(([kuerzel, count]) => (
              <FilterPill
                key={kuerzel}
                active={actorFilter === kuerzel}
                onClick={() => setActorFilter(kuerzel)}
                label={`${kuerzel} · ${count}`}
              />
            ))}
          </div>
          <label className="relative flex-1 min-w-[220px] max-w-md">
            <IconSearch
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-subtle pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sender / Domain / Subject / Kürzel"
              aria-label="Verworfen-Audit durchsuchen"
              className="w-full h-8 pl-8 pr-3 text-[12px] bg-canvas border border-line-subtle rounded-md text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-brand focus:shadow-[var(--shadow-focus-ring)]"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            tone="info"
            icon={<IconTrash className="h-5 w-5" />}
            title={entries.length === 0 ? "Noch nichts verworfen" : "Filter ergibt keine Treffer"}
            description={
              entries.length === 0
                ? "Sobald jemand eine eingehende Mail im Email-Sync-Monitor als 'verwerfen' markiert, erscheint sie hier mit Kürzel + Zeitstempel. Verwerfen blacklisted den Absender automatisch für künftige Pipeline-Runs."
                : "Probiere einen anderen Kürzel-Filter oder die Suche zurücksetzen."
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas border-b border-line-subtle">
                <tr>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Zeit
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Wer
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Bestellnr.
                  </th>
                  <th
                    scope="col"
                    className="text-right px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Betrag
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Absender
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Subject
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-semibold text-[10px] text-foreground-subtle uppercase tracking-wider"
                  >
                    Dokumente
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-line-subtle hover:bg-canvas">
                    <td className="px-4 py-2.5 text-[12px] text-foreground-muted whitespace-nowrap font-mono-amount">
                      {formatBerliner(e.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={badgeToneForActor(e.verworfen_von)} size="sm">
                        {e.verworfen_von ?? "?"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-foreground font-mono-amount whitespace-nowrap">
                      {e.bestellnummer ?? <span className="text-foreground-faint">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-foreground text-right font-mono-amount whitespace-nowrap">
                      {e.betrag != null ? formatEuro(e.betrag) : <span className="text-foreground-faint">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      <div className="text-foreground font-mono-amount truncate max-w-[240px]">
                        {e.absender_adresse ?? "—"}
                      </div>
                      {e.absender_domain && e.absender_adresse !== e.absender_domain && (
                        <div className="text-[11px] text-foreground-subtle font-mono-amount truncate max-w-[240px]">
                          {e.absender_domain}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-foreground-muted">
                      <span className="block truncate max-w-[320px]">{e.email_betreff || <em className="text-foreground-faint">leer</em>}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DokumentePills snapshot={e.dokumente_snapshot} onError={(msg) => toast.error("Dokument nicht verfügbar", { description: msg })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DokumentePills({
  snapshot,
  onError,
}: {
  snapshot: VerworfeneDokuSnapshot[] | null;
  onError: (msg: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  if (!snapshot || snapshot.length === 0) {
    return <span className="text-[11px] text-foreground-faint">—</span>;
  }

  async function openDoku(d: VerworfeneDokuSnapshot) {
    if (!d.storage_pfad) {
      onError("Kein Storage-Pfad im Snapshot.");
      return;
    }
    setLoadingId(d.id);
    try {
      const res = await fetch(`/api/audit/verworfene-doku/${d.id}`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        onError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {snapshot.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => openDoku(d)}
          disabled={loadingId === d.id || !d.storage_pfad}
          title={d.storage_pfad ? `${d.typ} öffnen (PDF im neuen Tab)` : `Kein PDF-Pfad gespeichert`}
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider " +
            "transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] " +
            (d.storage_pfad
              ? "bg-info-bg text-info hover:bg-info hover:text-white cursor-pointer"
              : "bg-input text-foreground-faint cursor-not-allowed") +
            (loadingId === d.id ? " opacity-60" : "")
          }
        >
          {loadingId === d.id ? "…" : d.typ.slice(0, 3).toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2.5 py-1 text-[12px] font-semibold rounded transition-colors " +
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] " +
        (active
          ? "bg-brand text-white"
          : "bg-input text-foreground-muted hover:text-foreground hover:bg-canvas")
      }
    >
      {label}
    </button>
  );
}

function badgeToneForActor(kuerzel: string | null): "brand" | "info" | "success" | "warning" | "muted" {
  const k = (kuerzel ?? "").toUpperCase();
  if (k === "MT") return "brand";
  if (k === "CR") return "info";
  if (k === "MH") return "warning";
  if (k === "NJ") return "success";
  return "muted";
}

function formatEuro(value: number): string {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
  } catch {
    return `${value} €`;
  }
}

function formatBerliner(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
