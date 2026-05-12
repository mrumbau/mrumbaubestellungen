"use client";

/**
 * Login — Brand-Statement-Tier (12.05.2026, /high-end-visual-design).
 *
 * Variance-Engine:
 *   Vibe = Editorial Luxury (Warm Industrial) — Cream-Neutrals als Form-Seite,
 *          Espresso-MR-Red als Brand-Panel-Seite, JetBrains-Mono-Eyebrows,
 *          dezente film-grain für haptisches Papier-Gefühl.
 *   Layout = Editorial Split (45/55) → Mobile Single-Column-Stack.
 *
 * Design-Patterns:
 *   - Doppelrand-Wrap der Form-Card (bezel-shell + bezel-core mit Inset-Highlight).
 *   - Eyebrow-Mikropille über H1.
 *   - Magnetic Submit-Button mit button-in-button trailing arrow,
 *     sheen-sweep overlay, active:scale[0.98], group-hover-icon-translate.
 *   - Show/Hide-Password als Inset-Icon mit ≥44px Touch-Target.
 *   - reveal-up Mount-Animation staggered über Logo → Eyebrow → H1 → Form-Felder → CTA.
 *   - Film-grain auf beiden Panels (light: cream-Tönung, dark: brand-tinted).
 *   - prefers-reduced-motion respektiert (in globals.css zentral).
 */

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const isCardScan = redirectTo?.startsWith("/cardscan");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Login fehlgeschlagen. Bitte prüfe E-Mail und Passwort.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profil } = await supabase
        .from("benutzer_rollen")
        .select("rolle")
        .eq("user_id", user.id)
        .single();

      const safeRedirect = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : null;
      let ziel = safeRedirect || "/bestellungen";
      if (!safeRedirect) {
        if (profil?.rolle === "buchhaltung") {
          ziel = "/buchhaltung";
        } else if (profil?.rolle === "admin") {
          ziel = "/dashboard";
        }
      }
      window.location.replace(ziel);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* ─── Left: Brand Panel ──────────────────────────────────────── */}
      <aside className={`hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 ${
        isCardScan ? "bg-sidebar" : "bg-mr-gradient"
      }`}>
        {isCardScan ? (
          <>
            <div className="absolute inset-0 bg-dot-grid opacity-60" />
            <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-accent/[0.08] to-transparent" />
            <div className="absolute top-[60%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-accent/[0.05] to-transparent" />
            <div className="absolute top-0 left-0 w-64 h-64 opacity-[0.06]">
              <svg viewBox="0 0 260 260" fill="none">
                <line x1="0" y1="60" x2="200" y2="260" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="100" x2="160" y2="260" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="140" x2="120" y2="260" stroke="white" strokeWidth="0.75" />
                <rect x="0" y="0" width="3" height="40" fill="white" opacity="0.4" />
                <rect x="0" y="0" width="40" height="3" fill="white" opacity="0.4" />
              </svg>
            </div>
            <div className="absolute bottom-0 right-0 w-48 h-48 opacity-[0.04]">
              <svg viewBox="0 0 200 200" fill="none">
                <circle cx="200" cy="200" r="80" stroke="white" strokeWidth="0.5" />
                <circle cx="200" cy="200" r="120" stroke="white" strokeWidth="0.5" />
                <circle cx="200" cy="200" r="160" stroke="white" strokeWidth="0.5" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-grid-pattern" />
            <div className="absolute inset-0 bg-diagonal-lines" />
            <div className="absolute inset-0 bg-iso-grid" />
            <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.07]">
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
            <div className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.05]">
              <svg viewBox="0 0 200 200" fill="none">
                <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="160" x2="160" y2="0" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="120" x2="120" y2="0" stroke="white" strokeWidth="0.75" />
                <rect x="0" y="197" width="30" height="3" fill="white" opacity="0.4" />
                <rect x="0" y="170" width="3" height="30" fill="white" opacity="0.4" />
              </svg>
            </div>
            <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
          </>
        )}
        {/* Film-grain finalisiert den haptischen Papier-Charakter */}
        <div className="film-grain" aria-hidden="true" />

        {/* Logo */}
        <div className="relative z-10 reveal-up">
          {isCardScan ? (
            <div className="flex items-center gap-3">
              <Logo size={44} className="text-foreground-inverse" />
              <div className="h-5 w-px bg-white/10" />
              <span className="text-[10px] text-white/20 tracking-[0.15em] uppercase font-mono-amount">Scan</span>
            </div>
          ) : (
            <Logo size={56} className="text-foreground-inverse" />
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-md">
          {isCardScan ? (
            <>
              <div className="flex items-center gap-2 mb-4 reveal-up stagger-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-cs-accent/30 bg-cs-accent/[0.06] px-3 py-1">
                  <span className="block w-1.5 h-1.5 rounded-full bg-cs-accent" aria-hidden="true" />
                  <span className="text-[10px] text-cs-accent-light/70 tracking-[0.2em] uppercase font-mono-amount">
                    Modul 02 · CardScan
                  </span>
                </span>
              </div>

              <h2
                className="reveal-up stagger-2 font-headline text-foreground-inverse leading-[0.95] tracking-[-0.02em]"
                style={{ fontSize: "clamp(40px, 5vw, 64px)" }}
              >
                Card<span className="text-cs-accent/55">Scan</span>
              </h2>

              <div className="reveal-up stagger-3 w-16 h-[2px] bg-cs-accent/30 mt-6 mb-5" aria-hidden="true" />

              <p className="reveal-up stagger-4 text-white/35 text-sm leading-relaxed max-w-xs">
                Kontaktdaten aus Visitenkarten, E-Mails, Webseiten erfassen und direkt ins CRM übertragen.
              </p>

              <ul className="mt-8 space-y-2.5">
                {["Foto & Kamera", "Text & Clipboard", "URL & Dateien", "Dual-CRM Write"].map((label, i) => (
                  <li
                    key={label}
                    className={`reveal-up stagger-${i + 5} flex items-center gap-3`}
                  >
                    <span className="w-5 h-5 border border-cs-accent/15 rounded flex items-center justify-center">
                      <span className="font-mono-amount text-[10px] text-cs-accent/40">{String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="text-white/35 text-[12px] tracking-wide">{label}</span>
                    <span className="flex-1 h-px bg-white/[0.06]" aria-hidden="true" />
                    <svg className="w-3 h-3 text-cs-accent/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 reveal-up stagger-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1">
                  <span className="block w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden="true" />
                  <span className="text-[10px] text-white/60 tracking-[0.2em] uppercase font-mono-amount">
                    Modul 01 · Bestellwesen
                  </span>
                </span>
              </div>

              <h2
                className="reveal-up stagger-2 font-headline text-foreground-inverse leading-[0.95] tracking-[-0.02em]"
                style={{ fontSize: "clamp(40px, 5vw, 64px)" }}
              >
                Digitales
                <br />
                Bestell<span className="text-white/40">management</span>
              </h2>

              <div className="reveal-up stagger-3 w-16 h-[2px] bg-white/25 mt-6 mb-5" aria-hidden="true" />

              <p className="reveal-up stagger-4 font-headline text-lg text-white/60 tracking-tight">
                Präzise. Robust. Digital.
              </p>
              <p className="reveal-up stagger-5 text-white/35 mt-3 text-sm leading-relaxed max-w-xs">
                Automatische Dokumentenerkennung. KI-gestützter Abgleich.
                Vollständige Kontrolle über jeden Bestellprozess.
              </p>

              <ul className="mt-8 space-y-2.5">
                {["Bestellbestätigung", "Lieferschein", "Rechnung"].map((label, i) => (
                  <li
                    key={label}
                    className={`reveal-up stagger-${i + 6} flex items-center gap-3`}
                  >
                    <span className="w-5 h-5 border border-white/20 rounded flex items-center justify-center">
                      <span className="font-mono-amount text-[10px] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="text-white/40 text-[12px] tracking-wide">{label}</span>
                    <span className="flex-1 h-px bg-white/[0.06]" aria-hidden="true" />
                    <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-3 reveal-up stagger-9">
          <div className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
          <span className="text-white/20 text-[10px] tracking-[0.2em] uppercase font-mono-amount">MR Umbau GmbH · 2026</span>
          <div className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
        </div>
      </aside>

      {/* ─── Right: Login Form ─────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center px-6 py-12 md:py-16 lg:py-24 bg-canvas relative overflow-hidden">
        {/* Sehr dezente warme Atmosphere — radialer Brand-Schimmer */}
        <div
          className="absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full opacity-[0.05] pointer-events-none blur-3xl"
          style={{ background: "radial-gradient(circle, var(--mr-red), transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="film-grain-light" aria-hidden="true" />

        <div className="w-full max-w-md relative z-10">
          {/* Mobile-Logo */}
          <div className="lg:hidden mb-10 flex justify-center reveal-up">
            <Logo
              size={40}
              className={isCardScan ? "text-foreground" : "text-brand"}
            />
          </div>

          {/* Eyebrow */}
          <div className="reveal-up stagger-1 flex justify-center lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
              <span className="text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
                Sicherer Zugang
              </span>
            </span>
          </div>

          {/* H1 */}
          <h1
            className="reveal-up stagger-2 mt-5 font-headline text-foreground tracking-[-0.02em] leading-[0.95] text-center lg:text-left"
            style={{ fontSize: "clamp(36px, 4vw, 48px)" }}
          >
            Anmelden
          </h1>
          <p className="reveal-up stagger-3 mt-3 text-foreground-muted text-center lg:text-left leading-relaxed">
            {isCardScan
              ? "Melde dich an, um CardScan zu nutzen."
              : "Melde dich mit deinem Firmenkonto an."}
          </p>

          {/* Doppelrand-wrapped Form */}
          <div className="reveal-up stagger-4 mt-10 bezel-shell">
            <div className="bezel-core p-6 md:p-7">
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="block text-[10px] font-semibold text-foreground-subtle mb-2 tracking-[0.2em] uppercase font-mono-amount">
                    E-Mail
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 bg-input border border-line rounded-xl text-base text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-all duration-500 ease-fluid min-h-[48px]"
                    placeholder="name@mrumbau.de"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-[10px] font-semibold text-foreground-subtle mb-2 tracking-[0.2em] uppercase font-mono-amount">
                    Passwort
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full pl-4 pr-14 py-3.5 bg-input border border-line rounded-xl text-base text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-all duration-500 ease-fluid min-h-[48px]"
                      placeholder="Passwort eingeben"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                      aria-pressed={showPassword}
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-surface-hover transition-colors duration-300 ease-fluid min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 3l18 18" />
                          <path d="M10.5 10.5a2.5 2.5 0 003.4 3.4" />
                          <path d="M5.5 6.5C3 8.3 2 12 2 12s3.5 7 10 7c2 0 3.7-.6 5.1-1.5" />
                          <path d="M8 4.5c1.2-.3 2.5-.5 4-.5 6.5 0 10 7 10 7s-1 1.7-2.7 3.4" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div role="alert" aria-live="polite" className="flex items-start gap-2 p-3 bg-error-bg border border-error-border rounded-xl">
                    <svg className="w-4 h-4 text-error mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                    <p className="text-[14px] text-error">{error}</p>
                  </div>
                )}

                {/* Magnetic Submit-Button mit Button-in-Button trailing arrow */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`group w-full relative overflow-hidden rounded-full pl-6 pr-2 py-2 text-[16px] font-semibold text-foreground-inverse flex items-center justify-between gap-3 transition-transform duration-500 ease-fluid active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] min-h-[56px] ${
                    isCardScan ? "bg-sidebar hover:bg-sidebar-hover" : "bg-brand hover:bg-brand-light"
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {loading && (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {loading ? "Wird angemeldet …" : "Anmelden"}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ease-fluid group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105 ${
                      isCardScan ? "bg-cs-accent/15 group-hover:bg-cs-accent/25" : "bg-white/15 group-hover:bg-white/22"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.75}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                  {/* Sheen-Sweep */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-fluid bg-gradient-to-r from-transparent via-white/12 to-transparent"
                  />
                </button>
              </form>
            </div>
          </div>

          {/* Akzent-Linie + URL-Label */}
          <div className={`reveal-up stagger-7 mt-10 mb-4 h-px ${
            isCardScan
              ? "bg-gradient-to-r from-transparent via-cs-accent/15 to-transparent"
              : "bg-gradient-to-r from-transparent via-brand/15 to-transparent"
          }`} aria-hidden="true" />

          <div className="reveal-up stagger-8 flex items-center justify-center">
            <span className="text-[10px] text-foreground-faint tracking-[0.2em] uppercase font-mono-amount">
              cloud.mrumbau.de
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
