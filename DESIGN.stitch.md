# Design System: MR Umbau Cloud (cloud.mrumbau.de)

Stitch-optimized design vocabulary. Single source of truth for AI screen generation. Internal B2B tool for a German construction company (4-person team: 2 buyers + 1 admin + 1 accounting).

## 1. Visual Theme & Atmosphere

"Linear-meets-craft-industry" — clinical-warm, like a well-lit architecture studio at 10am on a Tuesday. Creamy paper-feel on surfaces, espresso-dark MR-Red brand anchor, industrial SVG textures (grid, iso-grid, diagonal-lines) ONLY on brand-statement pages (Login, Landing, 404).

Restraint in the daily-use tool: Density 5 (list-heavy but airy), Variance 4 (predictable for daily order management), Motion 4 (subtle + professional — never cinematic in the table hot-path).

Bento asymmetry + reveal-up mount animations reserved for brand surfaces. App interiors are quiet: tables, filters, detail pages stay Linear-tier crisp without showtime motion.

Two sub-brand modules: **Bestellwesen (MR-Red)** and **CardScan (Emerald)** — deliberately color-separated so users instantly know which module is active. Sub-branding is visible only in sidebar quick-access and module-landing cards. The app UI itself stays in its respective brand context.

## 2. Color Palette & Roles

All neutrals use OKLCH with a warm brand tint (hue 25°, chroma 0.003–0.007). sRGB-hex fallback via `@supports`-block for browsers older than Safari 15.4 / Chrome 111 / Firefox 113.

| Name | OKLCH | Hex Fallback | Role |
|---|---|---|---|
| **Warm Cream Canvas** | `oklch(0.965 0.005 30)` | `#F5F4F2` | Page background, filter bar |
| **Pure Surface** | `oklch(0.997 0.003 25)` | `#FFFFFF` | Card background (NEVER pure white) |
| **Input Surface** | `oklch(0.982 0.004 25)` | `#FAFAF9` | Form inputs, selects |
| **Hover Surface** | `oklch(0.981 0.005 25)` | `#FAF9F7` | Row-hover, button-hover |
| **Zebra** | `oklch(0.99 0.003 25)` | `#FDFCFB` | Table zebra stripes |
| **Espresso Ink** | `oklch(0.205 0.005 25)` | `#1A1A1A` | Primary text (14:1 on Canvas) |
| **Steel** | `oklch(0.45 0.004 25)` | `#5E5E5E` | Secondary text (6.5:1) |
| **Whisper** | `oklch(0.55 0.004 25)` | `#757575` | Captions, helper text (4.5:1) |
| **Faint** | `oklch(0.68 0.005 30)` | `#A8A4A0` | Eyebrow labels, disabled (3:1) |
| **Hairline** | `oklch(0.925 0.005 30)` | `#E6E3DF` | 1px borders, dividers |
| **Hairline Subtle** | `oklch(0.943 0.005 30)` | `#EFECE8` | Softer optional dividers |
| **Hairline Strong** | `oklch(0.852 0.007 35)` | `#CFCCC6` | Input borders (forms, cards) |
| **MR-Red Brand** | — | `#570006` | Brand anchor — CTAs, active states, status bars |
| **MR-Red Light** | — | `#7A1A1F` | Primary button hover |
| **MR-Red Disabled** | — | `#8B6369` | Primary disabled state |
| **CardScan Emerald** | — | `#10B981` | Sub-brand ONLY in CardScan module + sidebar quick-access |
| **Sidebar Dark** | — | `#141414` | Sidebar background (true charcoal, not pure black) |

**Status System** (6 workflow states × 3-part triplet): erwartet (gray), offen (blue), vollständig (green), abweichung (red), ls_fehlt (amber), freigegeben (emerald). Each with `--status-X` (main color), `--status-X-bg` (pill background matches Tailwind-50), `--status-X-text` (pill text matches Tailwind-700).

**Continuity tint** (user-feedback-driven): `oklch(0.93 0.06 20)` — visibly peachy, harmonizes with MR-Red. Appears as row-highlight while PDF modal is open and as 3.5s afterglow after detail-page return.

## 3. Typography Rules

