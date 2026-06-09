"use client";

/**
 * PoolInbox — Card-Feed-Layout für den Pool-Scope.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2): rendert die gleiche Datenmenge wie die
 * Tabelle, aber als Posteingang-Cards mit Vendor-Strip, Hero-Betrag,
 * Vorschlag-Pill, Doku-Status, Mahnung-Marker, Aging-Wash, ReserveBadge,
 * Snooze/Defer-ActionMenu und Unread-Dot.
 *
 * Drei-Sprachen-Disziplin durchgesetzt:
 *   - Unread = brand-6px-Dot oben links
 *   - Aging-Wash = amber-50/40 ≥7d, rose-50/40 ≥14d (max-Opacity-/40)
 *   - Reserve = neutral border + Uhr-Glyph + Countdown (via ReserveBadge)
 *   - Vorschlag = BestellerCell pill-only (existierender Ghost-Pill)
 *   - Status = StatusCell unverändert
 *
 * Card-Click öffnet Drawer (gleiche Action wie Tabelle-Row-Click im
 * Pool-Scope). Cmd/Shift/Middle-Click navigiert zur Detail-Page via Link.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  buildZuordnungActionLabel,
  buildZuordnungConfirmText,
  type AssignableBestellerOption,
} from "@/lib/zuordnung";
import Link from "next/link";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { StatusCell } from "@/components/ui/cells/status-cell";
import { BetragCell } from "@/components/ui/cells/betrag-cell";
import { DokumenteCell } from "@/components/ui/cells/dokumente-cell";
import { VendorFavicon } from "@/components/ui/cells/vendor-favicon";
import { ReserveBadge } from "@/components/ui/cells/reserve-badge";
import { ScoreBadge } from "@/components/ui/cells/score-badge";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { haendlerDisplay } from "@/lib/haendler-display";
import { agingWashFromCreatedAt, ageInDays, describeAge } from "@/lib/pool-utils";
import { smartSnoozeOptions } from "@/lib/pool-inbox-state";
import {
  computeScore,
  type AffinityMap,
  type PoolScoreWeights,
  type ScoreBreakdown,
} from "@/lib/pool-score";
import { usePoolSeenTracker } from "@/lib/hooks/use-pool-seen-tracker";
import { usePoolReservationsRealtime, type ReservationMap } from "@/lib/hooks/use-pool-reservations-realtime";
import { cn } from "@/lib/cn";
import type { Bestellung } from "./types";
import { getAssignableBesteller } from "@/lib/zuordnung";
import { shouldShowMahnung, effectiveMahnungCount } from "@/lib/mahnung-display";

export interface PoolInboxProps {
  bestellungen: Bestellung[];
  /** Vendor-Domain-Lookup pro bestellung.id (vom Server vorbereitet). */
  vendorDomainById?: Record<string, string | null>;
  /** haendler_id-Lookup pro bestellung.id für Score-Affinity. */
  haendlerIdByBestellungId?: Record<string, string | null>;
  /** Pool-User-State pro bestellung.id (seen + deferred). */
  userStateById?: Record<string, { seen: boolean; deferred: boolean }>;
  /** Initialer Reservations-Snapshot vom Server (Realtime patcht inkrementell). */
  initialReservations?: ReservationMap;
  /** Self-Kürzel um eigene Reservierungen zu erkennen. */
  selfKuerzel: string;
  /**
   * 03.06.2026 (Pool 2.0 Sprint 3) — Score-Konfiguration.
   * `weights` aus firma_einstellungen.pool_score_weights (admin-tuned).
   * `vendorAffinity` + `projektAffinity` Map vom Server für selfKuerzel.
   * `topXThreshold` ist die Schwelle für die ScoreBadge-Sichtbarkeit.
   */
  scoreWeights?: PoolScoreWeights;
  vendorAffinity?: AffinityMap;
  projektAffinity?: AffinityMap;
  scoreTopXThreshold?: number;
  /**
   * 03.06.2026 (Pool 2.0 Sprint 3) — Auto-Claim-Pin pro Bestellung.
   * Server berechnet aus `zuordnung_methode` ob das Item via Pipeline
   * promoted wurde. BestellerCell rendert dann das Roboter-Glyph oben rechts.
   * Nur in claim'd Items (kein UNBEKANNT) sichtbar — BestellerCell gated
   * intern auf state='owner'.
   */
  isAutoClaimedById?: Record<string, boolean>;
  /** Drawer öffnen. */
  onOpenDrawer: (bestellungId: string) => void;
  /** Snooze-Auswahl. */
  onSnooze: (bestellungId: string, untilIso: string, label: string) => void;
  /** Defer-Toggle. */
  onDefer: (bestellungId: string, deferred: boolean) => void;
  /**
   * 09.06.2026 — Zuordnungs-Liste für das ActionMenu-„Zuordnen…"-Submenü
   * jeder Pool-Card. Optional gehalten damit alte Caller weiterhin gehen.
   */
  alleBesteller?: Array<{ kuerzel: string; name: string; rolle?: string }>;
}

