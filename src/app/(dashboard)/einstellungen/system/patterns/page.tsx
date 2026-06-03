import { PageHero } from "@/components/ui/page-hero";
import { EditorialSection } from "@/components/ui/editorial-section";
import { BestellnummerHero } from "@/components/ui/bestellnummer-hero";
import { PatternsClient } from "./patterns-client";

export const dynamic = "force-dynamic";

/**
 * Patterns-Page — admin-only Design-Sandbox.
 *
 * Sichtbar unter /einstellungen/system/patterns (System-Layout gated auf
 * Admin). Zeigt die Foundation-Primitives in allen Varianten, damit das
 * Vokabular greifbar ist und Drift früh auffällt.
 *
 * Sections:
 *  - Server (hier):   EditorialSection (4 Varianten), BestellnummerHero,
 *                     Type-Scale.
 *  - Client (PatternsClient): LaneNav (UX-R2), OwnerStatement (UX-R3 —
 *                     statische Pfade, da Server-Hooks abhängig),
 *                     SidebarBlock (UX-R3), UnifiedListCard (UX-R4),
 *                     Modal-Variants default/confirm/destructive (UX-R5).
 *
 * Erweitert in späteren Wellen um Drawer-Varianten, Visual-Weight-Stufen
 * (Status/Owner/Reserve/Score), PageHeader, HeroStatCard.
 */
export default async function PatternsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="Admin · Design-Sandbox"
        title="Patterns"
        description="Visuelles Vokabular: Foundation-Primitives, Drei-Sprachen-Disziplin, Modal/Drawer-Varianten. Bricht eine Komponente hier, bricht sie überall."
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Patterns" },
        ]}
        marks
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">EditorialSection</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Foundation-Wrapper für Hot-Path-Sections. Schließt die Lücke zwischen Brand-Surfaces (Login/Landing/404) und innen. Default unauffällig, editorial-Ornamentik per Prop.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <EditorialSection tone="neutral" padding="compact">
            <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle mb-2">
              tone=neutral · minimal
            </div>
            <p className="text-body-sm text-foreground">
              Standard-Surface mit border-line. Settings/System-Pages nutzen das.
            </p>
          </EditorialSection>

          <EditorialSection tone="brand" marks padding="compact">
            <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle mb-2">
              tone=brand · marks
            </div>
            <p className="text-body-sm text-foreground">
              Mit corner-marks. Hot-Path Hero-Cards, Owner-Statement, Editorial-Hooks.
            </p>
          </EditorialSection>

          <EditorialSection tone="neutral" lineTop lineBottom padding="compact">
            <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle mb-2">
              lineTop + lineBottom
            </div>
            <p className="text-body-sm text-foreground">
              industrial-line als Separator oben + unten. Für Hero-Sektionen mit voller Editorial-Hand.
            </p>
          </EditorialSection>

          <EditorialSection tone="brand" marks grain="subtle" padding="compact">
            <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle mb-2">
              brand + marks + grain
            </div>
            <p className="text-body-sm text-foreground">
              Mit film-grain Overlay (6%). Brand-Statement-Heros wie Dashboard-Bento.
            </p>
          </EditorialSection>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">BestellnummerHero</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Display-Numeral für Detail-Page. Macht die Bestellnummer zum Anker statt zu einer von zehn konkurrierenden Pills.
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <BestellnummerHero
            bestellung={{
              id: "1234abcd-ef01-2345-6789-abcdef012345",
              bestellnummer: "PV-08312562937",
              auftragsnummer: null,
              lieferscheinnummer: null,
            }}
            subline="reichelt.de · seit 2 Wochen"
          />
        </EditorialSection>
        <EditorialSection tone="neutral" padding="relaxed">
          <BestellnummerHero
            bestellung={{
              id: "abcd1234-ef01-2345-6789-abcdef012345",
              bestellnummer: null,
              auftragsnummer: null,
              lieferscheinnummer: null,
            }}
            subline="Vendor unbekannt · KI-Pipeline konnte BN nicht extrahieren"
          />
        </EditorialSection>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-h2 text-foreground">Type-Scale (semantisch)</h2>
        <p className="text-body-sm text-foreground-muted max-w-2xl">
          Sieben kanonische Stufen aus globals.css. Tailwind-Defaults (text-xs/sm/lg/xl/2xl) wurden via Codemod migriert.
        </p>
        <EditorialSection tone="neutral" padding="relaxed">
          <div className="flex flex-col gap-3">
            <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
              text-eyebrow · 10px · All-Caps
            </div>
            <div className="text-meta text-foreground-muted">
              text-meta · 12px · Pills, Captions
            </div>
            <div className="text-body-sm text-foreground">
              text-body-sm · 14px · Default UI-Body
            </div>
            <div className="text-body text-foreground">
              text-body · 16px · Reading-Body
            </div>
            <div className="text-lead text-foreground">
              text-lead · 18px · Lead-Absätze
            </div>
            <div className="text-h2 font-headline text-foreground">
              text-h2 · 24px · Section-Titles
            </div>
            <div className="text-h1 font-headline text-foreground">
              text-h1 · 28px · Page-Titles
            </div>
            <div className="text-display-section font-headline text-foreground">
              text-display-section · clamp(28, 4vw, 40) · PageHero
            </div>
            <div className="text-display-numeral font-headline text-foreground tabular-nums">
              text-display-numeral · clamp(36, 5vw, 64) · BestellnummerHero
            </div>
          </div>
        </EditorialSection>
      </section>

      <PatternsClient />
    </div>
  );
}
