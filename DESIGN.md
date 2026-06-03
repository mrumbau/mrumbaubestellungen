# Design System — MR Umbau Bestellmanagement

> "Linear meets Handwerk-Industrie" — präzises Tool-Design mit industriellem Material-Bewusstsein.

## Changelog

- **v2 (03.06.2026, UX-R1 → UX-R6):** Editorial-Industrial-Versprechen vom Login zieht ins Innere. Neue Foundation-Primitives `EditorialSection` + `PageHero` + `BestellnummerHero`. Drei-Sprachen-Disziplin verschärft um Visual-Weight-Stufen 1-3 — max 1 lautes Element pro Card. Aging-Wash auf Tokens (`bg-aging-stale`, `bg-aging-rotting`) statt Tailwind-Defaults. Type-Scale-Migration via Codemod (270 Stellen). Plan: `.claude/plans/noble-sparking-stallman.md`. Sections 3-6 (Detail-Page, Modal/Drawer-Heuristik, CTA-Hierarchie) folgen in Welle 3+5+6.
- **UX-R2 (03.06.2026):** Posteingang mit Lanes statt 4 Owner-Tabs. `/bestellungen/pool`, `/in-arbeit`, `/archiv` mit gemeinsamem Workspace-Layout. Quick-Filter-Chips für Art statt ArtTabs. Layout-Toggle entfernt (Lane bestimmt DNA). Pool-Card refactored: Mahnung als Stufe-1 Banner, Vendor als Hero-Headline. Cmd+K Cross-Lane-Search Foundation.
- **UX-R3 (03.06.2026):** Detail-Page als editoriale Akte. `BestellnummerHero` als Display-Numeral im PageHero-Wrap. Mahnung als full-width Banner statt Pill. `OwnerStatement` ersetzt `OwnerLane` (3 Render-Pfade mit editorial-DNA, Magnetic-CTA für Pool/Vorschlag). Sidebar 7 Cards → 3 Blöcke (Aktion / Meta / Aktivität). CTA-Hierarchie verschärft: Verwerfen = ghost destructive durch industrial-line getrennt, Mahnung quittieren = secondary.

## Color Strategy

**Restrained mit ausgewählten Brand-Momenten.**

- 95% tinted Neutrals (`#fafaf9` Canvas, `#ffffff` Surface, `#141414` Sidebar)
- MR-Red `#570006` als Brand-Anker — Identität, nicht Flächen-Werkzeug. Erscheint in:
  - Logo, Hover-Indikator (3px Left-Bar in Tabellen-Rows)
  - Primary CTAs (Freigeben)
  - Focus-Ring (`rgba(87, 0, 6, 0.18)`)
  - Hero-Card-Borders im Bento-Dashboard
- Status-Farbsystem (6 Tokens × 3-Part-Triplet): semantische Workflow-Farben (Blau Offen, Grün Vollständig, Rot Abweichung, Gelb LS-Fehlt, Smaragd Freigegeben, Grau Erwartet). Diese sind FUNKTIONAL nicht dekorativ.
- Bestellungsart-Sub-Brand (3 × 3-Part): Cyan für Subunternehmer, Violett für Abo, neutral für Material.
- CardScan-Sub-Brand: Emerald `#10b981` (eigene Identität, eigenes Modul).

**Anti-Pattern:** Niemals MR-Red als großflächiger Background. Brand erscheint nur bei Interaktion/Akzent.

## Theme

**Light only.** Bauliches Büro mit Tageslicht, 4-Personen-Team mit klassischer Buchhaltungs-Mentalität (NJ erwartet helle Listen wie DATEV). Sidebar ist dunkel als bewusster Kontrast — sie ist Navigations-Anker, nicht Content-Fläche.

**Inverse-Sidebar:** `#141414` (true charcoal, nicht reines Schwarz) mit weißem Logo + `text-white/50` Nav-Items. Active-State über 3px-Brand-Bar links + `bg-white/[0.07]` + font-medium.

