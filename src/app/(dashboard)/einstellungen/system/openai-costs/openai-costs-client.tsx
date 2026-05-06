"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/ui/sparkline";
import { IconKey } from "@/components/ui/icons";
import type { CostRow } from "./page";

const SOURCE_LABEL: Record<string, string> = {
  email: "E-Mail-Pipeline",
  cardscan: "CardScan",
  billing_api: "OpenAI Billing-API",
};

const SOURCE_TONE: Record<string, "brand" | "info" | "muted"> = {
  email: "brand",
  cardscan: "info",
  billing_api: "muted",
};

function formatEur(eur: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(eur);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

export function OpenAICostsClient({ rows, days }: { rows: CostRow[]; days: number }) {
  const aggregates = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    let costToday = 0;
    let cost7d = 0;
    let cost30d = 0;
    let requests30d = 0;
    let inputTokens30d = 0;
    let outputTokens30d = 0;

    for (const r of rows) {
      const c = Number(r.cost_eur ?? 0);
      const d = r.date;
      cost30d += c;
      requests30d += r.num_requests || 0;
      inputTokens30d += r.input_tokens || 0;
      outputTokens30d += r.output_tokens || 0;
      if (d >= weekAgoStr) cost7d += c;
      if (d === todayStr) costToday += c;
    }

    // Pro Source
    const bySource = new Map<string, { cost: number; requests: number }>();
    for (const r of rows) {
      const cur = bySource.get(r.source) ?? { cost: 0, requests: 0 };
      cur.cost += Number(r.cost_eur ?? 0);
      cur.requests += r.num_requests || 0;
      bySource.set(r.source, cur);
    }

    // Pro Tag (alle Sources zusammen) — Sparkline-fähig
    const byDate = new Map<string, number>();
    for (const r of rows) {
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.cost_eur ?? 0));
    }
    const dateSeq: { date: string; cost: number }[] = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const ds = cursor.toISOString().slice(0, 10);
      dateSeq.push({ date: ds, cost: byDate.get(ds) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      costToday,
      cost7d,
      cost30d,
      requests30d,
      inputTokens30d,
      outputTokens30d,
      bySource: Array.from(bySource.entries()).sort((a, b) => b[1].cost - a[1].cost),
      dateSeq,
    };
  }, [rows, days]);

  const sparklineData = aggregates.dateSeq.map((d) => d.cost);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "OpenAI-Kosten" },
        ]}
        title="OpenAI-Kosten"
        description={`Tagesweise OpenAI-Aufwendungen aus E-Mail-Pipeline, CardScan und Billing-API der letzten ${days} Tage.`}
        meta={
          <span className="text-[12px] text-foreground-subtle font-mono-amount">
            {formatEur(aggregates.cost30d)} in {days} Tagen
          </span>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconKey className="h-5 w-5" />}
          title="Keine Kosten erfasst"
          description="Noch keine OpenAI-Calls in der E-Mail-Pipeline oder CardScan registriert. Sobald die Pipeline läuft, erscheinen hier die Tagesaufwendungen."
        />
      ) : (
        <>
          {/* KPI-Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Heute" value={formatEur(aggregates.costToday)} />
            <KpiCard label="Letzte 7 Tage" value={formatEur(aggregates.cost7d)} />
            <KpiCard label={`Letzte ${days} Tage`} value={formatEur(aggregates.cost30d)} />
            <KpiCard
              label={`Ø pro Tag (${days} d)`}
              value={formatEur(aggregates.cost30d / days)}
            />
          </div>

          {/* Trend + Token-Volumen nebeneinander */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <SectionCard
              title="Trend"
              description={`Tagesreihe der letzten ${days} Tage`}
              padding="md"
              className="lg:col-span-2"
            >
              <div className="flex items-end gap-4">
                <Sparkline
                  data={sparklineData}
                  width={520}
                  height={56}
                  fill
                  ariaLabel={`OpenAI-Kosten der letzten ${days} Tage: min ${formatEur(Math.min(...sparklineData))}, max ${formatEur(Math.max(...sparklineData))}, gesamt ${formatEur(aggregates.cost30d)}`}
                  className="w-full"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-foreground-subtle font-mono-amount">
                <span>{formatDate(aggregates.dateSeq[0]?.date ?? "")}</span>
                <span>{formatDate(aggregates.dateSeq[aggregates.dateSeq.length - 1]?.date ?? "")}</span>
              </div>
            </SectionCard>

            <SectionCard title="Token-Volumen" description={`Letzte ${days} Tage`} padding="md">
              <dl className="flex flex-col gap-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <dt className="text-foreground-subtle">Requests</dt>
                  <dd className="font-mono-amount font-semibold text-foreground">{formatNumber(aggregates.requests30d)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-foreground-subtle">Input-Tokens</dt>
                  <dd className="font-mono-amount font-semibold text-foreground">{formatNumber(aggregates.inputTokens30d)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-foreground-subtle">Output-Tokens</dt>
                  <dd className="font-mono-amount font-semibold text-foreground">{formatNumber(aggregates.outputTokens30d)}</dd>
                </div>
              </dl>
            </SectionCard>
          </div>

          {/* Pro Source */}
          <SectionCard title="Pro Quelle" description="Kostenaufteilung nach Pipeline" padding="none" headerBorder>
            <ul className="divide-y divide-line-subtle">
              {aggregates.bySource.map(([source, agg]) => {
                const share = aggregates.cost30d > 0 ? (agg.cost / aggregates.cost30d) * 100 : 0;
                return (
                  <li key={source} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge tone={SOURCE_TONE[source] ?? "muted"} size="md">
                        {SOURCE_LABEL[source] ?? source}
                      </Badge>
                      <span className="text-[12px] text-foreground-subtle font-mono-amount">
                        {formatNumber(agg.requests)} Requests
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-foreground-subtle font-mono-amount tabular-nums">
                        {share.toFixed(1)}%
                      </span>
                      <span className="font-mono-amount font-semibold text-foreground tabular-nums">
                        {formatEur(agg.cost)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {/* Detail-Tabelle */}
          <SectionCard title="Tagesreihe" padding="none" headerBorder>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-foreground-subtle">
                    <th className="px-5 py-2 text-left font-medium">Datum</th>
                    <th className="px-5 py-2 text-left font-medium">Quelle</th>
                    <th className="px-5 py-2 text-right font-medium">Requests</th>
                    <th className="px-5 py-2 text-right font-medium">Input</th>
                    <th className="px-5 py-2 text-right font-medium">Output</th>
                    <th className="px-5 py-2 text-right font-medium">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {rows.map((r, idx) => (
                    <tr key={`${r.date}-${r.source}-${idx}`} className="hover:bg-canvas-hover">
                      <td className="px-5 py-2 font-mono-amount text-foreground">{formatDate(r.date)}</td>
                      <td className="px-5 py-2">
                        <Badge tone={SOURCE_TONE[r.source] ?? "muted"} size="sm">
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </Badge>
                      </td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums">{formatNumber(r.num_requests)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums text-foreground-subtle">{formatNumber(r.input_tokens)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums text-foreground-subtle">{formatNumber(r.output_tokens)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount font-semibold tabular-nums">{formatEur(Number(r.cost_eur ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-subtle bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-foreground-subtle">{label}</div>
      <div className="mt-1 text-[20px] font-headline font-semibold text-foreground tabular-nums font-mono-amount">
        {value}
      </div>
    </div>
  );
}
