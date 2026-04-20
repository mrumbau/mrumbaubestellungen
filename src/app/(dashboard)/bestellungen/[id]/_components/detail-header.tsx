import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/lib/status-config";
import { DOKUMENT_CONFIG, type Bestellungsart } from "@/lib/bestellung-utils";
import {
  IconArrowLeft,
  IconBuilding,
  IconAlertCircle,
} from "@/components/ui/icons";
import type { Bestellung, ProjektOption } from "./types";

/**
 * DetailHeader — page-wide header below the SubNav / main sidebar.
 *
 * Covers: back-link, bestellnummer, status tag, Mahnung-hinweis, händler-,
 * besteller- and dokumentzähler-meta, projekt-tag, prominent betrag on the right,
 * and the optional artikel-kategorien chip row.
 *
 * Pure server-renderable — no client state. Consumes the bestellung record plus
 * the projekt list so the project colour bar on the card matches the project tag.
 */
export function DetailHeader({
  bestellung,
  projekte,
}: {
  bestellung: Bestellung & {
    bestellnummer: string | null;
    haendler_name: string | null;
    besteller_name: string;
    betrag: number | null;
    betrag_ist_netto: boolean | null;
    waehrung: string | null;
    created_at: string;
    updated_at: string | null;
    artikel_kategorien: Record<string, number> | null;
  };
  projekte: ProjektOption[];
}) {
  const statusConfig = getStatusConfig(bestellung.status);
  const art: Bestellungsart = bestellung.bestellungsart || "material";
  const pflichtDoks = DOKUMENT_CONFIG[art].filter((d) => d.erforderlich);
  const dokCount = pflichtDoks.filter(
    (d) => bestellung[d.flag as keyof typeof bestellung] === true,
  ).length;
  const dokTotal = pflichtDoks.length;
  const projektFarbe = bestellung.projekt_id
    ? projekte.find((p) => p.id === bestellung.projekt_id)?.farbe
    : undefined;

  return (
    <>
      <Link
        href="/bestellungen"
        className="inline-flex items-center gap-1.5 w-fit mb-4 text-[13px] text-foreground-muted hover:text-brand transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Bestellungen
      </Link>

      <div
        className="card p-5 mb-5 relative overflow-hidden"
        style={projektFarbe ? { borderLeft: `4px solid ${projektFarbe}` } : undefined}
      >
        {/* Subtle gradient overlay — status hint */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-48 h-full opacity-[0.03]"
          style={{ background: `linear-gradient(270deg, ${statusConfig.color}, transparent)` }}
        />

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 relative">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-headline text-[22px] md:text-[24px] tracking-tight text-foreground">
                {bestellung.bestellnummer || "Ohne Nr."}
              </h1>
              <span
                className={`status-tag ${statusConfig.bg} ${statusConfig.text}`}
                style={{ position: "relative" }}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm"
                  style={{ background: statusConfig.color }}
                />
                {statusConfig.label}
              </span>
              {bestellung.mahnung_am && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-error-bg border border-error-border text-error text-[11px] font-semibold"
                  title={`Mahnung eingegangen am ${new Date(bestellung.mahnung_am).toLocaleDateString("de-DE")}`}
                >
                  <IconAlertCircle className="h-3.5 w-3.5" />
                  {bestellung.mahnung_count && bestellung.mahnung_count > 1
                    ? `${bestellung.mahnung_count}. Mahnung`
                    : "Mahnung"}{" "}
                  — {new Date(bestellung.mahnung_am).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>

            {/* Compact meta line */}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-[12px] text-foreground-subtle">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground-muted">
                <IconBuilding className="h-3.5 w-3.5 text-foreground-subtle" />
                {bestellung.haendler_name || "–"}
              </span>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>

              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 w-5 items-center justify-center rounded bg-brand text-white text-[9px] font-bold font-mono-amount"
                >
                  {bestellung.besteller_kuerzel}
                </span>
                <span className="text-foreground-muted">{bestellung.besteller_name}</span>
              </span>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>

              <DokumentCountPill current={dokCount} total={dokTotal} />
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>

              <span
                className="cursor-default"
                title={new Date(bestellung.created_at).toLocaleString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              >
                {relativeZeit(bestellung.created_at)}
              </span>
              {bestellung.updated_at && bestellung.updated_at !== bestellung.created_at && (
                <>
                  <span aria-hidden="true" className="text-line-strong">
                    ·
                  </span>
                  <span
                    className="cursor-default text-foreground-subtle"
                    title={`Aktualisiert: ${new Date(bestellung.updated_at).toLocaleString(
                      "de-DE",
                      {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}`}
                  >
                    aktualisiert {relativeZeit(bestellung.updated_at)}
                  </span>
                </>
              )}
            </div>

            {bestellung.projekt_name && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas text-[12px]">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: projektFarbe || "var(--mr-red)" }}
                />
                <span className="font-medium text-foreground">{bestellung.projekt_name}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end shrink-0">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground-subtle">
              Betrag{bestellung.betrag_ist_netto ? " (netto)" : ""}
            </p>
            <p className="text-[26px] font-bold font-mono-amount text-foreground mt-0.5 leading-none">
              {bestellung.betrag
                ? `${Number(bestellung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                : "–"}
            </p>
            {bestellung.waehrung && bestellung.waehrung !== "EUR" && (
              <p className="text-[10px] text-foreground-subtle font-mono-amount mt-0.5">
                {bestellung.waehrung}
              </p>
            )}
          </div>
        </div>
      </div>

      {bestellung.artikel_kategorien &&
        Object.keys(bestellung.artikel_kategorien).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {Object.entries(bestellung.artikel_kategorien).map(([kat, anzahl]) => (
              <Badge key={kat} tone="brand" size="md" className="gap-1.5">
                {kat}
                <span className="font-mono-amount bg-brand/10 text-brand rounded px-1 py-0.5 text-[10px] font-bold">
                  {anzahl}
                </span>
              </Badge>
            ))}
          </div>
        )}
    </>
  );
}

function DokumentCountPill({ current, total }: { current: number; total: number }) {
  const complete = current === total;
  return (
    <span
      className={
        "inline-flex items-center gap-1 font-medium " +
        (complete ? "text-status-freigegeben" : "text-warning")
      }
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M4 2.5h6l2.5 2.5v9a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5z" />
        <path d="M10 2.5V5h2.5" />
      </svg>
      <span className="font-mono-amount">
        {current}/{total}
      </span>
    </span>
  );
}

function relativeZeit(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  const wochen = Math.floor(tage / 7);
  if (wochen === 1) return "vor 1 Woche";
  if (wochen < 5) return `vor ${wochen} Wochen`;
  const monate = Math.floor(tage / 30);
  if (monate === 1) return "vor 1 Monat";
  if (monate < 12) return `vor ${monate} Monaten`;
  return `vor ${Math.floor(monate / 12)} Jahr(en)`;
}
