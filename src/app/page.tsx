import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Landing — Brand-Statement-Tier (12.05.2026, /high-end-visual-design).
 *
 * Variance-Engine:
 *   Vibe = Editorial Luxury (Warm Industrial) — Espresso MR-Red für Modul 01,
 *          OLED-Sidebar-Black für Modul 02 (CardScan-Sub-Brand mit Emerald-Glow).
 *   Layout = Editorial Split mit Z-Axis-Cascade-Inside — beide Panels haben
 *            ein floating Doppelrand-Glasplaketten-Content-Block + Bottom-CTA-
 *            Pille mit Button-in-Button.
 *
 * Design-Patterns:
 *   - Doppelrand auf den Module-Cards (bezel-shell-dark + bezel-core-dark).
 *   - Magnetic-Hover auf der ganzen Link-Karte (active:scale-[0.98]) UND
 *     auf der CTA-Pille (group-hover-icon-translate, scale, sheen).
 *   - Eyebrow-Mikropille (rounded-full px-3 py-1 text-[10px] uppercase
 *     tracking-[0.2em]) für "Modul 01/02".
 *   - reveal-up Mount-Animation staggered für progressive Aufdeckung.
 *   - Film-grain auf beiden Panels.
 *   - Radialer Brand-Glow (Mesh-Gradient-Hint, blur-3xl, opacity-[0.06]).
 *   - Industrielle Pattern-Schichten (grid, iso-grid, diagonal-lines) bewahrt.
 */