export function PoolInbox({
  bestellungen,
  vendorDomainById = {},
  haendlerIdByBestellungId = {},
  userStateById = {},
  initialReservations = {},
  selfKuerzel,
  scoreWeights,
  vendorAffinity = {},
  projektAffinity = {},
  scoreTopXThreshold = 0.8,
  isAutoClaimedById = {},
  onOpenDrawer,
  onSnooze,
  onDefer,
  alleBesteller = [],
}: PoolInboxProps) {
  const reservationMap = usePoolReservationsRealtime(initialReservations);

  // Initial unread-Set für Seen-Tracker
  const initialUnreadIds = useMemo(
    () =>
      bestellungen
        .filter((b) => !userStateById[b.id]?.seen)
        .map((b) => b.id),
    [bestellungen, userStateById],
  );

  const seen = usePoolSeenTracker({ initialUnread: initialUnreadIds });

  // 03.06.2026 (Pool 2.0 Sprint 3) — Score-Map einmalig berechnen
  // (Pure Math; bei ~100 Items <1ms).
  const scoreById = useMemo(() => {
    const map: Record<string, ScoreBreakdown> = {};
    for (const b of bestellungen) {
      map[b.id] = computeScore(
        {
          created_at: b.created_at,
          vorschlag_konfidenz: b.vorschlag_konfidenz ?? null,
          mahnung_am: b.mahnung_am,
          mahnung_count: b.mahnung_count ?? null,
          faelligkeitsdatum: b.faelligkeitsdatum ?? null,
          haendler_id: haendlerIdByBestellungId[b.id] ?? null,
          projekt_id: b.projekt_id,
        },
        {
          weights: scoreWeights,
          vendorAffinity,
          projektAffinity,
        },
      );
    }
    return map;
  }, [bestellungen, haendlerIdByBestellungId, scoreWeights, vendorAffinity, projektAffinity]);

  // Card-Sort: deferred ans Ende, sonst nach Score absteigend.
  // Deferred-Items behalten ihren Score (für Hover-Tooltip), rutschen aber
  // optisch ans Ende — bewusste UX: User hat das Item explizit deprioritisiert.
  const sortedBestellungen = useMemo(() => {
    const arr = [...bestellungen];
    arr.sort((a, b) => {
      const aDef = userStateById[a.id]?.deferred ?? false;
      const bDef = userStateById[b.id]?.deferred ?? false;
      if (aDef !== bDef) return aDef ? 1 : -1;
      const aScore = scoreById[a.id]?.total ?? 0;
      const bScore = scoreById[b.id]?.total ?? 0;
      return bScore - aScore;
    });
    return arr;
  }, [bestellungen, userStateById, scoreById]);

  // Snooze-Optionen werden bei jedem Render frisch berechnet (relativ zu now)
  const snoozeOptions = useMemo(() => smartSnoozeOptions(), []);

  return (
    <div className="space-y-2">
      {sortedBestellungen.map((b) => (
        <PoolInboxCard
          key={b.id}
          b={b}
          domain={vendorDomainById[b.id] ?? null}
          isUnread={!seen.isSeen(b.id)}
          isDeferred={userStateById[b.id]?.deferred ?? false}
          reservation={reservationMap[b.id] ?? null}
          selfKuerzel={selfKuerzel}
          score={scoreById[b.id]}
          scoreTopXThreshold={scoreTopXThreshold}
          isAutoClaimed={!!isAutoClaimedById[b.id]}
          registerSeen={seen.register}
          onOpenDrawer={onOpenDrawer}
          onSnooze={onSnooze}
          onDefer={onDefer}
          snoozeOptions={snoozeOptions}
          alleBesteller={alleBesteller}
        />
      ))}
      {sortedBestellungen.length === 0 && (
        <div className="text-center text-foreground-subtle text-body-sm py-10">
          Pool ist leer. Sobald eine Material-Mail ankommt, taucht sie hier auf.
        </div>
      )}
    </div>
  );
}