- **Display:** `Barlow Condensed` — headlines, page-header titles. Industrial-condensed, construction-industry feel. Track-tight (`tracking-tight` or `tracking-[-0.02em]`). Hierarchy through weight (400/500/600/700), never via screaming size.
- **Body:** `DM Sans` — default sans. Geometric, neutral, professional. Relaxed leading (1.5–1.55).
- **Mono:** `JetBrains Mono` — amounts with `tabular-nums`, IDs, timestamps, eyebrow labels. Use `.font-mono-amount` class for currency values (prevents layout shifts).

**Type Scale — 7 canonical steps:**

| Token | Size | Class | Use |
|---|---|---|---|
| eyebrow | 10px | `.text-eyebrow` / `text-[10px]` | All-caps labels with `tracking-[0.2em] uppercase font-mono-amount` |
| meta | 12px | `.text-meta` / `text-[12px]` | Pills, captions, helper text, status tags |
| body-sm | 14px | `.text-body-sm` / `text-sm` | DataTable, buttons, UI body |
| body | 16px | `.text-body` / `text-base` | Reading body, form inputs (iOS no-zoom minimum) |
| lead | 18px | `.text-lead` / `text-[18px]` | Section hooks, lead paragraphs |
| h2 | 24px | `.text-h2` / `text-[24px]` | Section titles |
| h1 | 28px | `.text-h1` / `text-[28px]` | Page titles (Barlow Condensed) |

Brand-surface headlines (Login, Landing, 404) deliberately break the scale via `clamp(40px, 5vw, 64px)` for editorial impact.

**Eyebrow pattern:** `text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount` — universal context label above values. The most frequent micro-composition in the UI.

**Banned fonts in this project:** `Inter`, `Roboto`, `Arial`, `Open Sans`, `Helvetica`, all generic serifs (Times New Roman, Georgia, Garamond). Serif IS banned outright — this is a dashboard, not an editorial page.

## 4. Component Stylings

- **Buttons (`.btn-primary`):** MR-Red fill, `font-semibold`, 18px border-radius. Hover: lift via `translateY(-1px)` + brand-tinted box-shadow `0 4px 16px rgba(87,0,6,0.3)`. Active: `translateY(0) scale(0.97)` — tactile press feedback. Transitions: specific properties (`background-color`, `box-shadow`, `transform`), 120–180ms, `var(--ease-out-strong)` cubic-bezier(0.23, 1, 0.32, 1). NEVER outer-glow or neon shadow.

- **Magnetic CTA pill (brand surfaces only):** rounded-full `pl-6 pr-2 py-2`. Trailing arrow in its own circle wrapper (`w-10 h-10 rounded-full bg-white/15 group-hover:bg-white/22`). Group-hover translates +1px diagonal + scale 1.05. Sheen-sweep overlay (`absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[900ms] bg-gradient-to-r from-transparent via-white/12 to-transparent`). Active scale 0.97.

- **Doppelrand cards (Login + Landing + 404 only — NEVER in app interiors):** Outer `.bezel-shell` with subtle bg + 6px padding + rounded-[var(--radius-2xl)=24px] + hairline inset-ring. Inner `.bezel-core` with `calc(2xl - 6px)`-radius + 1px inset highlight + outer shadow. Feels like a machined glass plate sitting in an aluminum tray.

- **HeroStatCard (Bento pattern):** `md:col-span-2` for KPI dominance. 6xl numeral, 16px top-gradient + corner-marks accent top-right. Optional `badge` ("Urgent"), `alert` (error tint + ring), `secondary` (trend arrow right), `footer` (sparkline). Used in Buchhaltung (Open invoices), Archiv (Total volume), and Dashboard (status snapshot).

- **Standard cards:** `.card` class — bg-surface, 1px hairline border, 12px rounded, subtle warm shadow (`--shadow-card: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)`). Hover: `.card-hover` adds lift + slightly stronger shadow.

