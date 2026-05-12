import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * 404 — Editorial Luxury Treatment (12.05.2026, /high-end-visual-design).
 *
 * Variance-Engine:
 *   Vibe = Editorial Luxury (Warm Industrial) — cream Neutrals + Espresso-Brand,
 *          Variable-Headline + Mono-Eyebrows, dezente film-grain.
 *   Layout = Centered Editorial mit Doppelrand-Action-Card.
 *
 * Design-Patterns:
 *   - Massive Display-Numeral (Barlow Condensed, ~clamp(96px, 18vw, 180px))
 *     mit negativem letter-spacing für editorial Heft-Charakter.
 *   - Eyebrow-Mikrolabel (rounded-full px-3 py-1 text-[10px] tracking-[0.2em]).
 *   - Doppelrand-Action-Card (bezel-shell + bezel-core) statt nackter Buttons.
 *   - Button-in-Button trailing-Arrow (eigener circle-wrapper) auf Primary-CTA.
 *   - Magnetic-Hover: group + active:scale-[0.98] + nested-icon translate.
 *   - Film-grain-Overlay (mix-blend-mode soft-light) für Papier-Charakter.
 *   - Reveal-up Mount-Animation, staggered.
 */
export default function NotFound() {
  return (
    <main className="min-h-dvh relative overflow-hidden bg-canvas">
      {/* Pattern-Schichten — industrielles Vokabular bewahren */}
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none" aria-hidden="true" />
      <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/[0.08] to-transparent pointer-events-none" aria-hidden="true" />
      <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/[0.04] to-transparent pointer-events-none" aria-hidden="true" />
      {/* Geometrischer Ecken-Akzent oben rechts */}
      <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.05] pointer-events-none" aria-hidden="true">
        <svg viewBox="0 0 320 320" fill="none">
          <line x1="80" y1="0" x2="320" y2="240" stroke="var(--mr-red)" strokeWidth="0.75" />
          <line x1="160" y1="0" x2="320" y2="160" stroke="var(--mr-red)" strokeWidth="0.75" />
          <line x1="240" y1="0" x2="320" y2="80" stroke="var(--mr-red)" strokeWidth="0.75" />
        </svg>
      </div>
      <div className="film-grain-light" aria-hidden="true" />

      <div className="relative z-10 min-h-dvh flex flex-col items-center justify-center px-6 py-16 md:py-24">
        {/* Logo */}
        <div className="reveal-up">
          <Logo size={44} className="text-brand" />
        </div>

        {/* Eyebrow-Pille */}
        <div className="mt-12 reveal-up stagger-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
            <span className="block w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
              Fehler 404 · Nicht gefunden
            </span>
          </span>
        </div>

        {/* Massive Display-Numeral */}
        <h1
          className="reveal-up stagger-2 mt-6 font-headline text-foreground tracking-[-0.04em] leading-[0.9] text-center"
          style={{ fontSize: "clamp(96px, 18vw, 180px)" }}
          aria-label="404 — Seite nicht gefunden"
        >
          <span className="text-brand">4</span>
          <span className="text-foreground/85">0</span>
          <span className="text-brand">4</span>
        </h1>

        {/* Industrial-Line + Description */}
        <div className="reveal-up stagger-3 mt-4 w-16 h-[2px] bg-brand/30" aria-hidden="true" />

        <p className="reveal-up stagger-4 mt-6 max-w-md text-center text-foreground-muted leading-relaxed">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
          Möglicherweise wurde die Bestellung archiviert, gelöscht oder die URL falsch übermittelt.
        </p>

        {/* Doppelrand-Action-Card */}
        <div className="reveal-up stagger-5 mt-12 bezel-shell w-full max-w-md">
          <div className="bezel-core p-2">
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              {/* Primary CTA — Button-in-Button + Magnetic */}
              <Link
                href="/dashboard"
                className="group flex-1 relative overflow-hidden rounded-full pl-5 pr-2 py-2 bg-brand text-foreground-inverse font-medium text-sm flex items-center justify-between gap-3 transition-transform duration-200 ease-fluid active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] min-h-[44px]"
              >
                <span className="relative z-10">Zum Dashboard</span>
                <span
                  aria-hidden="true"
                  className="relative z-10 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center transition-[background-color,transform,box-shadow] duration-200 ease-fluid group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105 group-hover:bg-white/20"
                >
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H8M17 7v9" />
                  </svg>
                </span>
                {/* Sheen-Sweep on hover */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[900ms] ease-fluid bg-gradient-to-r from-transparent via-white/15 to-transparent"
                />
              </Link>

              {/* Secondary CTA */}
              <Link
                href="/bestellungen"
                className="group flex-1 relative overflow-hidden rounded-full px-5 py-2 bg-canvas text-foreground font-medium text-sm flex items-center justify-center gap-2 transition-[background-color,transform,box-shadow] duration-200 ease-fluid hover:bg-surface-hover active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] min-h-[44px]"
              >
                <span>Zu Bestellungen</span>
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-foreground-subtle transition-transform duration-200 ease-fluid group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer-Eyebrow */}
        <div className="reveal-up stagger-7 mt-16 flex items-center gap-3 max-w-md w-full">
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
          <span className="text-[10px] text-foreground-faint tracking-[0.2em] uppercase font-mono-amount">
            cloud.mrumbau.de · MR Umbau GmbH
          </span>
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
