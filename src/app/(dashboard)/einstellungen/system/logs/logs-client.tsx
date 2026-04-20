"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { IconActivity } from "@/components/ui/icons";

export type WebhookLog = {
  id: string;
  typ: string;
  status: string;
  bestellnummer: string | null;
  fehler_text: string | null;
  created_at: string;
};

type Filter = "alle" | "error" | "info";

export function LogsClient({ initialLogs }: { initialLogs: WebhookLog[] }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<WebhookLog[]>(initialLogs);
  const [filter, setFilter] = useState<Filter>("alle");
  const [refreshing, setRefreshing] = useState(false);

  const filtered =
    filter === "alle"
      ? logs
      : logs.filter((l) => (filter === "error" ? l.status === "error" : l.status === "info"));

  const errorCount = logs.filter((l) => l.status === "error").length;
  const infoCount = logs.filter((l) => l.status === "info").length;

  async function refresh() {
    setRefreshing(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("webhook_logs")
        .select("id, typ, status, bestellnummer, fehler_text, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setLogs(data);
      toast.success("Webhook-Logs aktualisiert");
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
          { label: "Webhook-Logs" },
        ]}
        title="Webhook-Protokoll"
        description="Die letzten 50 eingehenden Webhooks (E-Mail, Extension, Cron). Bei Fehlern: Ursache in der Details-Spalte."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {logs.length} Einträge
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
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line-subtle">
          <div
            role="tablist"
            aria-label="Log-Filter"
            className="inline-flex bg-canvas border border-line-subtle rounded-md p-0.5"
          >
            <FilterTab
              active={filter === "alle"}
              onClick={() => setFilter("alle")}
              label={`Alle · ${logs.length}`}
            />
            <FilterTab
              active={filter === "error"}
              onClick={() => setFilter("error")}
              label={`Fehler · ${errorCount}`}
              tone="error"
            />
            <FilterTab
              active={filter === "info"}
              onClick={() => setFilter("info")}
              label={`Info · ${infoCount}`}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            tone={filter === "error" ? "success" : "info"}
            icon={<IconActivity className="h-5 w-5" />}
            title={
              filter === "error"
                ? "Keine Fehler"
                : logs.length === 0
                  ? "Noch keine Webhook-Logs"
                  : "Keine Einträge für diesen Filter"
            }
            description={
              filter === "error"
                ? "Alle Webhook-Aufrufe sind erfolgreich verarbeitet."
                : undefined
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas sticky top-0 z-10 border-b border-line-subtle">
                <tr>
                  <Th>Zeitpunkt</Th>
                  <Th>Typ</Th>
                  <Th>Status</Th>
                  <Th>Bestellnr.</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className={cn(
                      "border-b border-line-subtle last:border-b-0 hover:bg-surface-hover transition-colors",
                      log.status === "error" ? "bg-error-bg/40" : "",
                    )}
                  >
                    <td className="px-5 py-2.5 font-mono-amount text-[11.5px] text-foreground-muted whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="muted" size="sm">
                        {log.typ}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={log.status} />
                    </td>
                    <td className="px-3 py-2.5 font-mono-amount text-[11.5px] text-foreground">
                      {log.bestellnummer || "–"}
                    </td>
                    <td className="px-5 py-2.5 text-[11.5px] text-foreground-subtle max-w-[360px]">
                      <span className="line-clamp-2 break-words" title={log.fehler_text ?? undefined}>
                        {log.fehler_text || "–"}
                      </span>
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
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-status-freigegeben">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-status-freigegeben" />
        OK
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-error">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-error" />
        Fehler
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground-muted">
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
        "px-2.5 py-1 text-[11.5px] font-semibold rounded transition-colors",
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