- **Modals:** Native `<dialog>` via shared `<Modal>` component. Sizes: sm (24rem) / md (28rem) / lg (32rem) / xl (42rem) / 2xl (56rem). Mobile: `w-[calc(100%-1rem)]` for 8px breathing room. Entry: 220ms scale-in from 0.96 → 1 (NEVER scale(0) → 1). Backdrop: black/40 + backdrop-blur-sm. ESC + backdrop-click dismissible (except during loading). Focus-trap automatic via native dialog.

- **Inputs:** Label above with eyebrow style. Input: `bg-input border-line rounded-xl min-h-[48px] px-4 py-3.5 text-base` (16px for iOS no-zoom). Focus: brand-border + `shadow-[var(--shadow-focus-ring)]` 3px brand-glow inset. Error text below input with `role="alert"` + `text-error`. Always use `inputMode` + `autoComplete` for mobile keyboards (email, tel, url, numeric).

- **Status tags:** Pill with left 3px brand-color bar + icon + label. Background tint + text from matching pill-bg/pill-text tokens. Color-not-only compliant (every status has an icon).

- **DataTable:** Density toggle (Compact 32px / Comfortable 40px / Spacious 48px). Auto-lifts Compact to Comfortable below 768px via `useEffectiveDensity` hook. Sticky header. Range-select with Shift-click. Sortable column headers with `aria-sort`. Row-hover: `bg-canvas` + 3px inset-left-shadow in MR-Red. `getRowClassName` prop drives spatial-continuity highlights.

- **Loading skeletons:** `.skeleton` class with `var(--border-default)` + brand keyframe pulse (1.5s ease-in-out). NEVER circular spinner for list loading. Form skeletons match exact layout dimensions.

- **Empty states:** `<EmptyState>` component with icon + title + description + primaryAction (CTA). Tone: info/success/error. NEVER silent "No data" — always with action hint. Plus differentiated filter-zero-match states with active filter pills + reset CTA.

- **Industrial line:** `<div className="industrial-line" />` — 1px brand-tinted hairline with gradient-fade edges. Section separator between stats snapshot and table. Subtle, signature.

- **Toast:** Custom sonner-style (no 3rd-party lib). Auto-dismiss 4s for success/info, persistent for error. role="status" + aria-live="polite". Differentiated tones: success (green), error (red), warning (amber), info (blue).

## 5. Layout Principles

- **min-h-dvh everywhere** — `h-screen` is banned (iOS Safari catastrophic viewport jump).
- **Container max-width:** `max-w-7xl` (1280px) for Dashboard + Bestellungen, `max-w-md` (28rem) for forms, `max-w-2xl` for read-content.
- **Grid-first responsive:** Tailwind Grid utilities, never `calc(%)` flex math.
- **Bento layout** (Buchhaltung + Archiv): `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` with HeroStatCard `col-span-2`. Asymmetric dominance, never 3-equal-cards row.
- **Bestelldetail layout:** 2-col desktop (`hidden md:flex flex-row gap-5`) — PDF viewer 60% + Sidebar 40%. Mobile: complete layout switch via `md:hidden flex-col` with tab bar on top (Dokumente / Details / Aktionen).
- **Industrial SVG textures** ONLY on brand surfaces (Login, Landing, 404). Background layers: `bg-grid-pattern` + `bg-iso-grid` + `bg-diagonal-lines` + corner-mark SVGs. App interiors stay clean.
- **Industrial line between sections** — visually marks snapshot section vs. table section on Dashboard + Buchhaltung + Archiv.
- **NEVER overlapping elements** — clean spatial separation always. No absolute-positioned text-on-image. Doppelrand is the ONLY legitimate nested enclosure.

## 6. Responsive Rules

