"use client";

/**
 * PoolQuickDrawer — Spatial-Continuity-Container für Pool-Items.
 *
 * 03.06.2026 (Pool 2.0 Sprint 1): Click auf eine Pool-Card öffnet diesen
 * Drawer als 60% Desktop-Slide oder 90dvh Mobile-Bottom-Sheet. Detail-
 * Page wird nur über "Volldetail öffnen" angesteuert. Triage-Flow ohne
 * State-Loss zwischen Pool-Liste und Item-Werkzeugen.
 *
 * Inhalte Sprint 1:
 *   1. Hero — VendorFavicon + Bestellnummer + Händler + Betrag + Status
 *   2. OwnerLane (reused 1:1) — Claim / Reassign / Return / Presence
 *   3. Doku-Status-Strip (B / L / R / V Mini-Icons)
 *   4. Volldetail-Link
 *
 * Inhalte Sprint 2+: PDF-Tab (lazy iframe), Snooze, Defer, Auto-Reserve-
 * Hook (use-pool-reservation), Comments-Peek, Timeline-Peek.
 */

import Link from "next/link";
import { Drawer } from "@/components/ui";
import { Badge } from "@/components/ui";
import { VendorFavicon } from "@/components/ui/cells/vendor-favicon";
import { ReserveBadge } from "@/components/ui/cells/reserve-badge";
import { StatusCell } from "@/components/ui/cells/status-cell";
import { BetragCell } from "@/components/ui/cells/betrag-cell";
import { DokumenteCell } from "@/components/ui/cells/dokumente-cell";
import { OwnerLane, type BestellerOption } from "@/app/(dashboard)/bestellungen/[id]/_components/owner-lane";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { haendlerDisplay } from "@/lib/haendler-display";
import { usePoolReservation } from "@/lib/hooks/use-pool-reservation";
import type { Bestellung } from "./types";

export interface PoolQuickDrawerProps {
  open: boolean;
  onClose: () => void;
  bestellung: Bestellung | null;
  haendlerDomain?: string | null;
  profil: { kuerzel: string; rolle: string; name: string };
  bestellerOptions?: BestellerOption[];
}

