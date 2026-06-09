import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EditorialSection } from "@/components/ui/editorial-section";
import { BestellnummerHero } from "@/components/ui/bestellnummer-hero";
import { getEffektiverStatus, getStatusConfig } from "@/lib/status-config";
import { DOKUMENT_CONFIG, type Bestellungsart } from "@/lib/bestellung-utils";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { haendlerDisplay } from "@/lib/haendler-display";
import {
  IconArrowLeft,
  IconBuilding,
  IconAlertCircle,
} from "@/components/ui/icons";
import { OwnerStatement, type BestellerOption } from "./owner-statement";
import type { Bestellung, ProjektOption } from "./types";
import {
  shouldShowMahnung,
  effectiveMahnungCount,
  mahnungReviewHinweis,
} from "@/lib/mahnung-display";

/**
 * DetailHeader (UX-R3, 03.06.2026) — editoriale Akte für die Bestelldetail-Page.
 *
 * Foundation: `<EditorialSection tone="brand" marks lineBottom>` wraps the
 * whole hero. Inside:
 *
 *   - **Mahnung-Banner** (Stufe 1, full-width strip) wenn aktiv. Ersetzt
 *     die alte Pill in der Headline — max 1 lautes Element pro Card, und
 *     Mahnung verdrängt Status visuell.
 *   - **BestellnummerHero** als Display-Numeral (clamp 36-64px in Barlow
 *     Condensed). Bestellnummer ist der Anker der Akte, nicht eine von zehn
 *     Pills.
 *   - **Meta-Line:** Vendor + Doku-Counter + Bestelldatum + aktualisiert-Hint
 *   - **Status-Pill** sekundär (nicht laut wenn Mahnung aktiv).
 *   - **OwnerStatement** als editorial-statement-Block mit Magnetic-CTA für
 *     Pool/Auto-Claim, ghost-Buttons für Owned (UX-R3 ersetzt OwnerLane).
 *   - **Kontext-Pills** (Kundennummer, Projekt-Ref, Fälligkeit) Stufe-3-subtle.
 *   - **Artikel-Kategorien** als untergeordnete Chip-Reihe nach dem Hero.
 *
 * Visual-Weight-Disziplin v2 (DESIGN.md): max 1 Stufe-1-Element pro Surface.
 * Wenn Mahnung aktiv → Status-Pill bleibt klein, Stufe-1-Position gehört der
 * Mahnung. Wenn keine Mahnung → Status-Pill darf laut sein.
 */
