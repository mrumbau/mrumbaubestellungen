# Design System — MR Umbau Bestellmanagement

> "Linear meets Handwerk-Industrie" — präzises Tool-Design mit industriellem Material-Bewusstsein.

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

Wo eingesetzt:
- Root `/` Brand-Landing (Split-Screen Modul 01 + 02)
- Login (kontextabhängig MR-Red vs. CardScan-Dark)
- PageHeader-Separator
- Hero-StatCard im Dashboard

Wo NICHT: in normalen Listen, Forms, Modals. Texturen sind Brand-Marker, kein Pflicht-Hintergrund.

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

## Motion

- **Easing:** `--ease-out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`) für Standard-Transitions, `--ease-out-expo` für Hero-Animations. Kein bounce, kein elastic.
- **Duration:** 150-300ms für Micro-Interactions. Exit shorter than enter.
- **prefers-reduced-motion:** global respektiert (`@media` in globals.css L488-499).
- **Realtime-Updates:** via Supabase Realtime + 1.5s Debounce auf Bestellungen-Liste, instant auf Detail-Page.
- **Optimistic UI:** Freigabe + Bezahlt-Toggle nutzen `useOptimistic` + `startTransition` → 0ms perceived latency, Rollback bei Error.

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

Bleibt erlaubt aus funktionalen Gründen:
- Side-Stripe-Border 3-4px für **Projekt-Identity** (Cards) und **Status-Pills** (functional, nicht decorative)
- Cards als primäre Affordance — bei Projekten und KPI-Tiles eigenes Werkzeug