- **Mobile-first collapse:** all multi-column grids stack below 640px (sm breakpoint). FilterBar + ArchivToolbar use `flex flex-col sm:flex-row` — selects stack under search on mobile.
- **Touch targets ≥44px** on all interactive elements: Sidebar nav items (responsive `py-3 md:py-2.5 min-h-[44px] md:min-h-0`), ActionMenu (h-11 md:h-7), Sub-Nav, date inputs (`min-h-[44px]`), filter selects.
- **DataTable** auto-lifts compact density to comfortable below 768px via `useEffectiveDensity` hook.
- **PageHeader:** `clamp(36px, 4vw, 48px)` for H1 on brand surfaces, `text-[28px]` on app pages.
- **Modals:** `w-[calc(100%-1rem)] sm:w-full` for 8px mobile breathing room, then `max-w-X` caps on larger viewports.
- **Tables scroll horizontally** inside the card via `overflow-x-auto` + `min-w-[640px]` on `<table>` — doesn't break page layout.
- **Sub-Nav:** `-mx-1 overflow-x-auto scrollbar-hide` — horizontal scroll when too many tabs for viewport.
- **NEVER horizontal page-scroll** on mobile (critical failure pattern).
- **NEVER `maximumScale: 1`** on viewport-meta (WCAG 1.4.4 resize-text block).
- **prefers-reduced-motion** respected globally — all continuity animations + reveal-up + skeleton-pulse disabled.

## 7. Motion & Interaction

**Easing tokens** (CSS variables in :root):
- `--ease-out-quart`: `cubic-bezier(0.25, 1, 0.5, 1)` — default for all Tailwind transitions
- `--ease-out-expo`: `cubic-bezier(0.16, 1, 0.3, 1)` — hero animations
- `--ease-out-strong`: `cubic-bezier(0.23, 1, 0.32, 1)` — button hover, btn-primary
- `.ease-fluid` class: `cubic-bezier(0.32, 0.72, 0, 1)` — iOS drawer curve, magnetic hover

**Duration scale:**
- Button press: 100–160ms
- Tooltips, small popovers: 125–200ms (animate-popover-in 180ms scale-in)
- Dropdowns, selects: 150–250ms
- Modals: 220ms (animate-scale-in)
- Brand-surface mount-reveal: 600ms with stagger 50ms × 9 steps
- Continuity afterglow: 2.2s (preview-close) / 3.5s (detail-back)

**Motion utility classes:**
- `.reveal-up` + `.stagger-1..9` — mount animation (translateY + opacity, NO filter:blur — GPU performance)
- `.animate-scale-in` — modal entry (220ms, native dialog)
- `.animate-popover-in` — origin-aware popover entry (180ms, ActionMenu)
- `.animate-fade-in` — page transitions (180ms)

**Continuity patches (signature pattern):**
- `.row-preview-active` — persistent while PDF modal is open (peachy bg + 4px brand-bar left)
- `@keyframes row-afterglow` — 2.2s/3.5s fade-out after modal close or detail back
- `@keyframes row-page-pulse` — 1.5s 25%-spike on first row after pagination
- `@keyframes row-bulk-success` — 1.2s emerald flash for bulk-success confirmation
- `@keyframes timeline-item-enter` — 1.6s for new timeline events

**Hard rules:**
- NEVER `bounce`, `elastic`, `ease-in`
- Animate ONLY `transform` + `opacity` (+ `background-color`/`box-shadow` if needed) — never layout properties
- NEVER `filter: blur()` in keyframes (very expensive)
- `backdrop-blur` only on fixed/sticky elements, never scrolling containers
- `prefers-reduced-motion` global @media block disables all .animate-*, .skeleton, .reveal-up, all continuity animations

**Realtime updates:** Supabase Realtime + 1.5s debounce on Bestellungen list, instant on detail page. Optimistic UI on Freigabe + Bezahlt via `useOptimistic` + `startTransition` for 0ms perceived latency.

## 8. Anti-Patterns (NEVER DO)

**Color:**
- NEVER pure `#000000` (sidebar uses `#141414` charcoal) or pure `#FFFFFF` (cards use `oklch(0.997 ...)`)
- NEVER Tailwind default color classes (`bg-slate-*`, `text-gray-*`, `bg-blue-*`, etc.) — ALWAYS design tokens (`bg-canvas`, `text-foreground`, `bg-success-bg`, etc.)
- NEVER neon outer-glow or electric accents
- NEVER magic hex values in JSX (except explicit eslint-disable with rationale) — all colors via tokens
- NEVER oversaturated accents — `--mr-red` is enough dominance

