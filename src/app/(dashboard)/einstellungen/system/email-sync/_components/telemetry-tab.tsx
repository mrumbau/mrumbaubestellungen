// TODO text-scale (UX-R1 codemod, 03.06.2026): 1× approx-map review: text-xl→text-h2 (war 20px, jetzt 24px)
"use client";

/**
 * TelemetryTab + interner Stat-Helper.
 * Aus email-sync-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/cn";
import { relativeTime } from "./helpers";
import type { Telemetry, ToastFn } from "./types";

export function TelemetryTab({
  toast,
}: {
  toast: ToastFn & {
    success: ToastFn;
    error: ToastFn;
    warning: ToastFn;
    info: ToastFn;
  };
}) {
  const [data, setData] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/email-sync/telemetry")
      .then((res) => res.json())
      .then(setData)
      .catch(() => toast.error("Telemetrie konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    );
  }
  if (!data) return null;

  const sparklineData = data.daily_spend.map((d) => d.eur);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI-Zeile */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Mails (30 Tage)" value={data.total_mails_30d.toLocaleString("de-DE")} />
        <Stat
          label="OpenAI-Kosten (30 Tage)"
          value={`${data.total_cost_30d_eur.toFixed(2)} €`}
          sparkline={sparklineData}
        />
        <Stat
          label="Folder-Mismatch-Rate"
          value={`${(data.mismatch_rate * 100).toFixed(1)} %`}
          tone={data.mismatch_rate > 0.15 ? "warning" : "success"}
        />
        <Stat
          label="Verarbeitet / Fehler / Irrelevant"
          value={`${data.status_counts.processed} / ${data.status_counts.failed} / ${data.status_counts.irrelevant}`}
        />
      </div>

      {/* Vendor-Parser-Quote */}
      {data.parser && (data.parser.vendor_count + data.parser.ki_count > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat
            label="Vendor-Parser-Quote"
            value={`${(data.parser.vendor_rate * 100).toFixed(0)} %`}
            tone={data.parser.vendor_rate > 0.3 ? "success" : undefined}
          />
          <Stat
            label="Mails: Vendor / KI"
            value={`${data.parser.vendor_count} / ${data.parser.ki_count}`}
          />
          <Stat
            label="Geschätzte Ersparnis (30d)"
            value={`${data.parser.estimated_savings_eur.toFixed(2)} €`}
            tone="success"
          />
        </div>
      )}

      {/* Vendor-Breakdown */}
      {data.parser && Object.keys(data.parser.by_vendor).length > 0 && (
        <div>
          <h3 className="text-body-sm font-semibold mb-3">Vendor-Parser-Treffer (30 Tage)</h3>
          <div className="rounded-lg border border-line-subtle overflow-hidden">
            <table className="w-full text-meta">
              <thead className="bg-canvas border-b border-line-subtle">
                <tr>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Parser</th>
                  <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Treffer</th>
                  <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.parser.by_vendor)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => (
                    <tr key={name} className="border-b border-line-subtle last:border-0">
                      <td className="px-3 py-2">
                        <Badge tone="success" size="sm">{name}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-amount">{count}</td>
                      <td className="px-3 py-2 text-right font-mono-amount text-foreground-muted">
                        {data.parser.vendor_count > 0
                          ? `${((count / data.parser.vendor_count) * 100).toFixed(0)} %`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Folder-Health */}
      <div>
        <h3 className="text-body-sm font-semibold mb-3">Folder-Health</h3>
        <div className="rounded-lg border border-line-subtle overflow-hidden">
          <table className="w-full text-meta">
            <thead className="bg-canvas border-b border-line-subtle">
              <tr>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Folder</th>
                <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">24h</th>
                <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Letzter Sync</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.folder_health.map((f) => (
                <tr key={f.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-3 py-2">{f.folder_path}</td>
                  <td className="px-3 py-2 text-right font-mono-amount">{f.mails_24h}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">
                    {relativeTime(f.last_sync_at)}
                  </td>
                  <td className="px-3 py-2">
                    {f.last_error ? (
                      <Badge tone="error" size="sm">
                        Fehler
                      </Badge>
                    ) : !f.enabled ? (
                      <Badge tone="neutral" size="sm">
                        Aus
                      </Badge>
                    ) : (
                      <Badge tone="success" size="sm">
                        OK
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top-10 Costly */}
      {data.top_costly.length > 0 && (
        <div>
          <h3 className="text-body-sm font-semibold mb-3">Top 10 teuerste Mails (30 Tage)</h3>
          <div className="rounded-lg border border-line-subtle overflow-hidden">
            <table className="w-full text-meta">
              <thead className="bg-canvas border-b border-line-subtle">
                <tr>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Zeit</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Sender</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Betreff</th>
                  <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {data.top_costly.map((c) => (
                  <tr key={c.internet_message_id} className="border-b border-line-subtle last:border-0">
                    <td className="px-3 py-2 text-foreground-muted whitespace-nowrap">
                      {relativeTime(c.created_at)}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{c.sender ?? "—"}</td>
                    <td className="px-3 py-2 truncate max-w-[300px]">{c.subject ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono-amount">
                      {c.cost_eur.toFixed(4)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sparkline,
  tone,
}: {
  label: string;
  value: string;
  sparkline?: number[];
  tone?: "warning" | "success";
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-card p-4">
      <div className="text-[12px] text-foreground-subtle uppercase tracking-wider mb-2">
        {label}
      </div>
      <div
        className={cn(
          "text-h2 font-semibold font-mono-amount",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {sparkline && sparkline.length > 0 && (
        <div className="mt-2 h-8">
          <Sparkline data={sparkline} width={140} height={32} ariaLabel="OpenAI-Kosten Trend 30 Tage" />
        </div>
      )}
    </div>
  );
}