export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;
  const bestellwesenHref = isLoggedIn ? "/dashboard" : "/login?redirect=/dashboard";
  const cardscanHref = isLoggedIn ? "/cardscan" : "/login?redirect=/cardscan";

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* ─── Modul 01: Bestellwesen ──────────────────────────────────────── */}
      <Link
        href={bestellwesenHref}
        className="group relative flex-1 flex flex-col justify-between p-8 md:p-12 lg:p-16 bg-mr-gradient overflow-hidden min-h-[50dvh] lg:min-h-dvh transition-transform duration-700 ease-fluid hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {/* Layered industrial patterns (unverändert — Brand-Vocabulary bewahren) */}
        <div className="absolute inset-0 bg-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-fluid" />
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute inset-0 bg-diagonal-lines" />
        <div className="absolute inset-0 bg-iso-grid" />

        {/* Radialer Brand-Glow für ethereal Tiefe */}
        <div
          className="absolute -bottom-32 -right-32 w-[560px] h-[560px] rounded-full opacity-[0.16] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #ff5050, transparent 65%)" }}
          aria-hidden="true"
        />

        {/* Geometric corner accent */}
        <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.07] pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 320 320" fill="none">
            <line x1="80" y1="0" x2="320" y2="240" stroke="white" strokeWidth="0.75" />
            <line x1="120" y1="0" x2="320" y2="200" stroke="white" strokeWidth="0.75" />
            <line x1="160" y1="0" x2="320" y2="160" stroke="white" strokeWidth="0.75" />
            <line x1="200" y1="0" x2="320" y2="120" stroke="white" strokeWidth="0.75" />
            <line x1="240" y1="0" x2="320" y2="80" stroke="white" strokeWidth="0.75" />
            <rect x="280" y="0" width="40" height="3" fill="white" opacity="0.4" />
            <rect x="317" y="0" width="3" height="40" fill="white" opacity="0.4" />
          </svg>
        </div>

        <div className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.05] pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 200 200" fill="none">
            <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="160" x2="160" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="120" x2="120" y2="0" stroke="white" strokeWidth="0.75" />
            <rect x="0" y="197" width="30" height="3" fill="white" opacity="0.4" />
            <rect x="0" y="170" width="3" height="30" fill="white" opacity="0.4" />
          </svg>
        </div>

        <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent pointer-events-none" aria-hidden="true" />
        <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-events-none" aria-hidden="true" />

        {/* Film-grain finalisiert das physische Papier-Gefühl */}
        <div className="film-grain" aria-hidden="true" />

        {/* Logo */}
        <div className="relative z-10 reveal-up">
          <Logo size={44} className="text-foreground-inverse" />
        </div>

        {/* Floating Doppelrand-Content-Plakette */}
        <div className="relative z-10 max-w-md reveal-up stagger-2">
          <div className="bezel-shell-dark inline-block backdrop-blur-2xl">
            <div className="bezel-core-dark p-7 md:p-8 max-w-md">
              {/* Eyebrow */}
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1">
                <span className="block w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden="true" />
                <span className="text-[10px] text-white/65 tracking-[0.2em] uppercase font-mono-amount">
                  Modul 01 · Bestellwesen
                </span>
              </span>

              <h2
                className="font-headline text-foreground-inverse leading-[0.95] tracking-[-0.02em] mt-5"
                style={{ fontSize: "clamp(40px, 5vw, 60px)" }}
              >
                Bestell<span className="text-white/45">management</span>
              </h2>

              <div className="w-12 h-[2px] bg-white/30 mt-5 mb-4" aria-hidden="true" />

              <p className="text-white/55 text-[14px] leading-relaxed max-w-xs">
                Bestellungen verwalten, Dokumente abgleichen, Rechnungen freigeben.
              </p>

              <ul className="mt-6 space-y-2.5">
                {["Bestellbestätigung", "Lieferschein", "Rechnung"].map((label, i) => (
                  <li key={label} className="flex items-center gap-3">
                    <span className="w-5 h-5 border border-white/20 rounded flex items-center justify-center shrink-0">
                      <span className="font-mono-amount text-[10px] text-white/60">{String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="text-white/55 text-[12px] tracking-wide">{label}</span>
                    <span className="flex-1 h-px bg-white/[0.06]" aria-hidden="true" />
                    <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* CTA-Pille mit button-in-button trailing arrow */}
        <div className="relative z-10 reveal-up stagger-6">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-2xl pl-5 pr-2 py-2 transition-all duration-700 ease-fluid group-hover:bg-white/[0.12] group-hover:border-white/20">
            <span className="text-foreground-inverse text-[14px] font-medium tracking-tight">
              Modul betreten
            </span>
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center transition-all duration-700 ease-fluid group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105 group-hover:bg-white/22"
            >
              <svg
                className="w-4 h-4 text-foreground-inverse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </div>
        </div>
      </Link>

      {/* ─── Modul 02: CardScan ─────────────────────────────────────── */}
      <Link
        href={cardscanHref}
        className="group relative flex-1 flex flex-col justify-between p-8 md:p-12 lg:p-16 bg-sidebar overflow-hidden min-h-[50dvh] lg:min-h-dvh transition-transform duration-700 ease-fluid hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-accent/40"
      >
        {/* Hover overlay + dot grid (CardScan Sub-Brand bleibt unangetastet) */}
        <div className="absolute inset-0 bg-cs-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-fluid" />
        <div className="absolute inset-0 bg-dot-grid opacity-60" />

        {/* Emerald-Glow für ethereal Tiefe */}
        <div
          className="absolute -bottom-32 -left-32 w-[560px] h-[560px] rounded-full opacity-[0.10] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #10b981, transparent 65%)" }}
          aria-hidden="true"
        />

        {/* Geometric corner – gespiegelt */}
        <div className="absolute top-0 left-0 w-64 h-64 opacity-[0.06] pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 260 260" fill="none">
            <line x1="0" y1="60" x2="200" y2="260" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="100" x2="160" y2="260" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="140" x2="120" y2="260" stroke="white" strokeWidth="0.75" />
            <rect x="0" y="0" width="3" height="40" fill="white" opacity="0.4" />
            <rect x="0" y="0" width="40" height="3" fill="white" opacity="0.4" />
          </svg>
        </div>

        <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-accent/[0.08] to-transparent pointer-events-none" aria-hidden="true" />
        <div className="absolute top-[60%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-accent/[0.05] to-transparent pointer-events-none" aria-hidden="true" />

        <div className="absolute bottom-0 right-0 w-48 h-48 opacity-[0.04] pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="200" cy="200" r="80" stroke="white" strokeWidth="0.5" />
            <circle cx="200" cy="200" r="120" stroke="white" strokeWidth="0.5" />
            <circle cx="200" cy="200" r="160" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="film-grain" aria-hidden="true" />

        {/* Logo */}
        <div className="relative z-10 reveal-up flex items-center gap-3">
          <Logo size={32} className="text-foreground-inverse" />
          <div className="h-5 w-px bg-white/10" aria-hidden="true" />
          <span className="text-[10px] text-white/25 tracking-[0.2em] uppercase font-mono-amount">Scan</span>
        </div>

        {/* Floating Doppelrand-Content-Plakette */}
        <div className="relative z-10 max-w-md reveal-up stagger-3">
          <div className="bezel-shell-dark inline-block backdrop-blur-2xl">
            <div className="bezel-core-dark p-7 md:p-8 max-w-md">
              <span className="inline-flex items-center gap-2 rounded-full border border-cs-accent/30 bg-cs-accent/[0.06] px-3 py-1">
                <span className="block w-1.5 h-1.5 rounded-full bg-cs-accent" aria-hidden="true" />
                <span className="text-[10px] text-cs-accent-light/75 tracking-[0.2em] uppercase font-mono-amount">
                  Modul 02 · CardScan
                </span>
              </span>

              <h2
                className="font-headline text-foreground-inverse leading-[0.95] tracking-[-0.02em] mt-5"
                style={{ fontSize: "clamp(40px, 5vw, 60px)" }}
              >
                Card<span className="text-cs-accent/55">Scan</span>
              </h2>

              <div className="w-12 h-[2px] bg-cs-accent/30 mt-5 mb-4" aria-hidden="true" />

              <p className="text-white/55 text-[14px] leading-relaxed max-w-xs">
                Kontaktdaten aus Visitenkarten, E-Mails, Webseiten erfassen und direkt ins CRM übertragen.
              </p>

              <ul className="mt-6 space-y-2.5">
                {["Foto & Kamera", "Text & Clipboard", "URL & Dateien", "Dual-CRM Write"].map((label, i) => (
                  <li key={label} className="flex items-center gap-3">
                    <span className="w-5 h-5 border border-cs-accent/20 rounded flex items-center justify-center shrink-0">
                      <span className="font-mono-amount text-[10px] text-cs-accent/55">{String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="text-white/55 text-[12px] tracking-wide">{label}</span>
                    <span className="flex-1 h-px bg-white/[0.06]" aria-hidden="true" />
                    <svg className="w-3 h-3 text-cs-accent/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* CTA-Pille */}
        <div className="relative z-10 reveal-up stagger-7">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/[0.06] border border-cs-accent/15 backdrop-blur-2xl pl-5 pr-2 py-2 transition-all duration-700 ease-fluid group-hover:bg-cs-accent/[0.12] group-hover:border-cs-accent/30">
            <span className="text-foreground-inverse text-[14px] font-medium tracking-tight">
              Modul betreten
            </span>
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-full bg-cs-accent/15 flex items-center justify-center transition-all duration-700 ease-fluid group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105 group-hover:bg-cs-accent/25"
            >
              <svg
                className="w-4 h-4 text-cs-accent-light"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