**Typography:**
- NEVER `Inter`, `Roboto`, `Arial`, `Helvetica`, `Open Sans`, generic system fonts
- NEVER generic serifs (`Times New Roman`, `Georgia`, `Garamond`, `Palatino`)
- NEVER serif fonts at all in this dashboard (B2B tool, not editorial layout)
- NEVER `text-[Npx]` outside the 7-stage scale (10/12/14/16/18/24/28)
- NEVER English-German mixed microcopy — German throughout
- NEVER AI copywriting phrases: "Elevate", "Seamless", "Unleash", "Next-Gen", "Cutting-edge"

**Layout & Motion:**
- NEVER `h-screen` — always `min-h-dvh`
- NEVER 3-equal-cards row as feature hierarchy — Bento with HeroStatCard col-span-2
- NEVER centered hero — brand surfaces use editorial split
- NEVER overlapping text-on-image elements — clean spatial separation
- NEVER custom mouse cursors
- NEVER `transition-all` — specific properties (`transition-colors`, `transition-transform`, etc.)
- NEVER `ease-in` on UI hover — feels sluggish
- NEVER `scale(0)` entry animation — start from 0.95 + opacity
- NEVER `filter: blur()` in animation keyframes — animated blur is one of the most expensive properties
- NEVER permanent `will-change` on one-shot animations
- NEVER bouncing chevrons / "Scroll to explore" / scroll-arrows / "Swipe down"

**Content:**
- NEVER emojis anywhere in UI / microcopy / toasts / page headers
- NEVER fake placeholder names ("John Doe", "Acme Corp", "Nexus") — real German business data (MR Umbau GmbH, real vendor names like Bauhaus, Raab Karcher, Brillux, Hold & Spada)
- NEVER round fake percentages ("99.99%", "50%") in stats
- NEVER broken Unsplash links — only `picsum.photos` or SVG avatars when placeholder needed
- NEVER single-doc pattern for multi-doc Bestellungen — preview modal has prev/next nav when multiple invoices exist

**A11y:**
- NEVER color-only status signals — ALWAYS icon + text + color (status tags, ConfidenceBadge)
- NEVER `maximumScale: 1` on viewport-meta — WCAG 1.4.4 block
- NEVER touch targets <44px on mobile (responsive `py-3 md:py-2.5 min-h-[44px] md:min-h-0` is the pattern)
- NEVER icon-only buttons without `aria-label`
- NEVER ignore `prefers-reduced-motion`

**Architecture:**
- NEVER 3rd-party library for toasts/modals/tooltips — in-house set
- NEVER Lucide/Heroicons/Material-Icons — 30+ in-house SVG icons in `src/components/ui/icons.tsx`
- NEVER new brand surface without Doppelrand + reveal-up + Eyebrow pill + Magnetic CTA
- NEVER new list page without `<EmptyState>` + filter-zero-match handling

---

**Module Separation Note (critical for Stitch):**

Project has two modules with distinct brand identities:

- **Module 01 — Bestellwesen (Order Management):** MR-Red dominant. Table-heavy. Workflow pages for material orders, accounting, archive. Uses ALL the warm neutrals + MR-Red brand color above.
- **Module 02 — CardScan:** Emerald-500 as sub-brand accent. Mobile-first PWA. OCR + CRM sync. Has its own layout, its own token family (`--cs-*`).

Sidebar shows CardScan quick-access after industrial-line divider with eyebrow label "Andere Module" ("Other Modules") — visually positioned as a separate module, not as sub-navigation.

**Stitch should NEVER use the emerald sub-brand tokens when generating Bestellwesen screens** (only for the explicit CardScan module landing card on the public landing page). Emerald is a context indicator for the CardScan module exclusively.

---

**Language convention:** All user-facing copy in **German**. Internal code comments + this design doc are bilingual mix.

**Domain vocabulary** (must use these exact German terms in UI, never anglicize):
- Bestellung (order), Bestellnummer (order number)
- Lieferschein (delivery note), Rechnung (invoice), Bestellbestätigung (order confirmation)
- Besteller (buyer), Buchhaltung (accounting)
- Freigeben (release), Freigegeben (released), Bezahlt (paid)
- Mahnung (reminder), Fällig (due), Überfällig (overdue)
- Händler (vendor/merchant), Subunternehmer (subcontractor), Projekt (project)
- DATEV (German accounting standard)
