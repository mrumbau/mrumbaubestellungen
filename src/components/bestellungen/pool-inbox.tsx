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

import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { StatusCell } from "@/components/ui/cells/status-cell";
import { BetragCell } from "@/components/ui/cells/betrag-cell";
import { DokumenteCell } from "@/components/ui/cells/dokumente-cell";
import { VendorFavicon } from "@/components/ui/cells/vendor-favicon";
import { ReserveBadge } from "@/components/ui/cells/reserve-badge";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { haendlerDisplay } from "@/lib/haendler-display";
import { agingWashFromCreatedAt, ageInDays, describeAge } from "@/lib/pool-utils";
import { smartSnoozeOptions } from "@/lib/pool-inbox-state";
import { usePoolSeenTracker } from "@/lib/hooks/use-pool-seen-tracker";
import { usePoolReservationsRealtime, type ReservationMap } from "@/lib/hooks/use-pool-reservations-realtime";
import { cn } from "@/lib/cn";
import type { Bestellung } from "./types";

export interface PoolInboxProps {
  bestellungen: Bestellung[];
  /** Vendor-Domain-Lookup pro bestellung.id (vom Server vorbereitet). */
  vendorDomainById?: Record<string, string | null>;
  /** Pool-User-State pro bestellung.id (seen + deferred). */
  userStateById?: Record<string, { seen: boolean; deferred: boolean }>;
  /** Initialer Reservations-Snapshot vom Server (Realtime patcht inkrementell). */
  initialReservations?: ReservationMap;
  /** Self-Kürzel um eigene Reservierungen zu erkennen. */
  selfKuerzel: string;
  /** Drawer öffnen. */
  onOpenDrawer: (bestellungId: string) => void;
  /** Snooze-Auswahl. */
  onSnooze: (bestellungId: string, untilIso: string, label: string) => void;
  /** Defer-Toggle. */
  onDefer: (bestellungId: string, deferred: boolean) => void;
}

export function PoolInbox({
  bestellungen,
  vendorDomainById = {},
  userStateById = {},
  initialReservations = {},
  selfKuerzel,
  onOpenDrawer,
  onSnooze,
  onDefer,
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

  // Card-Sort: deferred ans Ende, sonst Server-Reihenfolge
  const sortedBestellungen = useMemo(() => {
    const arr = [...bestellungen];
    arr.sort((a, b) => {
      const aDef = userStateById[a.id]?.deferred ?? false;
      const bDef = userStateById[b.id]?.deferred ?? false;
      if (aDef !== bDef) return aDef ? 1 : -1;
      return 0;
    });
    return arr;
  }, [bestellungen, userStateById]);

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
          registerSeen={seen.register}
          onOpenDrawer={onOpenDrawer}
          onSnooze={onSnooze}
          onDefer={onDefer}
          snoozeOptions={snoozeOptions}
        />
      ))}
      {sortedBestellungen.length === 0 && (
        <div className="text-center text-foreground-subtle text-sm py-10">
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
  registerSeen: (id: string, el: HTMLElement | null) => void;
  onOpenDrawer: (bestellungId: string) => void;
  onSnooze: (bestellungId: string, untilIso: string, label: string) => void;
  onDefer: (bestellungId: string, deferred: boolean) => void;
  snoozeOptions: ReadonlyArray<{ key: string; label: string; until: string }>;
}

function PoolInboxCard({
  b,
  domain,
  isUnread,
  isDeferred,
  reservation,
  selfKuerzel,
  registerSeen,
  onOpenDrawer,
  onSnooze,
  onDefer,
  snoozeOptions,
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

  const menuItems: ActionMenuItem[] = [
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
        "relative group cursor-pointer rounded-lg border border-line bg-surface",
        "transition-[transform,box-shadow,background-color] duration-150 ease-out",
        "hover:shadow-card hover:border-line-strong hover:-translate-y-px",
        isDeferred && "opacity-65",
        wash,
      )}
    >
      {/* Unread-Dot oben links */}
      {isUnread && (
        <span
          aria-label="Neu im Pool"
          title="Du hast dieses Item noch nicht gesehen."
          className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-brand"
        />
      )}

      <div className="flex items-start gap-3 p-3.5 pl-5">
        <VendorFavicon
          domain={domain}
          name={hd.name}
          size={40}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0">
          {/* Headline-Row: Bestellnr + Vorschlag-Pill + Reserve-Awareness */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/bestellungen/${b.id}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 font-mono-amount font-semibold text-brand hover:text-brand-light transition-colors"
            >
              {displayBestellnummer(b)}
            </Link>
            <BestellerCell
              besteller_kuerzel={b.besteller_kuerzel}
              besteller_name={b.besteller_name}
              bestellungsart={b.bestellungsart}
              vorschlag_kuerzel={b.vorschlag_kuerzel ?? null}
              vorschlag_konfidenz={b.vorschlag_konfidenz ?? null}
              variant="pill-only"
            />
            {b.mahnung_am && (
              <Badge tone="error" size="sm">
                Mahnung
              </Badge>
            )}
            {isDeferred && (
              <span className="text-[11px] italic text-foreground-subtle">Nicht heute</span>
            )}
            {showOtherReserve && reservation && (
              <ReserveBadge
                reserverKuerzel={reservation.user_kuerzel}
                reserverName={reservation.user_name}
                expiresAtIso={reservation.expires_at}
                variant="other"
              />
            )}
          </div>

          {/* Händler + Datum-Hint */}
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-foreground-muted">
            <span className="truncate" title={hd.name}>{hd.name}</span>
            {hd.isUnsicher && (
              <span
                aria-hidden="true"
                title="Pipeline hat den Lieferanten nicht eindeutig erkannt."
                className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-warning-bg text-warning text-[8px] font-bold font-mono-amount"
              >
                ?
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span title={`Im Pool ${describeAge(ageDays)}`}>{describeAge(ageDays)}</span>
            {b.projekt_name && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{b.projekt_name}</span>
              </>
            )}
          </div>

          {/* Status-Row: Doku-Strip + StatusCell */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <DokumenteCell
              hat_bestellbestaetigung={b.hat_bestellbestaetigung}
              hat_lieferschein={b.hat_lieferschein}
              hat_rechnung={b.hat_rechnung}
              hat_versandbestaetigung={b.hat_versandbestaetigung}
              bestellungsart={b.bestellungsart}
            />
            <StatusCell status={b.status} istGutschrift={b.ist_gutschrift} />
          </div>
        </div>

        {/* Hero-Betrag + ActionMenu */}
        <div
          className="text-right shrink-0 flex flex-col items-end gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-mono-amount text-xl font-semibold text-foreground tabular-nums leading-tight">
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
    </article>
  );
}
