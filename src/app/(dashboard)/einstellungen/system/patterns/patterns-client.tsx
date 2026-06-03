"use client";

/**
 * PatternsClient — Client-Demos für die Patterns-Sandbox (UX-R2–R5).
 *
 * Hostet Modal-State, LaneNav-Live-Render (usePathname-Hook) und die
 * Modal-Variants-Demo (default / confirm / destructive). Server-Sections
 * (Type-Scale, EditorialSection, BestellnummerHero, statische Owner-
 * Statement-Screenshots) bleiben im page.tsx Server-Component, damit das
 * Sandbox-Bundle so klein wie möglich bleibt.
 */

import { useState } from "react";
import { EditorialSection } from "@/components/ui/editorial-section";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { LaneNav } from "@/components/bestellungen/lane-nav";
import { UnifiedListCard } from "@/components/ui/unified-list-card";
import { SidebarBlock } from "@/app/(dashboard)/bestellungen/[id]/_components/sidebar-block";

export function PatternsClient() {
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const [confirmKommentar, setConfirmKommentar] = useState("");

  return (
    <>
      {/* ─── UX-R2 · LaneNav ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">LaneNav (UX-R2)</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Drei Lanes ersetzen die alte 4-Tab-Scope-Architektur. Underline-Style,
          Sub-Label statt nackter Counts, Magnetic-Hover. Aktive Lane wird via{" "}
          <code className="font-mono text-meta">usePathname()</code> ermittelt —
          in der Sandbox keine echte Aktivierung, da Route{" "}
          <code className="font-mono text-meta">/einstellungen/system/patterns</code>{" "}
          keinen Lane-Match ergibt (default = Pool).
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <div
            aria-disabled="true"
            className="pointer-events-none select-none"
            title="Demo — Navigation deaktiviert"
          >
            <LaneNav counts={{ pool: 13, "in-arbeit": 48, archiv: 137 }} />
          </div>
          <p className="text-meta text-foreground-faint mt-4">
            Mock-Counts: <code className="font-mono">pool 13 · in-arbeit 48 · archiv 137</code>.
            Sub-Label rendert{" "}
            <code className="font-mono">subLabelFor(count)</code> aus{" "}
            <code className="font-mono">lane-config.ts</code>.
          </p>
        </EditorialSection>
      </section>

      {/* ─── UX-R3 · OwnerStatement (statische Render-Pfade) ───────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">
          OwnerStatement (UX-R3)
        </h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Drei Render-Pfade des Editorial-Statement-Blocks aus der Detail-Akte.
          Server-only Server-Hooks (Realtime-Presence, Pool-Action-Fetch) machen
          ein Live-Mount in der Sandbox unverhältnismäßig — daher statische
          Repräsentationen. Live-Komponente:{" "}
          <code className="font-mono text-meta">
            app/(dashboard)/bestellungen/[id]/_components/owner-statement.tsx
          </code>
          .
        </p>

        {/* Pfad 1 — Pool / Vorschlag */}
        <div className="mt-2 relative rounded-md border border-dashed border-line-strong bg-canvas">
          <div className="industrial-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle mb-1">
                Pfad 1 · Pool / Vorschlag
              </div>
              <p className="text-body-sm text-foreground">
                <span className="font-medium">Im Pool</span>
                <span className="mx-1.5 text-foreground-faint">·</span>
                <span className="text-foreground-muted">
                  Pipeline schlägt MT vor{" "}
                  <span className="font-mono-amount text-foreground-subtle">(72 %)</span>
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-body-sm opacity-60 cursor-not-allowed"
            >
              Übernehmen
            </button>
          </div>
        </div>

        {/* Pfad 2 — Owned */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md bg-canvas">
          <div className="flex-1 min-w-0">
            <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle mb-1">
              Pfad 2 · Owned
            </div>
            <p className="text-body-sm text-foreground">
              <span className="font-medium">MT</span>{" "}
              <span className="text-foreground-muted">hat diese Bestellung übernommen.</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-line bg-transparent text-foreground-muted text-meta opacity-60 cursor-not-allowed"
            >
              Übertragen
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-line bg-transparent text-foreground-muted text-meta opacity-60 cursor-not-allowed"
            >
              Zurück in Pool
            </button>
          </div>
        </div>

        {/* Pfad 3 — Auto-Claim-Grace */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-md border border-line-strong bg-canvas text-meta">
          <div className="flex-1 min-w-0">
            <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle mb-1">
              Pfad 3 · Auto-Claim · 24h-Grace
            </div>
            <span className="text-foreground-muted">
              <span className="font-medium text-foreground">Auto-übernommen</span>{" "}
              <span className="text-foreground-subtle">via vendor_affinity</span>
              <span className="ml-1 font-mono-amount text-foreground-subtle">· 91 %</span>
              <span className="ml-2 text-foreground-faint">— 24h-Korrekturfenster aktiv</span>
            </span>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-surface text-foreground opacity-60 cursor-not-allowed"
          >
            Falsch — zurück in Pool
          </button>
        </div>

        <p className="text-meta text-foreground-faint mt-3">
          Static demo — siehe DESIGN.md (UX-R3 · OwnerStatement).
        </p>
      </section>

      {/* ─── UX-R3 · SidebarBlock ──────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">SidebarBlock (UX-R3)</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Aus 7 stacked Accordion-Panels werden 3 visuelle Gruppen mit
          Eyebrow-Title als visueller Anker. Spacing zwischen Blocks (
          <code className="font-mono text-meta">gap-6</code>) ist absichtlich
          größer als zwischen Children (<code className="font-mono text-meta">gap-3</code>).
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <div className="flex flex-col gap-6">
            <SidebarBlock title="Aktion" description="Primärer CTA + Verwerfen-Ghost.">
              <div className="rounded-md border border-line bg-surface p-3 text-body-sm text-foreground">
                ApprovalPanel · primärer CTA (Demo-Child)
              </div>
              <div className="rounded-md border border-line-subtle bg-canvas p-3 text-meta text-foreground-muted">
                Verwerfen · Ghost-Action (Demo-Child)
              </div>
            </SidebarBlock>
            <SidebarBlock title="Meta" description="Bestellungsart, Projekt, Vendor.">
              <div className="rounded-md border border-line bg-surface p-3 text-body-sm text-foreground">
                Bestellungsart · Material (Demo-Child)
              </div>
              <div className="rounded-md border border-line bg-surface p-3 text-body-sm text-foreground">
                Projekt · BV-2026-014 Sanierung Müllerstraße (Demo-Child)
              </div>
              <div className="rounded-md border border-line bg-surface p-3 text-body-sm text-foreground">
                Vendor · Bauhaus GmbH (Demo-Child)
              </div>
            </SidebarBlock>
            <SidebarBlock title="Aktivität" description="Timeline, Kommentare, KI-Tools.">
              <div className="rounded-md border border-line-subtle bg-canvas p-3 text-meta text-foreground-muted">
                Timeline · 4 Events (Demo-Child)
              </div>
              <div className="rounded-md border border-line-subtle bg-canvas p-3 text-meta text-foreground-muted">
                Kommentare · 2 (Demo-Child)
              </div>
            </SidebarBlock>
          </div>
        </EditorialSection>
      </section>

      {/* ─── UX-R4 · UnifiedListCard ───────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">
          UnifiedListCard (UX-R4)
        </h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Drei Variants standardisieren die Surface über Pool-Inbox,
          Stammdaten-Listen und DataTable-Rows. Active- und Deferred-States
          variant-übergreifend harmonisiert.
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <div className="grid gap-4 md:grid-cols-3">
            {/* vendor-strip */}
            <div className="flex flex-col gap-2">
              <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle">
                vendor-strip
              </div>
              <UnifiedListCard variant="vendor-strip" isActive>
                <div className="p-4 flex flex-col gap-2">
                  <div className="text-meta text-foreground-muted">Bauhaus GmbH</div>
                  <div className="font-headline text-body text-foreground">
                    PV-08312562937
                  </div>
                  <div className="text-meta text-foreground-faint">
                    isActive · ring-1 ring-brand/40
                  </div>
                </div>
              </UnifiedListCard>
              <UnifiedListCard variant="vendor-strip" isDeferred>
                <div className="p-4 flex flex-col gap-2">
                  <div className="text-meta text-foreground-muted">Reichelt elektronik</div>
                  <div className="font-headline text-body text-foreground">
                    R-2026-9134
                  </div>
                  <div className="text-meta text-foreground-faint">
                    isDeferred · opacity-65
                  </div>
                </div>
              </UnifiedListCard>
            </div>

            {/* title-strip */}
            <div className="flex flex-col gap-2">
              <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle">
                title-strip
              </div>
              <UnifiedListCard variant="title-strip" isActive>
                <div className="p-3 flex flex-col gap-1">
                  <div className="text-body-sm font-medium text-foreground">
                    BV-2026-014 Sanierung Müllerstraße
                  </div>
                  <div className="text-meta text-foreground-muted">
                    aktiv · 12 Bestellungen
                  </div>
                </div>
              </UnifiedListCard>
              <UnifiedListCard variant="title-strip">
                <div className="p-3 flex flex-col gap-1">
                  <div className="text-body-sm font-medium text-foreground">
                    Kunde · Berliner Wohnungsbau GmbH
                  </div>
                  <div className="text-meta text-foreground-muted">
                    3 aktive Projekte
                  </div>
                </div>
              </UnifiedListCard>
            </div>

            {/* table-row */}
            <div className="flex flex-col gap-2">
              <div className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle">
                table-row
              </div>
              <div className="border border-line-subtle rounded-md overflow-hidden divide-y divide-line-subtle">
                <UnifiedListCard variant="table-row" isActive>
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-body-sm text-foreground">PV-08312562937</span>
                    <span className="text-meta text-foreground-muted">isActive</span>
                  </div>
                </UnifiedListCard>
                <UnifiedListCard variant="table-row">
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-body-sm text-foreground">R-2026-9134</span>
                    <span className="text-meta text-foreground-muted">hover-Tint</span>
                  </div>
                </UnifiedListCard>
                <UnifiedListCard variant="table-row" isDeferred>
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-body-sm text-foreground">BR-12489</span>
                    <span className="text-meta text-foreground-muted">isDeferred</span>
                  </div>
                </UnifiedListCard>
              </div>
            </div>
          </div>
        </EditorialSection>
      </section>

      {/* ─── UX-R5 · Modal-Variants ────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">Modal-Variants (UX-R5)</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Drei Variants konsolidieren die alten ad-hoc-Modals.{" "}
          <code className="font-mono text-meta">default</code> = neutrale Shell.{" "}
          <code className="font-mono text-meta">confirm</code> = optionales
          Kommentarfeld via{" "}
          <code className="font-mono text-meta">commentLabel</code>.{" "}
          <code className="font-mono text-meta">destructive</code> = ENTER-Safety,
          Autofocus auf <code className="font-mono text-meta">[data-modal-cancel]</code>,
          Primary-CTA wird visuell zu brand-error.
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => setDefaultOpen(true)}>
              Open default
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              Open confirm
            </Button>
            <Button variant="destructive" onClick={() => setDestructiveOpen(true)}>
              Open destructive
            </Button>
          </div>
        </EditorialSection>

        <Modal
          open={defaultOpen}
          onClose={() => setDefaultOpen(false)}
          variant="default"
          size="md"
          title="Default-Modal"
          description="Neutrale strukturelle Shell für Form-Flows ohne destruktiven oder Bestätigungs-Charakter."
          footer={
            <>
              <Button
                variant="secondary"
                data-modal-cancel
                onClick={() => setDefaultOpen(false)}
              >
                Abbrechen
              </Button>
              <Button variant="primary" onClick={() => setDefaultOpen(false)}>
                Speichern
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-foreground-muted">
            Body-Slot · Caller bestimmt den Inhalt. Footer kommt aus dem{" "}
            <code className="font-mono">footer</code>-Prop, nicht aus dem Body.
          </p>
        </Modal>

        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          variant="confirm"
          size="md"
          title="Bestätigen"
          description="Variant 'confirm' rendert ein Kommentarfeld oberhalb der Children, wenn commentLabel gesetzt ist. State bleibt beim Caller."
          commentLabel="Hinweis (optional)"
          commentPlaceholder="z. B. Kontext für den Audit-Trail."
          commentValue={confirmKommentar}
          onCommentChange={setConfirmKommentar}
          commentMaxLength={500}
          footer={
            <>
              <Button
                variant="secondary"
                data-modal-cancel
                onClick={() => setConfirmOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmKommentar("");
                  setConfirmOpen(false);
                }}
              >
                Bestätigen
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-foreground-muted">
            Kommentarfeld wird im Audit-Trail gespeichert. Children stehen
            darunter — typisch ein kurzer Erklärungstext für die Auswirkung.
          </p>
        </Modal>

        <Modal
          open={destructiveOpen}
          onClose={() => setDestructiveOpen(false)}
          variant="destructive"
          size="sm"
          title="Wirklich löschen?"
          description="Die Aktion ist nicht rückgängig zu machen. Autofocus liegt auf Abbrechen, ENTER feuert nicht den primären CTA."
          footer={
            <>
              <Button
                variant="secondary"
                data-modal-cancel
                onClick={() => setDestructiveOpen(false)}
              >
                Abbrechen
              </Button>
              <Button variant="primary" onClick={() => setDestructiveOpen(false)}>
                Endgültig löschen
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-foreground-muted">
            Footer-Wrapper repainted den{" "}
            <code className="font-mono">.btn-primary</code> zu{" "}
            <code className="font-mono">bg-error</code>, damit Intent und Stil
            zusammenpassen — ohne dass der Aufrufer die Variant ändern muss.
          </p>
        </Modal>
      </section>
    </>
  );
}
