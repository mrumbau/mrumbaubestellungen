"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/ui/sparkline";
import { IconActivity, IconAlertCircle, IconAlertTriangle } from "@/components/ui/icons";
import type {
  PipelineQualityRow,
  IncompleteBestellung,
  ExpensiveMail,
  SecondReviewStats,
  SecondReviewDisagreement,
} from "./page";

function formatPct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n));
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 14) return `vor ${diffD} Tag${diffD === 1 ? "" : "en"}`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export function PipelineQualityClient({
  rows,
  incomplete,
  expensive,
  secondReviewStats,
  secondReviewDisagreements,
}: {
  rows: PipelineQualityRow[];
  incomplete: IncompleteBestellung[];
  expensive: ExpensiveMail[];
  secondReviewStats: SecondReviewStats;
  secondReviewDisagreements: SecondReviewDisagreement[];
}) {
  const aggregates = useMemo(() => {
    const last7 = rows.slice(0, 7);
    const sum7 = last7.reduce(
      (acc, r) => ({
        mails: acc.mails + (r.total_mails || 0),
        processed: acc.processed + (r.processed || 0),
        failed: acc.failed + (r.failed || 0),
        terminally: acc.terminally + (r.terminally_failed || 0),
        cost: acc.cost + Number(r.day_cost_eur ?? 0),
        bestellungen: acc.bestellungen + (r.bestellungen_neu || 0),
        ohne_betrag: acc.ohne_betrag + (r.ohne_betrag || 0),
      }),
      { mails: 0, processed: 0, failed: 0, terminally: 0, cost: 0, bestellungen: 0, ohne_betrag: 0 },
    );

    const successRate = sum7.mails > 0 ? (sum7.processed / sum7.mails) * 100 : 0;
    const ohneBetragRate = sum7.bestellungen > 0 ? (sum7.ohne_betrag / sum7.bestellungen) * 100 : 0;

    // Sparkline-Daten (chronologisch alt → neu)
    const chronological = [...rows].reverse();
    const successSpark = chronological.map((r) =>
      r.total_mails > 0 ? (r.processed / r.total_mails) * 100 : 0,
    );
    const costSpark = chronological.map((r) => Number(r.day_cost_eur ?? 0));
    const konfidenzSpark = chronological.map((r) => Number(r.avg_konfidenz ?? 0));

    // Anomalie-Erkennung
    const anomalies: { date: string; reason: string }[] = [];
    for (const r of rows) {
      if (r.terminally_failed >= 3) {
        anomalies.push({ date: r.date, reason: `${r.terminally_failed} Mails dauerhaft failed (3× Retry erschöpft)` });
      }
      if (r.prozent_ohne_betrag != null && r.prozent_ohne_betrag >= 30 && r.bestellungen_neu >= 5) {
        anomalies.push({
          date: r.date,
          reason: `${r.prozent_ohne_betrag.toFixed(0)}% der ${r.bestellungen_neu} neuen Bestellungen ohne Betrag`,
        });
      }
      if (r.folder_mismatch >= 5) {
        anomalies.push({ date: r.date, reason: `${r.folder_mismatch}× Folder-Mismatch (Outlook-Routing-Regel?)` });
      }
    }

    return {
      sum7,
      successRate,
      ohneBetragRate,
      successSpark,
      costSpark,
      konfidenzSpark,
      anomalies,
    };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Pipeline-Qualität" },
        ]}
        title="Pipeline-Qualität"
        description="Tagesweise Mail-Verarbeitungs-Metriken und Anomalie-Erkennung der letzten 30 Tage."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconActivity className="h-5 w-5" />}
          title="Noch keine Pipeline-Aktivität"
          description="In den letzten 30 Tagen wurden keine Mails verarbeitet. Sobald die Email-Sync wieder eingehende Mails findet, erscheinen hier täglich Mengen-, Cost- und Konfidenz-Metriken plus Anomalie-Warnungen."
        />
      ) : (
        <>
          {/* KPI-Cards: 7-Tage-Aggregat */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Mails (7 Tage)" value={formatNum(aggregates.sum7.mails)} />
            <KpiCard
              label="Success-Rate"
              value={`${aggregates.successRate.toFixed(1)}%`}
              tone={aggregates.successRate >= 90 ? "ok" : aggregates.successRate >= 70 ? "warn" : "err"}
            />
            <KpiCard
              label="Bestellungen ohne Betrag"
              value={`${aggregates.ohneBetragRate.toFixed(0)}%`}
              tone={aggregates.ohneBetragRate <= 10 ? "ok" : aggregates.ohneBetragRate <= 25 ? "warn" : "err"}
            />
            <KpiCard label="Kosten (7 Tage)" value={formatEur(aggregates.sum7.cost)} />
          </div>

          {/* Anomalien */}
          {aggregates.anomalies.length > 0 && (
            <SectionCard
              title="Anomalien"
              description="Tage mit auffälligen Pipeline-Werten"
              padding="none"
              headerBorder
            >
              <ul className="divide-y divide-line-subtle">
                {aggregates.anomalies.slice(0, 10).map((a, idx) => (
                  <li key={idx} className="flex items-start gap-3 px-5 py-3">
                    <IconAlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-foreground-subtle">{formatDate(a.date)}</div>
                      <div className="text-[14px] text-foreground">{a.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* Unvollständige Extraktionen — konkrete Bestellungen, nicht aggregiert.
              State-driven: Bestellungen mit Bestellnr+Händler aber ohne Betrag,
              letzte 14 Tage. Hilft die "still verschluckten" Mails zu finden
              ohne dass man die Liste manuell durchscrollen muss. */}
          {incomplete.length > 0 && (
            <SectionCard
              title="Unvollständige Bestellungen"
              description={`${incomplete.length} Bestellung${incomplete.length === 1 ? "" : "en"} mit Bestellnr + Händler aber ohne Betrag (letzte 14 Tage).`}
              padding="none"
              headerBorder
            >
              <ul className="divide-y divide-line-subtle">
                {incomplete.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-canvas-hover">
                    <IconAlertCircle className="w-4 h-4 text-warning shrink-0" />
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-1 sm:gap-3 sm:items-center">
                      <Link
                        href={`/bestellungen/${b.id}`}
                        className="text-[14px] font-mono-amount text-foreground hover:text-brand truncate"
                      >
                        {b.bestellnummer || "—"}
                      </Link>
                      <div className="text-[13px] text-foreground-subtle truncate">
                        {b.haendler_name}
                        {b.besteller_name && <span className="text-foreground-faint"> · {b.besteller_name}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-foreground-subtle">
                        <span className="hidden sm:inline">{formatRelative(b.created_at)}</span>
                        {b.hat_rechnung && <Badge tone="info" size="sm">RG</Badge>}
                        {b.hat_bestellbestaetigung && !b.hat_rechnung && <Badge tone="neutral" size="sm">BB</Badge>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* A4.12 — Top-20 teuerste Mails 7 Tage mit Drill-Down */}
          {expensive.length > 0 && (
            <SectionCard
              title="Teuerste Mails (7 Tage)"
              description={`Top ${expensive.length} nach OpenAI-Kosten. Klick auf Subject → Bestellung-Detail. Auffällig hohe Werte deuten auf Always-KI-Retry-Schleifen, fehl-konfigurierte Vendor-Parser oder adversariale PDFs.`}
              padding="none"
              headerBorder
            >
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-foreground-subtle border-b border-line-subtle">
                      <th className="px-5 py-2 text-right font-medium">Kosten</th>
                      <th className="px-5 py-2 text-right font-medium">Tokens (in/out)</th>
                      <th className="px-5 py-2 text-left font-medium">Subject / Absender</th>
                      <th className="px-5 py-2 text-left font-medium">Parser</th>
                      <th className="px-5 py-2 text-left font-medium">Status</th>
                      <th className="px-5 py-2 text-right font-medium">Wann</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {expensive.map((m) => (
                      <tr key={m.graph_message_id} className="hover:bg-canvas-hover">
                        <td className="px-5 py-2 text-right font-mono-amount tabular-nums font-semibold">
                          {formatEur(m.openai_cost_eur)}
                        </td>
                        <td className="px-5 py-2 text-right font-mono-amount tabular-nums text-foreground-subtle">
                          {formatNum(m.openai_input_tokens)} / {formatNum(m.openai_output_tokens)}
                        </td>
                        <td className="px-5 py-2 min-w-0 max-w-[420px]">
                          {m.bestellung_id ? (
                            <Link
                              href={`/bestellungen/${m.bestellung_id}`}
                              className="block text-foreground hover:text-brand truncate"
                            >
                              {m.subject || "(ohne Betreff)"}
                            </Link>
                          ) : (
                            <span className="block text-foreground truncate">
                              {m.subject || "(ohne Betreff)"}
                            </span>
                          )}
                          <span className="block text-[11px] text-foreground-subtle truncate font-mono-amount">
                            {m.sender || "—"}
                            {m.has_attachments && <span className="ml-2 text-info">📎</span>}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-[12px] text-foreground-subtle">
                          {m.parser_name ? (
                            <span>
                              {m.parser_name}
                              <span className="text-foreground-faint"> ({m.parser_source ?? "?"})</span>
                            </span>
                          ) : (
                            <span className="text-foreground-faint">{m.parser_source ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          <Badge
                            tone={
                              m.status === "processed" ? "success" :
                              m.status === "failed" || m.status === "terminally_failed" ? "error" :
                              m.status === "irrelevant" ? "neutral" :
                              "warning"
                            }
                            size="sm"
                          >
                            {m.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-2 text-right text-[12px] text-foreground-subtle">
                          {formatRelative(m.processed_at ?? m.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* 22.05.2026 — KI-Zweitmeinung: Silent-Drops der letzten 7 Tage durch
              adversarialen 2. Pass (gpt-5.5 mit "First-Reviewer hat übersehen"-Frame).
              Generisch statt Vendor-Parser. Stündlich via Cron. */}
          <SectionCard
            title="KI-Zweitmeinung (7 Tage)"
            description="Adversarialer 2. Pass auf alle Mails mit Anhang die keine Bestellung erzeugt haben. Stoppt Silent-Drops wie das Engelhard-Pattern ohne Vendor-spezifischen Code."
            padding="md"
            headerBorder
          >
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <StatBlock
                label="Reviewed"
                value={secondReviewStats.reviewed_7d}
                tone="neutral"
              />
              <StatBlock
                label="Bestätigt drop"
                value={secondReviewStats.agreed_irrelevant_7d}
                tone="neutral"
                hint="KI #1 hatte recht"
              />
              <StatBlock
                label="Widersprochen"
                value={secondReviewStats.disagreed_7d}
                tone={secondReviewStats.disagreed_7d > 0 ? "warning" : "neutral"}
                hint="Silent-Drop verdacht"
              />
              <StatBlock
                label="Gerettet"
                value={secondReviewStats.rerun_success_7d}
                tone={secondReviewStats.rerun_success_7d > 0 ? "success" : "neutral"}
                hint="Bestellung nachträglich angelegt"
              />
              <StatBlock
                label="Pending"
                value={secondReviewStats.pending_candidates}
                tone="neutral"
                hint="Cron pickt sie als nächstes"
              />
            </div>

            {secondReviewDisagreements.length > 0 ? (
              <div className="border-t border-line-subtle pt-4">
                <p className="text-[12px] uppercase tracking-wide text-foreground-subtle mb-2">
                  Letzte Widersprüche
                </p>
                <ul className="space-y-2">
                  {secondReviewDisagreements.map((d) => (
                    <li
                      key={d.internet_message_id}
                      className="flex flex-col gap-1 p-3 rounded-md border border-line-subtle bg-canvas/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {d.subject || "(ohne Betreff)"}
                          </p>
                          <p className="text-[11px] text-foreground-subtle font-mono-amount truncate">
                            {d.sender || "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {d.bestellung_id ? (
                            <Link
                              href={`/bestellungen/${d.bestellung_id}`}
                              className="text-[11px] text-brand hover:text-brand-light font-medium"
                            >
                              Bestellung →
                            </Link>
                          ) : (
                            <Badge tone="warning" size="sm">
                              {d.second_review_rerun_outcome ?? "kein Bestellung"}
                            </Badge>
                          )}
                          <span className="text-[10px] text-foreground-faint">
                            {formatRelative(d.second_review_at)}
                          </span>
                        </div>
                      </div>
                      {d.second_review_reason && (
                        <p className="text-[11px] text-foreground-muted italic">
                          „{d.second_review_reason}"
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : secondReviewStats.reviewed_7d > 0 ? (
              <p className="text-[12px] text-foreground-subtle">
                Letzte 7 Tage: keine Widersprüche. KI #1 hat alle Drops korrekt eingestuft.
              </p>
            ) : (
              <p className="text-[12px] text-foreground-subtle">
                Noch keine Reviews. Cron läuft stündlich um :15 Min.
              </p>
            )}
          </SectionCard>

          {/* Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <TrendCard
              label="Success-Rate (30 Tage)"
              data={aggregates.successSpark}
              color="var(--success)"
              suffix="%"
            />
            <TrendCard
              label="OpenAI-Kosten/Tag"
              data={aggregates.costSpark}
              color="var(--mr-red)"
              suffix=" €"
            />
            <TrendCard
              label="KI-Konfidenz Ø"
              data={aggregates.konfidenzSpark}
              color="var(--info)"
              fmt={(v) => v.toFixed(2)}
            />
          </div>

          {/* Tagesreihe */}
          <SectionCard title="Tagesreihe" padding="none" headerBorder>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-[12px] uppercase tracking-wide text-foreground-subtle border-b border-line-subtle">
                    <th className="px-5 py-2 text-left font-medium">Datum</th>
                    <th className="px-5 py-2 text-right font-medium">Mails</th>
                    <th className="px-5 py-2 text-right font-medium">OK</th>
                    <th className="px-5 py-2 text-right font-medium">Failed</th>
                    <th className="px-5 py-2 text-right font-medium">Ø Konfidenz</th>
                    <th className="px-5 py-2 text-right font-medium">Bestellungen</th>
                    <th className="px-5 py-2 text-right font-medium">Ohne Betrag</th>
                    <th className="px-5 py-2 text-right font-medium">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {rows.map((r) => (
                    <tr key={r.date} className="hover:bg-canvas-hover">
                      <td className="px-5 py-2 font-mono-amount">{formatDate(r.date)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums">{formatNum(r.total_mails)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums text-success">{formatNum(r.processed)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums">
                        {r.failed > 0 ? (
                          <span className="inline-flex items-center gap-1 text-error">
                            {r.terminally_failed > 0 && <IconAlertCircle className="w-3 h-3" />}
                            {formatNum(r.failed)}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums text-foreground-subtle">
                        {r.avg_konfidenz != null ? Number(r.avg_konfidenz).toFixed(2) : "—"}
                      </td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums">{formatNum(r.bestellungen_neu)}</td>
                      <td className="px-5 py-2 text-right font-mono-amount tabular-nums">
                        {r.prozent_ohne_betrag != null ? (
                          <Badge
                            tone={r.prozent_ohne_betrag <= 10 ? "success" : r.prozent_ohne_betrag <= 25 ? "warning" : "error"}
                            size="sm"
                          >
                            {formatPct(r.prozent_ohne_betrag)}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-2 text-right font-mono-amount font-semibold tabular-nums">{formatEur(r.day_cost_eur)}</td>
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

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "err" }) {
  const valueClass =
    tone === "ok" ? "text-success" :
    tone === "warn" ? "text-warning" :
    tone === "err" ? "text-error" :
    "text-foreground";
  return (
    <div className="rounded-md border border-line-subtle bg-surface px-4 py-3">
      <div className="text-[12px] uppercase tracking-wide text-foreground-subtle">{label}</div>
      <div className={`mt-1 text-[18px] font-headline font-semibold tabular-nums font-mono-amount ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "error";
  hint?: string;
}) {
  const valueClass =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "error" ? "text-error" :
    "text-foreground";
  return (
    <div className="rounded-md border border-line-subtle bg-canvas/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-foreground-subtle">{label}</div>
      <div className={`mt-0.5 text-[20px] font-headline font-semibold tabular-nums font-mono-amount ${valueClass}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-foreground-faint mt-0.5">{hint}</div>}
    </div>
  );
}

function TrendCard({
  label,
  data,
  color,
  suffix,
  fmt,
}: {
  label: string;
  data: number[];
  color: string;
  suffix?: string;
  fmt?: (v: number) => string;
}) {
  const last = data[data.length - 1] ?? 0;
  const display = fmt ? fmt(last) : last.toFixed(1);
  return (
    <SectionCard title={label} padding="md">
      <div className="text-[18px] font-headline font-semibold text-foreground font-mono-amount tabular-nums mb-2">
        {display}{suffix ?? ""}
      </div>
      <Sparkline
        data={data.length >= 2 ? data : [0, 0]}
        width={300}
        height={40}
        color={color}
        fill
        ariaLabel={`${label}: ${display}${suffix ?? ""}`}
        className="w-full"
      />
    </SectionCard>
  );
}
