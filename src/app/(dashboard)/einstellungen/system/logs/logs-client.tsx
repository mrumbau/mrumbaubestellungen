"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { IconActivity, IconSearch } from "@/components/ui/icons";

/**
 * 19.05.2026 (A4.14) — Unified-Log-Type über v_pipeline_logs.
 * Vereint webhook_logs + email_processing_log mit normalisierten Spalten.
 */
export type PipelineLog = {
  quelle: "webhook" | "email_pipeline" | string;
  record_id: string | null;
  typ: string;
  status: string;
  bestellung_id: string | null;
  bestellnummer: string | null;
  sender: string | null;
  subject: string | null;
  detail: string | null;
  created_at: string;
  extras: Record<string, unknown> | null;
};

type StatusFilter = "alle" | "error" | "info" | "success";
type QuelleFilter = "alle" | "webhook" | "email_pipeline";

export function LogsClient({ initialLogs }: { initialLogs: PipelineLog[] }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<PipelineLog[]>(initialLogs);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [quelleFilter, setQuelleFilter] = useState<QuelleFilter>("alle");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = logs.filter((l) => {
    if (statusFilter === "error" && l.status !== "error" && l.status !== "failed" && l.status !== "terminally_failed") return false;
    if (statusFilter === "info" && !["info", "warning", "processing"].includes(l.status)) return false;
    if (statusFilter === "success" && !["success", "processed"].includes(l.status)) return false;
    if (quelleFilter !== "alle" && l.quelle !== quelleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        l.bestellnummer,
        l.detail,
        l.typ,
        l.subject,
        l.sender,
        l.bestellung_id,
        l.record_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const errorCount = logs.filter((l) =>
    ["error", "failed", "terminally_failed"].includes(l.status),
  ).length;
  const infoCount = logs.filter((l) =>
    ["info", "warning", "processing"].includes(l.status),
  ).length;
  const successCount = logs.filter((l) => ["success", "processed"].includes(l.status)).length;
  const webhookCount = logs.filter((l) => l.quelle === "webhook").length;
  const emailCount = logs.filter((l) => l.quelle === "email_pipeline").length;

  async function refresh() {
    setRefreshing(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("v_pipeline_logs")
        .select(
          "quelle, record_id, typ, status, bestellung_id, bestellnummer, sender, subject, detail, created_at, extras",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setLogs(data as PipelineLog[]);
      toast.success("Pipeline-Logs aktualisiert");
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
          { label: "System", href: "/einstellungen/system" },
          { label: "Pipeline-Logs" },
        ]}
        title="Pipeline-Protokoll"
        description="Vereinheitlichter Log-View aus webhook_logs (Pipeline-Phasen-Logs, Cron-Cleanups, Extension) und email_processing_log (Mail-State je Microsoft-Graph-Mail). Cross-Link via bestellung_id."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {logs.length} Einträge · {webhookCount} webhook · {emailCount} email
            </span>
            {errorCount > 0 && (
              <Badge tone="error" size="md">
                {errorCount} Fehler
              </Badge>
            )}
          </>
        }
        actions={
          <Button variant="secondary" size="md" onClick={refresh} loading={refreshing}>
            Aktualisieren
          </Button>
        }
      />

      <SectionCard padding="none" headerBorder={false}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line-subtle flex-wrap">
          <div
            role="tablist"
            aria-label="Quelle-Filter"
            className="inline-flex bg-canvas border border-line-subtle rounded-md p-0.5"
          >
            <FilterTab
              active={quelleFilter === "alle"}
              onClick={() => setQuelleFilter("alle")}
              label={`Alle · ${logs.length}`}
            />
            <FilterTab
              active={quelleFilter === "webhook"}
              onClick={() => setQuelleFilter("webhook")}
              label={`Webhook · ${webhookCount}`}
            />
            <FilterTab
              active={quelleFilter === "email_pipeline"}
              onClick={() => setQuelleFilter("email_pipeline")}
              label={`Email · ${emailCount}`}
            />
          </div>
          <div
            role="tablist"
            aria-label="Status-Filter"
            className="inline-flex bg-canvas border border-line-subtle rounded-md p-0.5"
          >
            <FilterTab
              active={statusFilter === "alle"}
              onClick={() => setStatusFilter("alle")}
              label="Status: Alle"
            />
            <FilterTab
              active={statusFilter === "error"}
              onClick={() => setStatusFilter("error")}
              label={`Fehler · ${errorCount}`}
              tone="error"
            />
            <FilterTab
              active={statusFilter === "info"}
              onClick={() => setStatusFilter("info")}
              label={`Info · ${infoCount}`}
            />
            <FilterTab
              active={statusFilter === "success"}
              onClick={() => setStatusFilter("success")}
              label={`OK · ${successCount}`}
            />
          </div>
          <label className="relative flex-1 min-w-[220px] max-w-md">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-subtle pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bestellnr. / Detail / Typ / Subject / Sender"
              aria-label="Logs durchsuchen"
              className="w-full h-8 pl-8 pr-3 text-[12px] bg-canvas border border-line-subtle rounded-md text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-brand focus:shadow-[var(--shadow-focus-ring)]"
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            tone={statusFilter === "error" ? "success" : "info"}
            icon={<IconActivity className="h-5 w-5" />}
            title={
              statusFilter === "error"
                ? "Keine Fehler in der Pipeline"
                : logs.length === 0
                  ? "Noch keine Pipeline-Logs"
                  : "Filter ergibt keine Treffer"
            }
            description={
              statusFilter === "error"
                ? "Alle Pipeline-Phasen der letzten Verarbeitung sind erfolgreich gelaufen — keine Fehler-, Warning- oder Failed-Einträge."
                : logs.length === 0
                  ? "Sobald Mails verarbeitet werden, erscheinen hier alle Pipeline-Ereignisse aus webhook_logs und email_processing_log."
                  : "Probiere einen anderen Status- oder Quellen-Filter, oder erhöhe das Limit auf 100 Einträge."
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-canvas sticky top-0 z-10 border-b border-line-subtle">
                <tr>
                  <Th>Zeitpunkt</Th>
                  <Th>Quelle / Typ</Th>
                  <Th>Status</Th>
                  <Th>Bestellung</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr
                    key={`${log.quelle}-${log.record_id ?? log.created_at}`}
                    className={cn(
                      "border-b border-line-subtle last:border-b-0 hover:bg-surface-hover transition-colors",
                      ["error", "failed", "terminally_failed"].includes(log.status)
                        ? "bg-error-bg/40"
                        : "",
                    )}
                  >
                    <td className="px-5 py-2.5 font-mono-amount text-[12px] text-foreground-muted whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={log.quelle === "email_pipeline" ? "info" : "muted"} size="sm">
                          {log.quelle === "email_pipeline" ? "email" : "webhook"}
                        </Badge>
                        <span className="text-[12px] text-foreground-subtle font-mono-amount">{log.typ}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={log.status} />
                    </td>
                    <td className="px-3 py-2.5 font-mono-amount text-[12px] text-foreground">
                      {log.bestellung_id ? (
                        <Link
                          href={`/bestellungen/${log.bestellung_id}`}
                          className="hover:text-brand"
                          title={log.bestellung_id}
                        >
                          {log.bestellnummer || log.bestellung_id.slice(0, 8) + "…"}
                        </Link>
                      ) : (
                        log.bestellnummer || "–"
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[12px] text-foreground-subtle max-w-[420px]">
                      {log.subject && (
                        <div className="text-foreground truncate" title={log.subject}>
                          {log.subject}
                        </div>
                      )}
                      {log.sender && (
                        <div className="font-mono-amount text-[11px] text-foreground-subtle truncate" title={log.sender}>
                          {log.sender}
                        </div>
                      )}
                      {log.detail && (
                        <div className="line-clamp-2 break-words mt-0.5" title={log.detail}>
                          {log.detail}
                        </div>
                      )}
                      {!log.subject && !log.sender && !log.detail && "–"}
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

function StatusPill({ status }: { status: string }) {
  if (status === "success" || status === "processed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-status-freigegeben">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-status-freigegeben" />
        OK
      </span>
    );
  }
  if (["error", "failed", "terminally_failed"].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-error">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-error" />
        Fehler
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-warning">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning" />
        Warn
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground-muted">
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-foreground-muted" />
      {status.toUpperCase()}
    </span>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "error";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[12px] font-semibold rounded transition-colors",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        active
          ? tone === "error"
            ? "bg-surface text-error shadow-card"
            : "bg-surface text-foreground shadow-card"
          : "text-foreground-subtle hover:text-foreground-muted",
      )}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle px-5 first:pl-5 py-2"
    >
      {children}
    </th>
  );
}