export function DetailHeader({
  bestellung,
  projekte,
  profil,
  bestellerOptions,
  bezahltBereits,
}: {
  bestellung: Bestellung & {
    bestellnummer: string | null;
    auftragsnummer?: string | null;
    lieferscheinnummer?: string | null;
    haendler_name: string | null;
    besteller_name: string;
    betrag: number | null;
    betrag_ist_netto: boolean | null;
    waehrung: string | null;
    created_at: string;
    updated_at: string | null;
    artikel_kategorien: Record<string, number> | null;
    zuordnung_methode?: string | null;
  };
  projekte: ProjektOption[];
  profil?: { kuerzel: string; rolle: string; name: string };
  bestellerOptions?: BestellerOption[];
  /**
   * 09.06.2026 — Aggregiert aus dokumente (any-Rechnung mit bezahlt_bereits=true).
   * Wird in bestelldetail-shell aus dem dokumente-Array berechnet und an
   * den Header propagiert, damit shouldShowMahnung() PayPal korrekt blockt.
   */
  bezahltBereits?: boolean;
}) {
  const statusConfig = getStatusConfig(
    getEffektiverStatus(bestellung.status, bestellung.ist_gutschrift),
  );
  const art: Bestellungsart = bestellung.bestellungsart || "material";
  const pflichtDoks = DOKUMENT_CONFIG[art].filter((d) => d.erforderlich);
  const dokCount = pflichtDoks.filter(
    (d) => bestellung[d.flag as keyof typeof bestellung] === true,
  ).length;
  const dokTotal = pflichtDoks.length;
  const projektFarbe = bestellung.projekt_id
    ? projekte.find((p) => p.id === bestellung.projekt_id)?.farbe
    : undefined;

  const hd = haendlerDisplay(bestellung.haendler_name);
  // 03.06.2026 — Mahnung-Display via lib/mahnung-display Helper (defensive Regeln).
  // 09.06.2026 — bezahlt_bereits wird vom Parent aus dokumente aggregiert.
  const mahnungInput = {
    ...bestellung,
    bezahlt_bereits: bezahltBereits ?? null,
  };
  const hasMahnung = shouldShowMahnung(mahnungInput);
  const mahnungCountUI = effectiveMahnungCount(mahnungInput);
  const mahnungLabel = hasMahnung
    ? `Mahnung${
        mahnungCountUI > 1 ? ` ${mahnungCountUI}. Stufe` : ""
      } — ${new Date(bestellung.mahnung_am!).toLocaleDateString("de-DE")}`
    : null;
  const mahnungReviewMsg = mahnungReviewHinweis(mahnungInput);

  const ownerLaneTakesOver =
    art === "material" &&
    bestellung.status !== "freigegeben" &&
    !bestellung.ist_gutschrift &&
    !!profil;

  return (
    <>
      <Link
        href="/bestellungen"
        className="inline-flex items-center gap-1.5 w-fit mb-4 text-body-sm text-foreground-muted hover:text-brand transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Bestellungen
      </Link>

      <EditorialSection
        as="header"
        tone="brand"
        marks
        lineBottom
        padding="none"
        className={hasMahnung ? "mb-5" : "mb-5"}
      >
        {/* Mahnung-Banner (Stufe 1, full-width): Drei-Sprachen-Disziplin v2.
            Verdrängt Status visuell — nie zwei laute Elemente nebeneinander. */}
        {hasMahnung && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-status-abweichung/30 bg-status-abweichung-bg px-6 py-2 text-meta text-status-abweichung-text"
          >
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-semibold uppercase tracking-[0.14em] text-eyebrow">
              {mahnungLabel}
            </span>
          </div>
        )}
        {/* 09.06.2026 — Mahn-Mail erkannt, aber keine Rechnung hinterlegt.
            Statt Banner ein Review-Hinweis in warning-tone — kein „2. Stufe"
            mehr wenn die Bestellung gar keine Rechnung hat. */}
        {!hasMahnung && mahnungReviewMsg && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-warning/30 bg-warning-bg px-6 py-2 text-meta text-warning"
          >
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-semibold uppercase tracking-[0.14em] text-eyebrow">
              {mahnungReviewMsg}
            </span>
          </div>
        )}

        <div
          className="relative p-6 sm:p-8"
          style={projektFarbe ? { borderLeft: `4px solid ${projektFarbe}` } : undefined}
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative">
            <div className="flex-1 min-w-0">
              {/* Bestellnummer als Display-Numeral. Halluzinations-sicher
                  durch BestellnummerHero mit BNi-Fallback. */}
              <BestellnummerHero
                bestellung={bestellung}
                subline={
                  <span className="inline-flex items-center gap-2 text-body-sm text-foreground-muted">
                    <IconBuilding className="h-3.5 w-3.5 text-foreground-subtle" />
                    <span className="font-medium">{hd.name}</span>
                    {hd.isUnsicher && (
                      <span
                        aria-hidden="true"
                        title="Pipeline hat den Lieferanten nicht eindeutig erkannt — Domain als Marker übernommen."
                        className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-warning-bg text-warning text-eyebrow font-bold font-mono-amount cursor-help"
                      >
                        ?
                      </span>
                    )}
                  </span>
                }
              />

              {/* Status + Doku-Counter + Datum + BestellerCell (wenn keine OwnerLane).
                  Status ist hier sekundär — wenn Mahnung aktiv, ist Mahnung Stufe 1. */}
              <div className="mt-4 flex items-center gap-2.5 flex-wrap text-meta text-foreground-subtle">
                <span
                  className={`status-tag ${statusConfig.bg} ${statusConfig.text}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm"
                    style={{ background: statusConfig.color }}
                  />
                  <statusConfig.Icon
                    className="w-3 h-3 mr-1 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Status: </span>
                  {statusConfig.label}
                </span>

                {!ownerLaneTakesOver && (
                  <>
                    <span aria-hidden="true" className="text-line-strong">·</span>
                    <BestellerCell
                      besteller_kuerzel={bestellung.besteller_kuerzel}
                      besteller_name={bestellung.besteller_name}
                      bestellungsart={bestellung.bestellungsart}
                      vorschlag_kuerzel={bestellung.vorschlag_kuerzel ?? null}
                      vorschlag_konfidenz={bestellung.vorschlag_konfidenz ?? null}
                      variant="with-name"
                    />
                  </>
                )}

                <span aria-hidden="true" className="text-line-strong">·</span>
                <DokumentCountPill current={dokCount} total={dokTotal} />

                <span aria-hidden="true" className="text-line-strong">·</span>
                {bestellung.bestelldatum ? (
                  <span
                    className="cursor-default"
                    title={`Bestellt am ${new Date(bestellung.bestelldatum).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })} (erfasst ${new Date(bestellung.created_at).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })})`}
                  >
                    Bestellt{" "}
                    {new Date(bestellung.bestelldatum).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                ) : (
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
                )}
                {bestellung.updated_at &&
                  bestellung.updated_at !== bestellung.created_at && (
                    <>
                      <span aria-hidden="true" className="text-line-strong">·</span>
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

              {/* Projekt-Pill (Stufe 3, subtle). */}
              {bestellung.projekt_name && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas text-meta">
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: projektFarbe || "var(--mr-red)" }}
                  />
                  <span className="font-medium text-foreground">
                    {bestellung.projekt_name}
                  </span>
                </div>
              )}

              {/* OwnerStatement — editorial-Statement-Block (UX-R3).
                  Ersetzt die alte enge OwnerLane. Drei Render-Pfade:
                  Pool/Vorschlag (Magnetic-CTA), Owned (ghost actions),
                  Auto-Claim-24h-Grace (Korrigieren-Link).
                  Rendert null in SU/Abo + freigegeben + Gutschrift. */}
              {profil && (
                <OwnerStatement
                  bestellungId={bestellung.id}
                  besteller_kuerzel={bestellung.besteller_kuerzel}
                  besteller_name={bestellung.besteller_name}
                  bestellungsart={bestellung.bestellungsart}
                  status={bestellung.status}
                  vorschlag_kuerzel={bestellung.vorschlag_kuerzel ?? null}
                  vorschlag_konfidenz={bestellung.vorschlag_konfidenz ?? null}
                  zuordnung_methode={bestellung.zuordnung_methode ?? null}
                  updated_at={bestellung.updated_at ?? null}
                  istGutschrift={bestellung.ist_gutschrift}
                  profil={profil}
                  besteller_options={bestellerOptions ?? []}
                />
              )}

              {/* Kontext-Pills (Stufe 3, subtle): Kundennummer, Projekt-Ref,
                  Fälligkeit. Nur wenn die KI was extrahiert hat. */}
              {(bestellung.kundennummer ||
                bestellung.projekt_referenz ||
                bestellung.faelligkeitsdatum) && (
                <div className="mt-3 flex items-center gap-1.5 flex-wrap text-meta">
                  {bestellung.kundennummer && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas border border-line-subtle text-foreground-muted"
                      title={`Kundennummer beim Lieferanten: ${bestellung.kundennummer}`}
                    >
                      <span className="text-foreground-subtle">Kd-Nr.</span>
                      <span className="font-mono-amount font-medium text-foreground">
                        {bestellung.kundennummer}
                      </span>
                    </span>
                  )}
                  {bestellung.projekt_referenz && !bestellung.projekt_name && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas border border-line-subtle text-foreground-muted"
                      title={`Projekt-Referenz aus Dokument: ${bestellung.projekt_referenz}`}
                    >
                      <span className="text-foreground-subtle">Ref:</span>
                      <span className="font-medium text-foreground line-clamp-1 max-w-[280px]">
                        {bestellung.projekt_referenz}
                      </span>
                    </span>
                  )}
                  {bestellung.faelligkeitsdatum &&
                    (() => {
                      const f = new Date(bestellung.faelligkeitsdatum);
                      const tageBis = Math.ceil(
                        (f.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                      );
                      const ueberfaellig =
                        tageBis < 0 && bestellung.status !== "freigegeben";
                      const baldFaellig = tageBis >= 0 && tageBis <= 7;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                            ueberfaellig
                              ? "bg-error-bg border-error-border text-error"
                              : baldFaellig
                                ? "bg-warning-bg border-warning-border text-warning"
                                : "bg-canvas border-line-subtle text-foreground-muted"
                          }`}
                          title={`Zahlfrist aus Rechnung: ${f.toLocaleDateString("de-DE")}`}
                        >
                          <span className="text-foreground-subtle">Fällig</span>
                          <span className="font-medium">
                            {f.toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                          {ueberfaellig && (
                            <span className="font-semibold">· überfällig</span>
                          )}
                          {baldFaellig && !ueberfaellig && (
                            <span className="font-semibold">· in {tageBis}d</span>
                          )}
                        </span>
                      );
                    })()}
                </div>
              )}
            </div>

            {/* Betrag-Hero rechts. Editorial Display-Stil mit eyebrow oben. */}
            <div className="flex flex-col items-end shrink-0">
              <p className="text-eyebrow font-semibold tracking-[0.18em] uppercase text-foreground-subtle">
                {bestellung.ist_gutschrift
                  ? "Guthaben"
                  : `Betrag${bestellung.betrag_ist_netto ? " (netto)" : ""}`}
              </p>
              <p
                className={`text-display-section font-bold font-mono-amount mt-1 leading-none ${
                  bestellung.ist_gutschrift ? "text-success" : "text-foreground"
                }`}
              >
                {bestellung.betrag
                  ? `${bestellung.ist_gutschrift ? "+ " : ""}${Number(
                      bestellung.betrag,
                    ).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                  : "–"}
              </p>
              {bestellung.waehrung && bestellung.waehrung !== "EUR" && (
                <p className="text-eyebrow text-foreground-subtle font-mono-amount mt-1">
                  {bestellung.waehrung}
                </p>
              )}
            </div>
          </div>
        </div>
      </EditorialSection>

      {bestellung.artikel_kategorien &&
        Object.keys(bestellung.artikel_kategorien).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {Object.entries(bestellung.artikel_kategorien).map(([kat, anzahl]) => (
              <Badge key={kat} tone="brand" size="md" className="gap-1.5">
                {kat}
                <span className="font-mono-amount bg-brand/10 text-brand rounded px-1 py-0.5 text-eyebrow font-bold">
                  {anzahl}
                </span>
              </Badge>
            ))}
          </div>
        )}
    </>
  );
}

function DokumentCountPill({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const complete = current === total;
  return (
    <span
      className={
        "inline-flex items-center gap-1 font-medium " +
        (complete ? "text-status-freigegeben" : "text-foreground-muted")
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