## Typography

**Font-Stack:**
- **Display:** Barlow Condensed (`--font-headline`) — Headlines, PageHeader-Titles. Industriell, kondensiert, Bau-Branchen-Anmutung.
- **Body:** DM Sans (`--font-sans`) — Default. Klare, neutrale Geometric-Sans für Listen, Forms, Body-Text.
- **Mono:** JetBrains Mono (`--font-mono-amount`) — Beträge, IDs, Tabellen-Numbers mit `tabular-nums`.

**Type-Scale (7 kanonische Stufen, DESIGN-Critique #2):**

| Token | Größe | Klasse | Einsatz |
|---|---|---|---|
| eyebrow | 10px | `text-[10px]` / `.text-eyebrow` | All-Caps Labels, Eyebrow-Pattern |
| meta | 12px | `text-[12px]` / `.text-meta` | Pills, Captions, Helper-Text, Status-Tags |
| body-sm | 14px | `text-sm` / `.text-body-sm` | DataTable, Buttons, UI-Body |
| body | 16px | `text-base` / `.text-body` | Reading-Body, Form-Inputs (iOS-No-Zoom-Min) |
| lead | 18px | `text-[18px]` / `.text-lead` | Section-Hooks, Lead-Absätze |
| h2 | 24px | `text-[24px]` / `.text-h2` | Section-Titles |
| h1 | 28px | `text-[28px]` / `.text-h1` | Page-Titles (Barlow Condensed) |

**Eyebrow-Pattern:** `text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase` — universelles Kontext-Label über Werten.

**Beträge:** `font-mono-amount font-semibold tabular-nums` (JetBrains Mono, kein Springen bei Animationen).

## Layout & Spacing

**Spacing-Skala:** 4pt-Grid (Tailwind Default). Drei Dichte-Stufen für DataTable: compact (32px Rows, Desktop-only auto-disable Mobile), comfortable (Default), spacious.

**Container:**
- Dashboard / Bestellungen-Liste: `max-w-7xl` (fluid bis 1280px)
- Bestelldetail: 2-col Desktop (PDF-Viewer 60% + Sidebar 40%), 3-Tab Mobile-Switch (Dokumente / Details / Aktionen)
- Buchhaltung-DATEV-Modal: `max-w-md` (Single-Task-Form)

**Hierarchie-Pattern:**
- Header (PageHeader + meta-zeile)
- Industrial-Line (1px brand-tinted separator) als Abschluss
- Inhalt
- Sticky-Footer für Bulk-Actions

## Cards & Surfaces

**3 Card-Varianten:**
1. **Standard Card** (`card`): `bg-surface`, `border-line-subtle`, `--shadow-card`, `--radius-md`. Default.
2. **Card mit Brand-Akzent** (`card border-l-[4px]` mit Projekt-Color): Projekte-Cards. Pro Projekt eigene Farbe.
3. **Hero-Card** (Bento-Hero): `md:col-span-2`, größerer Numerus (`text-6xl`), corner-marks oben rechts, Volumen-Pill rechts.

**Anti-Pattern bewusst eliminiert:**
- Identical Card Grids (UI-Audit F4.5) → Bento mit Hero
- Side-stripe Borders >1px → `border-l-[3px] border-l-amber-400` für Unbestätigt-Sections **bleiben funktional** (Projekt-Farb-Identity, nicht reine Dekoration)

## Industrial Texture Layer

Dezente SVG-Patterns auf Hero-Surfaces:

- `bg-grid-pattern` — fine grid `rgba(87, 0, 6, 0.04)`
- `bg-iso-grid` — isometrisches Raster
- `bg-dot-grid` — dot-pattern für CardScan/Sub-Brand
- `corner-marks` — 4 Eck-Markierungen (Werkzeug-Anmutung)
- `industrial-line` — 1px brand-tinted Separator mit kleinen Metalldetails
- `film-grain` / `film-grain-light` — fraktale SVG-Noise (6% / 18%) als Papier-Textur

Wo eingesetzt:
- Root `/` Brand-Landing (Split-Screen Modul 01 + 02)
- Login (kontextabhängig MR-Red vs. CardScan-Dark)
- 404 (Editorial Centered)
- PageHero / EditorialSection (UX-R1) — Hot-Path-Pages innen
- Hero-StatCard im Dashboard

Wo NICHT: in Settings/System/Stammdaten-Listen, Forms, Modals (außer als Editorial-Statement bei PageHero `grain="subtle"`).

### Editorial-Foundation-Primitives (UX-R1, 03.06.2026)

Schließt die Lücke zwischen Brand-Surfaces (Login/Landing/404, editorial-luxury) und dem Inneren der App (heute Standard-Dashboard). Drei Primitives sitzen über den Texturen oben und sind die kanonische Einsatzart für Hot-Path-Pages:

**`<EditorialSection>` (`@/components/ui/editorial-section.tsx`)** — Foundation-Wrapper. Kapselt `corner-marks` + `industrial-line` + `film-grain` zu einer Komponente mit Props:

| Prop | Werte | Wirkung |
|---|---|---|
| `tone` | `brand` / `neutral` | brand schaltet `corner-marks` frei, neutral lässt sie aus |
| `marks` | `boolean` | corner-marks an Ecken (nur bei `tone=brand`) |
| `lineTop` / `lineBottom` | `boolean` | industrial-line als Separator |
| `grain` | `false` / `subtle` / `light` | film-grain Overlay |
| `padding` | `none` / `compact` / `relaxed` | Skala |
| `as` | `section` / `header` / `article` / `div` | Semantik |

Default ist ruhig (border + bg-card). Editorial-Ornamentik wird gezielt zugeschaltet. Niemals nested EditorialSection in EditorialSection — wenn ein Block Sub-Sections braucht, nutze `industrial-line` als Separator innerhalb.

**`<PageHero>` (`@/components/ui/page-hero.tsx`)** — spezialisierte EditorialSection für Page-Heros auf Hot-Path-Routen. Eyebrow + Display-Headline (`text-display-section` in Barlow Condensed clamp 28-40px) + Description + Actions. Default `tone=brand` mit `marks` und `lineBottom`. Wird in `/bestellungen/{lane}`, `/bestelldetail`, `/dashboard`, `/buchhaltung`, `/archiv` eingesetzt.

**`<PageHeader>` (`@/components/ui/page-header.tsx`)** — funktional, unauffällig. Bleibt das Default für `/einstellungen`, `/einstellungen/system/*`, Stammdaten-Pages. Hot-Path-First — Settings folgen nicht der editorial-Hand.

**`<BestellnummerHero>` (`@/components/ui/bestellnummer-hero.tsx`)** — Display-Numeral für Bestelldetail. Skala `text-display-numeral` clamp(36-64px) in Barlow Condensed mit `tabular-nums`. Halluzinations-Schutz: wenn `displayBestellnummer` "Ohne Nr." liefert, rendert die Komponente einen Internal-ID-Fallback (`BNi-{8char}`) mit Eyebrow "BN unbekannt". Wird ausschließlich auf der Detail-Page eingesetzt — Listen nutzen weiter `font-mono-amount + text-h2`.

**Sandbox:** `/einstellungen/system/patterns` (admin-only) zeigt alle Varianten + Type-Scale + Display-Skalen. Visual-Drift fängt man dort früh ab.

### Display-Skalen für Editorial-Hero (UX-R1)

Erweitert die kanonische Type-Scale um zwei clamp-basierte Hero-Größen. Beide erben `font-headline` (Barlow Condensed) wenn der Container die Klasse trägt.

| Klasse | Skala | Einsatz |
|---|---|---|
| `.text-display-section` | clamp(28, 4vw, 40) | PageHero Headline |
| `.text-display-numeral` | clamp(36, 5vw, 64) | BestellnummerHero (Detail-Page) |

## Status System (6 Workflow-States)

Jeder Status hat 3-Part-Color + Icon (`status-config.ts`):

| Status | Color | Icon | Bedeutung |
|---|---|---|---|
| erwartet | grau | Clock | Extension-Signal, noch keine Mail |
| offen | blau | ArrowRight | Mindestens 1 Dokument |
| vollstaendig | grün | Check | Alle 3 Dokumente |
| abweichung | rot | AlertCircle | KI fand Inkonsistenz |
| ls_fehlt | gelb | AlertTriangle | Lieferschein fehlt nach 5+ Tagen |
| freigegeben | smaragd | CheckCircle | An Buchhaltung übermittelt |

**Render:** `<StatusCell>` als Pill mit Icon + Label + Color-Bar links. Color-not-only erfüllt.

## Pool-Modell — Drei-Sprachen-Disziplin (02.06.2026, verschärft UX-R1 03.06.2026)

UNBEKANNT-Material-Bestellungen liegen in einem geteilten Pool, sichtbar für alle Besteller (RLS Phase 1). Wer freigibt = echter Owner. Die UI muss alle semantischen Layer **strikt visuell trennen**, sonst entsteht „Maschine hat schon entschieden"-Fehlinterpretation oder Pill-Inflation (sechs gleichlaute Indikatoren auf einer Card).

### Visual-Weight-Stufen v2 (UX-R1)

Drei Stufen ordnen die Indikatoren so, dass die Wand aus Pills aufhört. Stufe sagt **wie laut** das Element sein darf, nicht **wo** es hin gehört.

| Sprache | Stufe | Token-Set | Beispiel |
|---|---|---|---|
| **Status (Workflow)** | 1 (laut) | Status-Triplet `--status-*-bg/-text/-main` | OFFEN / VOLLSTÄNDIG / ABWEICHUNG |
| **Mahnung-Banner** | 1 (laut) | Status-Triplet warning, full-width Strip über dem Card-Hero | „Mahnung 2. Stufe seit 6 Tagen" |
| **Owner-Identität** | 2 (mittel) | Brand-solid pill `bg-brand text-foreground-inverse` | „[MT] Übernommen von Marlon" |
| **Pipeline-Vorschlag** | 2 (mittel) | Eyebrow ghost + dashed `bg-canvas border-dashed border-line-strong` + dotted-underline | „VORSCHLAG MT · 89 %" |
| **Reserve (anderer)** | 2 (mittel) | Neutral pill + Uhr-Glyph + Countdown `tabular-nums` | „CR bearbeitet · 9:42" |
| **Read-Dot** | 3 (subtle) | 6px `bg-brand` top-left | • |
| **Score-Pin** | 3 (subtle) | Subtle pill `border-line-strong bg-canvas` + ↑-Glyph | „↑ Priorität" |
| **Auto-Claim-Pin** | 3 (subtle) | Mini-Robot-Glyph oben rechts der Owner-Pille | (Robot-Glyph) |
| **Aging-Wash** | 3 (subtle) | `bg-aging-stale` (≥7d) / `bg-aging-rotting` (≥14d) | (card-tint) |
| **Presence-Strip** | 3 (subtle) | Avatar-Stack + neutral muted + 6px static dot | „Im Pool: MT, CR" |

**Verschärfte Regeln:**

- **Max 1 Stufe-1-Element pro Card.** Status ODER Mahnung-Banner, nie beide laut. Wenn eine Mahnung aktiv ist, wird sie zum full-width Strip über dem Hero und die Status-Pill bleibt sekundär (kleiner, neben dem Vendor-Namen).
- **Max 2 Stufe-2-Elemente pro Card.** Owner + Reserve geht (eigenes Item, anderer User dran). Owner + Vorschlag geht NICHT (semantisch falsch — wenn Owner da ist, ist der Vorschlag obsolet). Vorschlag + Reserve geht (Pool-Item, jemand schaut grad rein).
- **Stufe-3-Elemente dürfen nicht stufe-2 aussehen.** Aging-Wash maxt bei /40 Opacity. Score-Pin nie brand-solid. Robot-Pin nie groß. Wenn ein Stufe-3-Element wachsen will, gehört es in Stufe 2 und braucht eine bewusste Entscheidung.

**Tokens:** `bg-aging-stale` / `bg-aging-rotting` (UX-R1) ersetzen Tailwind-Defaults `bg-amber-50/40` / `bg-rose-50/40` an allen Stellen. Werte in `globals.css` als CSS-Variablen.

**Conflict-Resolution-Pattern (race-safe Optimistic):**
- Bei `pool_claim` → RPC `WHERE besteller_kuerzel = 'UNBEKANNT'` als Race-Schutz
- Verlierer bekommt `was_already_claimed`-Toast statt 409: `„Wurde gerade von MT übernommen — 14:32"`
- Eigene Aktionen feuern Optimistic-Update + Action-Toast; Realtime-Subscription bei Fremd-Action zeigt kontextualisierten Hinweis

**Pool-Komponenten-Inventar:**
- `BestellerCell` (`@/components/ui/cells/besteller-cell.tsx`) — Single Render-Pfad für Owner-Visualisierung (4 States: Owner / Vorschlag / Geteilt / Unzugeordnet). Kein Inline-Klon erlaubt.
- `OwnerLane` (`_components/owner-lane.tsx`) — Detail-Surface mit POOL / CLAIMED / FREIGEGEBEN, Magnetic-CTA „Übernehmen", Reassign-Modal, Return-ConfirmDialog
- `PresenceBanner` (`_components/presence-banner.tsx`) — Avatar-Stack mit statischem Live-Dot
- `ScopeTabs` (`@/components/bestellungen/scope-tabs.tsx`) — Pool / Meine offen / Meine erledigt / Alle
- `PoolHeroCard` (`@/components/dashboard/pool-hero-card.tsx`) — Dashboard-Bento mit Anzahl + Ältester-Eintrag + Top-3-Vendor-Histogramm

## Detail-Page als editoriale Akte (UX-R3, 03.06.2026)

Die Bestelldetail-Page ist die zentrale Akte zu einer Bestellung — sie muss sich wie ein Anliegen anfühlen, nicht wie ein Dashboard. Vor UX-R3 trug der Header 10+ konkurrierende Elemente und die Sidebar 7 stacked Accordion-Panels ohne Hierarchie. Jetzt:

### Hero-Struktur

`EditorialSection tone="brand" marks lineBottom` wraps den gesamten Page-Header. Innen, in dieser Reihenfolge:

1. **Mahnung-Banner** (full-width Strip, role=alert) — nur wenn aktiv. Status-abweichung-Triplet (warning-Variante). Verdrängt die Status-Pill aus Stufe 1: zwei laute Elemente nebeneinander brechen die Disziplin v2.
2. **BestellnummerHero** — Display-Numeral `clamp(36, 5vw, 64)` in Barlow Condensed mit `tabular-nums`. Bestellnummer ist der Anker, nicht eine von zehn Pills. Halluzinations-Schutz: fehlende BN → Internal-ID-Fallback `BNi-{8char}` mit Eyebrow "BN unbekannt".
3. **Vendor-Subline** — `IconBuilding` + Händler-Name + Unsicher-Marker (Pipeline-Defensive). Direkt unter dem Display-Numeral.
4. **Meta-Line** — Status-Pill (sekundär wenn Mahnung aktiv), BestellerCell (wenn keine OwnerStatement greift), Doku-Counter, Bestelldatum, Aktualisiert-Hint. Alle als Stufe-3-subtle in `text-meta`.
5. **Projekt-Pill** — Projekt-Farbe + Name. Stufe 3.
6. **`<OwnerStatement>`** — editorial Statement-Block für Owner-Workflow (siehe unten).
7. **Kontext-Pills** — Kundennummer, Projekt-Referenz, Fälligkeit. Nur wenn KI was extrahiert hat.
8. **Betrag** rechts — `text-display-section` `font-mono-amount` `tabular-nums` in `font-headline`. Editorial Display-Stil mit Eyebrow oben ("Betrag" / "Betrag (netto)" / "Guthaben").

Danach (außerhalb der EditorialSection): **Artikel-Kategorien** als Chip-Reihe, falls KI extrahiert hat. Stufe-3-Detail.

### OwnerStatement statt OwnerLane

`OwnerStatement` (`_components/owner-statement.tsx`) ersetzt die enge OwnerLane mit editorialem Block-Statement. Drei Render-Pfade:

| State | Visual | Primary Action |
|---|---|---|
| **Pool / Vorschlag** (UNBEKANNT) | Dashed-border-Block + industrial-line oben + BestellerCell + Pipeline-Vorschlag-Inline | Magnetic-CTA "Übernehmen" |
| **Owned** | Canvas-Block + Avatar + Statement-Text "X hat diese Bestellung übernommen." | Ghost "Übertragen" + Ghost "Zurück in Pool" |
| **Auto-Claim 24h-Grace** | Subtle Stufe-3-Hint + Quick-Korrektur "Falsch — zurück in Pool" | Inline-Link ohne Kommentar-Modal |

Pool-State ist der einzige mit Magnetic-CTA — der Akt der Übernahme ist Workflow-Schritt, nicht Pflege. Owned-State hat nur Ghost-Buttons — das Statement ist informativ, nicht aufrufend. Auto-Claim-Grace ist Korrekturpfad, nicht Aktion.

SU/Abo + Freigegeben + Gutschrift → null. Diese Cases haben keinen Owner-Workflow.

### Sidebar: 3 Blöcke statt 7 Cards

Vorher rendete die Sidebar 7 Accordion-Panels: ApprovalPanel, SidebarMetadata, KiVorschlagBanner, Timeline, AiToolsPanel, CommentsThread (zweimal auf Mobile). Alle gleich gewichtet, ohne visuelle Hierarchie.

Jetzt drei `<SidebarBlock>` mit `text-eyebrow uppercase tracking-[0.18em]`-Title:

1. **Aktion** — ApprovalPanel. Eine primäre CTA-Hierarchie pro Block (siehe nächster Abschnitt).
2. **Meta** — KiVorschlagBanner (KI-Suggestion inline) + SidebarMetadata (Bestellungsart, Art, Projekt, Vendor, Subunternehmer, Versand). Stammdaten der Bestellung.
3. **Aktivität** — Timeline + AiToolsPanel + CommentsThread als collapsible Sub-Widgets. Default-collapsed.

Gap zwischen Blöcken: `gap-6`. Gap zwischen Children innerhalb eines Blocks: `gap-3`. Der Block-Schnitt dominiert die Sub-Card-Struktur — das Auge sieht drei Bereiche, nicht sieben.

### CTA-Hierarchie verschärft

Drei-Sprachen-Disziplin v2 für CTAs: max 1 Primary CTA pro Surface. Im ApprovalPanel:

| Klasse | Visual | Wann |
|---|---|---|
| **Primary** | `btn-primary` Magnetic, full-width Hero | Freigeben (eigentlicher Workflow-Abschluss) |
| **Secondary** | Warning-Pill (`bg-warning-bg/40 border-warning-border text-warning`) | Mahnung quittieren (Pflege, niemals Hero) |
| **Ghost / Destructive** | Transparent + Trash-Icon + `hover:text-error hover:bg-error-bg` | Bestellung verwerfen — nach `industrial-line my-1`-Separator vom Rest abgetrennt |

**Regel:** Verwerfen ist niemals primary oder secondary — der ConfirmDialog `variant=danger` ist die Sicherheits-Brücke. Visuell laut sein wäre Doppelung. Mahnung-quittieren ist niemals primary — Freigabe ist der Workflow-Schritt. Wenn Freigabe nicht möglich (keine Rechnung): ruhiger Helper-Hinweis statt disabled-Button-Wall.

### Was hier NICHT lebt

- DocumentPanel hat eigene Card-Identität (PDF-Viewer + Tabs + Article-Drawer). Nicht in EditorialSection-Wrap — Card-in-Card. Konsistenz mit anderen Cards kommt in UX-R4.
- KiVorschlagBanner bleibt eigenständige Card im MetaBlock — Inline-Form-Suggestion-Refactor wäre ein eigener Sprint.
- Sub-Nav-Switcher im AktivitätBlock (Tabs für Audit / Kommentare / KI) ist nicht implementiert — die 3 Widgets bleiben collapsible-stacked. Pragmatischer Trade.

## Motion

**Easing-Tokens (in `:root`, exposiert via `--default-transition-timing-function`):**

| Token | Bezier | Einsatz |
|---|---|---|
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Default für alle Tailwind-Transitions, Popover-Entry, Mount-Reveals |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Hero-Animations, dramatischere Reveals |
| `--ease-out-circ` | `cubic-bezier(0, 0.55, 0.45, 1)` | Available für Sub-Brand-Variants |
| `--ease-out-strong` | `cubic-bezier(0.23, 1, 0.32, 1)` | Button-Hover, btn-primary Transitions (Emils Canonical) |
| `.ease-fluid` (class) | `cubic-bezier(0.32, 0.72, 0, 1)` | Magnetic-Button-Hover, Form-Field-Transitions (iOS-Drawer-Curve) |

**Duration-Skala:**
- Button-Press-Feedback: 100-160ms
- Tooltips, kleine Popovers: 125-200ms
- Dropdowns, Selects: 150-250ms
- Modals: 220ms (animate-scale-in)
- Brand-Surface Mount-Reveal: 600ms mit Stagger 50ms × 9 Steps

**Motion-Utility-Klassen:**
- `.reveal-up` + `.stagger-1..9` — Mount-Animation (translateY + opacity, KEIN filter:blur — Emil-Performance-Regel)
- `.animate-scale-in` — Modal-Entry (220ms, native dialog)
- `.animate-popover-in` — origin-aware Popover-Entry (180ms, ActionMenu)
- `.animate-fade-in` — Page-Transitions (180ms)

**Continuity-Patches (Spatial-Highlight-Familie):**
- `.row-preview-active` — Persistent während PDF-Modal offen
- `@keyframes row-afterglow` — 2.2s (preview-close) / 3.5s (detail-back) Fade-out
- `@keyframes row-page-pulse` — 1.5s 25%-Spike für Pagination-First-Row
- `@keyframes row-bulk-success` — 1.2s Emerald-Flash für Bulk-Success
- `@keyframes timeline-item-enter` — 1.6s für neue Timeline-Events

**Hard Rules:**
- Kein `bounce`, kein `elastic`, kein `ease-in` (zu sluggish bei Hover-Feedback)
- Animate nur `transform` + `opacity` + bei Bedarf `background-color`/`box-shadow` — keine Layout-Properties (`width`/`height`/`top`/`left`)
- `prefers-reduced-motion` global respektiert (globals.css `@media reduce`-Block disabled alle Continuity + Mount-Animations)

**State-Sync:**
- Realtime-Updates: Supabase Realtime + 1.5s Debounce auf Bestellungen-Liste, instant auf Detail-Page
- Optimistic UI: Freigabe + Bezahlt-Toggle nutzen `useOptimistic` + `startTransition` → 0ms perceived latency, Rollback bei Error

## Components Inventory

### Foundation (`@/components/ui/`)
- DataTable (mit Density-Toggle, Sticky-Header, Range-Select aria-live, Auto-Lift-Compact auf Mobile)
- FilterBar, ArtTabs, SavedViewsMenu, BulkToolbar
- Button (`sm/md/lg/icon-sm/icon-md`, primary/secondary/ghost/destructive/subtle)
- Modal (native `<dialog>` mit Backdrop-Blur)
- Badge, Alert, Toast, EmptyState, Sparkline
- PasswordInput (mit Eye-Toggle), Select
- 30+ In-House SVG-Icons (kein Lucide/Heroicons)

### Domain-Module
- `src/components/bestellungen/` — 6 Module (Columns-Hook, Actions-Hook, Preview-Hook, SavedViews-Hook, EmptyState, ConfirmDialogs, PdfPreviewModal, Types)
- `src/components/buchhaltung/` — DatevExportModal, Tabelle, Summary-Cards, Types
- `src/components/projekte/` — StatusDropdown, FormModal, ProjektCard, Types
- `src/components/archiv/` — 6 Sub-Module
- `src/app/(dashboard)/einstellungen/system/email-sync/_components/` — 3 Tab-Module

### Bestelldetail
- BestelldetailShell (Orchestrator)
- DocumentPanel (PDF-Viewer mit Tabs)
- Timeline (Aktivitätsverlauf mit Kategorie-Filter ab 12.05.)
- ApprovalPanel (Sidebar / Mobile-Section / Mobile-Bottom-Bar Variants)
- KiToolsPanel, CommentsThread
- DetailHeader

## Z-Index Scale

```
--z-content:       10  // sticky content within Page
--z-sticky-inner:  20  // sticky table-headers
--z-sticky-page:   30  // sticky page-headers
--z-floating:      40  // dropdowns, popovers
--z-modal-overlay: 50  // modal backdrops
--z-toast:         60  // toast notifications
```

## Border-Radius Scale

```
--radius-sm:  4px   // Badges, kleine Pills
--radius-md:  8px   // Buttons, Inputs, Default
--radius-lg:  12px  // Cards, Modals
--radius-xl:  16px  // Hero-Surfaces
--radius-2xl: 24px  // Icon-Container, große Rounded-Pills
```

## Anti-Patterns auf Watchlist

Aus dem heutigen UI-Audit identifiziert und bewusst eliminiert:
- ❌ Identical Card Grids (Dashboard → Bento)
- ❌ rounded-2xl ohne Token (→ jetzt `--radius-2xl`)
- ❌ Mobile DataTable Compact <44px (→ auto-lift)
- ❌ Color-only Status (→ Icon+Color+Text)
- ❌ Doppel-Widget Timeline + Audit-Trail (→ Timeline mit Filter)
- ❌ **Tab-Redundanz Pool/Meine offen/Meine erledigt/Alle** (UX-R2 → 3 Lanes)
- ❌ **Pill-Inflation auf einer Card** (UX-R1 → Visual-Weight-Stufen, max 1 Stufe-1-Element)
- ❌ **Tailwind-Default-Colors als Token-Bypass** (UX-R1 → ESLint-Rule blockt `bg-(slate|gray|emerald|...)-(50..900)` außerhalb /cardscan)
- ❌ **`transition-all` ohne spezifische Property** (UX-R1 → `transition-colors`, `transition-[width,background]`, etc., Emil-Performance-Regel)
- ❌ **Arbitrary Text-Skalen `text-xs/sm/lg/xl/2xl`** (UX-R1 → Codemod migriert auf `.text-meta/.text-body-sm/.text-lead/.text-h2`, 270 Stellen)

Bleibt erlaubt aus funktionalen Gründen:
- Side-Stripe-Border 3-4px für **Projekt-Identity** (Cards) und **Status-Pills** (functional, nicht decorative)
- Cards als primäre Affordance — bei Projekten und KPI-Tiles eigenes Werkzeug
- `text-xs/sm` auf Brand-Surfaces (Login/Landing/404, `/cardscan`) — bewusst editorial-tier mit eigenen Skalen, vom Codemod ausgenommen