export function PoolQuickDrawer({
  open,
  onClose,
  bestellung,
  haendlerDomain,
  profil,
  bestellerOptions,
}: PoolQuickDrawerProps) {
  // 03.06.2026 (Pool 2.0 Sprint 2) — Auto-Reserve sobald der Drawer 1.5s
  // stabil offen ist. Hook handelt Refresh alle 4min + Release beim
  // Schließen + sendBeacon bei Tab-Close. Auch wenn die Bestellung null
  // ist (kurzes Skelett-Mounting), läuft der Hook sauber durch — er
  // disabled sich selbst dann.
  const isPoolItem = !!bestellung &&
    bestellung.besteller_kuerzel === "UNBEKANNT" &&
    (bestellung.bestellungsart ?? "material") === "material";
  const reservation = usePoolReservation({
    bestellungId: open && bestellung && isPoolItem ? bestellung.id : null,
    enabled: open && isPoolItem,
  });

  // Defensive: wenn der Drawer öffnet bevor die Bestellung gefunden wurde
  // (Race beim ersten Mount), rendern wir das Skelett — vermeidet null-
  // Crashes auf children-Props.
  if (!bestellung) {
    return (
      <Drawer open={open} onClose={onClose} title="Lade…">
        <div className="space-y-3">
          <div className="h-6 w-1/2 bg-canvas rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-canvas rounded animate-pulse" />
          <div className="h-32 w-full bg-canvas rounded animate-pulse" />
        </div>
      </Drawer>
    );
  }

  const hd = haendlerDisplay(bestellung.haendler_name);
  const isPool = isPoolItem;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2.5">
          <VendorFavicon
            domain={haendlerDomain}
            name={hd.name}
            size={36}
          />
          <span className="flex flex-col leading-tight">
            <span className="font-mono-amount text-[16px] text-brand">
              {displayBestellnummer(bestellung)}
            </span>
            <span className="text-[12px] font-sans text-foreground-muted truncate max-w-[260px]">
              {hd.name}
              {hd.isUnsicher && (
                <span
                  aria-hidden="true"
                  title="Pipeline hat den Lieferanten nicht eindeutig erkannt."
                  className="ml-1 inline-flex items-center justify-center h-3 w-3 rounded-full bg-warning-bg text-warning text-[8px] font-bold font-mono-amount align-middle"
                >
                  ?
                </span>
              )}
            </span>
          </span>
        </span>
      }
      titleSlot={
        <div className="hidden sm:flex items-center gap-2 mr-2">
          {isPool && <Badge tone="warning" size="sm">Pool</Badge>}
          <StatusCell status={bestellung.status} istGutschrift={bestellung.ist_gutschrift} />
        </div>
      }
      footer={
        <Link
          href={`/bestellungen/${bestellung.id}`}
          prefetch={false}
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Volldetail öffnen
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5">
            <path d="M5.5 3.5 10 8l-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      }
      bodyClassName="px-5 py-5 space-y-5"
    >
      {/* Reserve-Awareness: zeigt entweder eigene oder fremde Reservation.
          Eigene = leiser Helper-Text ("Du bearbeitest · 9:42 verbleibend").
          Fremde = neutrale Awareness-Pill ("CR bearbeitet · 9:42"). */}
      {reservation.isOwnReservation && reservation.ownExpiresAtIso && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-line-subtle bg-canvas">
          <ReserveBadge
            reserverKuerzel={profil.kuerzel}
            reserverName={profil.name}
            expiresAtIso={reservation.ownExpiresAtIso}
            variant="self"
          />
          <span className="text-[11px] text-foreground-faint">Andere User sehen das.</span>
        </div>
      )}
      {!reservation.isOwnReservation && reservation.otherHolder && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-warning-border bg-warning-bg/40">
          <ReserveBadge
            reserverKuerzel={reservation.otherHolder.kuerzel}
            reserverName={reservation.otherHolder.name}
            expiresAtIso={reservation.otherHolder.expiresAtIso}
            variant="other"
          />
          <span className="text-[11px] text-warning">Übernehmen bleibt erlaubt.</span>
        </div>
      )}

      {/* Hero — Betrag + Mobile-StatusBadges (Desktop-Badges sitzen im titleSlot) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 sm:hidden">
          {isPool && <Badge tone="warning" size="sm">Pool</Badge>}
          <StatusCell status={bestellung.status} istGutschrift={bestellung.ist_gutschrift} />
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-[0.14em] text-foreground-subtle">Betrag</div>
          <div className="font-mono-amount text-2xl font-semibold text-foreground tabular-nums leading-tight">
            <BetragCell
              betrag={bestellung.betrag}
              waehrung={bestellung.waehrung}
              istNetto={bestellung.betrag_ist_netto}
              istGutschrift={bestellung.ist_gutschrift}
            />
          </div>
        </div>
      </div>

      {/* Owner-Lane — Claim / Reassign / Return / Presence */}
      <section aria-label="Besteller-Workflow">
        <OwnerLane
          bestellungId={bestellung.id}
          besteller_kuerzel={bestellung.besteller_kuerzel}
          besteller_name={bestellung.besteller_name}
          bestellungsart={bestellung.bestellungsart}
          status={bestellung.status}
          vorschlag_kuerzel={bestellung.vorschlag_kuerzel ?? null}
          vorschlag_konfidenz={bestellung.vorschlag_konfidenz ?? null}
          istGutschrift={bestellung.ist_gutschrift}
          profil={profil}
          besteller_options={bestellerOptions}
        />
      </section>

      {/* Doku-Status — was ist schon da, was fehlt */}
      <section aria-label="Dokumente">
        <div className="text-[11px] uppercase tracking-[0.14em] text-foreground-subtle mb-2">Dokumente</div>
        <div className="flex items-center gap-2">
          <DokumenteCell
            hat_bestellbestaetigung={bestellung.hat_bestellbestaetigung}
            hat_lieferschein={bestellung.hat_lieferschein}
            hat_rechnung={bestellung.hat_rechnung}
            hat_versandbestaetigung={bestellung.hat_versandbestaetigung}
            bestellungsart={bestellung.bestellungsart}
          />
          <span className="text-[11px] text-foreground-faint">
            B = Bestätigung · L = Lieferschein · R = Rechnung · V = Versand
          </span>
        </div>
      </section>

      {/* Meta */}
      {bestellung.projekt_name && (
        <section aria-label="Projekt">
          <div className="text-[11px] uppercase tracking-[0.14em] text-foreground-subtle mb-1">Projekt</div>
          <div className="text-[13px] text-foreground">{bestellung.projekt_name}</div>
        </section>
      )}
    </Drawer>
  );
}