interface PoolInboxCardProps {
  b: Bestellung;
  domain: string | null;
  isUnread: boolean;
  isDeferred: boolean;
  reservation: { user_kuerzel: string; user_name: string; expires_at: string } | null;
  selfKuerzel: string;
  score?: ScoreBreakdown;
  scoreTopXThreshold: number;
  isAutoClaimed: boolean;
  registerSeen: (id: string, el: HTMLElement | null) => void;
  onOpenDrawer: (bestellungId: string) => void;
  onSnooze: (bestellungId: string, untilIso: string, label: string) => void;
  onDefer: (bestellungId: string, deferred: boolean) => void;
  snoozeOptions: ReadonlyArray<{ key: string; label: string; until: string }>;
  /** 09.06.2026 — Besteller-Liste für Zuordnen-Submenü. */
  alleBesteller: Array<{ kuerzel: string; name: string; rolle?: string }>;
}

function PoolInboxCard({
  b,
  domain,
  isUnread,
  isDeferred,
  reservation,
  selfKuerzel,
  score,
  scoreTopXThreshold,
  isAutoClaimed,
  registerSeen,
  onOpenDrawer,
  onSnooze,
  onDefer,
  snoozeOptions,
  alleBesteller,
}: PoolInboxCardProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const setArticleRef = useCallback(
    (el: HTMLElement | null) => {
      articleRef.current = el;
      registerSeen(b.id, el);
    },
    [b.id, registerSeen],
  );

  const hd = haendlerDisplay(b.haendler_name);
  const ageDays = ageInDays(b.created_at);
  const wash = agingWashFromCreatedAt(b.created_at);
  const isOwnReserve = reservation?.user_kuerzel === selfKuerzel;
  const showOtherReserve = !!reservation && !isOwnReserve;
  // 03.06.2026 — Mahnung-Display via lib/mahnung-display (Single-Source-of-Truth).
  const hasMahnung = shouldShowMahnung(b);
  const mahnungCountUI = effectiveMahnungCount(b);
  const mahnungLabel = hasMahnung
    ? `Mahnung${mahnungCountUI > 1 ? ` ${mahnungCountUI}. Stufe` : ""}${b.mahnung_am ? ` seit ${describeAge(ageInDays(b.mahnung_am))}` : ""}`
    : null;

  // 09.06.2026 — Per-Card Zuordnungs-State.
  const router = useRouter();
  const { toast } = useToast();
  const [confirmTarget, setConfirmTarget] = useState<AssignableBestellerOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const zuordnenOptions = useMemo(
    () => getAssignableBesteller(alleBesteller, b.besteller_kuerzel ?? null, selfKuerzel),
    [alleBesteller, b.besteller_kuerzel, selfKuerzel],
  );

  async function submitZuordnung(opt: AssignableBestellerOption) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bestellungen/zuordnen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bestellung_id: b.id,
          besteller_kuerzel: opt.kuerzel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success(
          opt.isGemeinschaft
            ? "In Gemeinschaft zurückgegeben"
            : `An ${opt.kuerzel} (${opt.name}) zugeordnet`,
        );
        router.refresh();
      } else {
        toast.error("Zuordnung fehlgeschlagen", {
          description: data.error ?? "Bitte erneut versuchen.",
        });
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSubmitting(false);
      setConfirmTarget(null);
    }
  }

  const menuItems: ActionMenuItem[] = [
    // Zuordnen — pro Besteller eigenes Item (ActionMenu unterstützt keine
    // Submenüs; flach mit Präfix ist die einfachste Lösung).
    ...zuordnenOptions.map((opt) => ({
      label: opt.isGemeinschaft
        ? "Zurück in Gemeinschaft"
        : `Zuordnen an ${opt.kuerzel} (${opt.name})`,
      onSelect: () => setConfirmTarget(opt),
    })),
    ...snoozeOptions.map((opt) => ({
      label: `Snooze: ${opt.label}`,
      onSelect: () => onSnooze(b.id, opt.until, opt.label),
    })),
    {
      label: isDeferred ? "Defer aufheben" : "Nicht heute",
      onSelect: () => onDefer(b.id, !isDeferred),
    },
  ];

  return (
    <article
      ref={setArticleRef}
      data-bestellung-id={b.id}
      onClick={(e) => {
        // Cmd/Shift/Middle-Click → klassische Navigation via Link
        if (e.metaKey || e.shiftKey || e.ctrlKey) return;
        onOpenDrawer(b.id);
      }}
      className={cn(
        "relative group cursor-pointer rounded-lg border border-line bg-surface overflow-hidden",
        "transition-[transform,box-shadow,background-color] duration-150 ease-out",
        "hover:shadow-card hover:border-line-strong hover:-translate-y-px",
        isDeferred && "opacity-65",
        wash,
      )}
    >
      {/* Read-Dot (Stufe 3, subtle): zeigt unseen-State. */}
      {isUnread && (
        <span
          aria-label="Neu im Pool"
          title="Du hast dieses Item noch nicht gesehen."
          className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-brand z-10"
        />
      )}

      {/* Mahnung-Banner (Stufe 1, laut): full-width Strip über dem Hero
          statt Pill in der Headline. Drei-Sprachen-Disziplin v2 — max 1
          Stufe-1-Element pro Card, und Mahnung verdrängt Status. */}
      {hasMahnung && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-status-abweichung/30 bg-status-abweichung-bg px-4 py-1.5 text-meta text-status-abweichung-text"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5 shrink-0"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm.75 4a.75.75 0 00-1.5 0V11a.75.75 0 001.5 0V5.5zm0 8.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-semibold uppercase tracking-[0.14em] text-eyebrow">
            {mahnungLabel}
          </span>
        </div>
      )}

      <div className="flex items-start gap-3 p-3.5 pl-5">
        <VendorFavicon
          domain={domain}
          name={hd.name}
          size={44}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0">
          {/* Hero-Headline: Vendor-Name in editorial Display-Schrift.
              Drei-Sprachen-Disziplin v2: Vendor ist der visuelle Anker,
              nicht die Bestellnr — sie ist Sub-Line. */}
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-headline text-lead leading-tight text-foreground truncate">
              {hd.name}
              {hd.isUnsicher && (
                <span
                  aria-hidden="true"
                  title="Pipeline hat den Lieferanten nicht eindeutig erkannt."
                  className="ml-2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-warning-bg text-warning text-eyebrow font-bold font-mono-amount align-middle"
                >
                  ?
                </span>
              )}
            </h3>
          </div>

          {/* Sub-Line: Bestellnr (mono) + Alter + Projekt. Bestellnr ist
              Identitäts-Detail, nicht Hero — daher kleiner als der Vendor. */}
          <div className="mt-0.5 flex items-center gap-2 text-meta text-foreground-muted">
            <Link
              href={`/bestellungen/${b.id}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="font-mono-amount font-medium text-brand/90 hover:text-brand transition-colors truncate"
            >
              {displayBestellnummer(b)}
            </Link>
            <span aria-hidden="true">·</span>
            <span title={`Im Pool ${describeAge(ageDays)}`}>{describeAge(ageDays)}</span>
            {b.projekt_name && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{b.projekt_name}</span>
              </>
            )}
          </div>

          {/* Owner/Vorschlag + Reserve Row (Stufe 2, max 2 Elemente):
              Identitätssprache wer kümmert sich. Status-Pill und
              Doku-Strip kommen darunter. */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <BestellerCell
              besteller_kuerzel={b.besteller_kuerzel}
              besteller_name={b.besteller_name}
              bestellungsart={b.bestellungsart}
              vorschlag_kuerzel={b.vorschlag_kuerzel ?? null}
              vorschlag_konfidenz={b.vorschlag_konfidenz ?? null}
              isAutoClaimed={isAutoClaimed}
              variant="pill-only"
            />
            {showOtherReserve && reservation && (
              <ReserveBadge
                reserverKuerzel={reservation.user_kuerzel}
                reserverName={reservation.user_name}
                expiresAtIso={reservation.expires_at}
                variant="other"
              />
            )}
            {/* Stufe-3-Elemente: Score-Pin + Deferred-Hinweis. */}
            {score && (
              <ScoreBadge score={score} threshold={scoreTopXThreshold} />
            )}
            {isDeferred && (
              <span className="text-meta italic text-foreground-subtle">Nicht heute</span>
            )}
          </div>

          {/* Status-Row (Stufe 1 wenn keine Mahnung, sonst Stufe-3):
              Doku-Strip links, StatusCell rechts. Wenn Mahnung-Banner
              oben aktiv ist, wird die StatusCell visuell zurückgenommen
              (kein doppeltes "laut"). */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <DokumenteCell
              hat_bestellbestaetigung={b.hat_bestellbestaetigung}
              hat_lieferschein={b.hat_lieferschein}
              hat_rechnung={b.hat_rechnung}
              hat_versandbestaetigung={b.hat_versandbestaetigung}
              bestellungsart={b.bestellungsart}
            />
            {!hasMahnung && (
              <StatusCell status={b.status} istGutschrift={b.ist_gutschrift} />
            )}
          </div>
        </div>

        {/* Hero-Betrag + ActionMenu */}
        <div
          className="text-right shrink-0 flex flex-col items-end gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-mono-amount text-h2 font-semibold text-foreground tabular-nums leading-tight">
            <BetragCell
              betrag={b.betrag}
              waehrung={b.waehrung}
              istNetto={b.betrag_ist_netto}
              istGutschrift={b.ist_gutschrift}
            />
          </div>
          <ActionMenu items={menuItems} label="Pool-Item-Aktionen" />
        </div>
      </div>
      {/* 09.06.2026 — Confirm-Modal für Zuordnung. Rendert außerhalb des
          Card-Inhalts; Modal portalt sich selbst. */}
      <Modal
        open={!!confirmTarget}
        onClose={() => !submitting && setConfirmTarget(null)}
        size="sm"
        variant="default"
        title={
          confirmTarget?.isGemeinschaft
            ? "In Gemeinschaft zurückgeben?"
            : "Zuordnen?"
        }
        footer={
          confirmTarget ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={submitting}
                data-modal-cancel
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                onClick={() => confirmTarget && submitZuordnung(confirmTarget)}
              >
                {submitting
                  ? "Speichere…"
                  : buildZuordnungActionLabel(confirmTarget.kuerzel)}
              </Button>
            </>
          ) : null
        }
      >
        {confirmTarget && (
          <p className="text-body-sm text-foreground-muted">
            {buildZuordnungConfirmText(confirmTarget.kuerzel, confirmTarget.name, 1)}
          </p>
        )}
      </Modal>
    </article>
  );
}
