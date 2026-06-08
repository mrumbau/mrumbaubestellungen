"use client";

/**
 * Passwort vergessen — Self-Service-Reset (08.06.2026).
 *
 * User gibt seine Mail an, Supabase sendet einen Recovery-Link an die
 * Mailbox. Der Link führt zurück auf /passwort-neu, wo das neue Passwort
 * gesetzt wird (eingebauter Supabase Recovery-Flow).
 *
 * Stil: visuell an Login-Page (bezel + reveal-up + Magnetic-CTA), aber
 * bewusst schlanker — eine einzige Aufgabe.
 *
 * Server-Setup (einmalig im Supabase-Dashboard):
 *   Authentication → URL Configuration → Redirect URLs muss enthalten:
 *     https://cloud.mrumbau.de/passwort-neu
 *     http://localhost:3000/passwort-neu (für lokale Entwicklung)
 *   Sonst ignoriert Supabase die redirectTo-Angabe und nutzt die Default-URL.
 */

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Logo } from "@/components/logo";

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/passwort-neu`,
    });

    setLoading(false);

    if (resetErr) {
      // 08.06.2026 — Defensiv: bei Fehlern liefert Supabase Details, aber wir
      // zeigen aus Sicherheitsgründen NICHT „User existiert nicht" o.ä. — das
      // wäre Enumeration. Generische Erfolgs-Meldung bleibt der korrekte Weg.
      // Echte Server-Fehler (Rate-Limit etc.) zeigen wir aber an.
      const msg = resetErr.message?.toLowerCase() ?? "";
      if (msg.includes("rate") || msg.includes("limit")) {
        setError("Zu viele Versuche. Bitte ein paar Minuten warten.");
      } else {
        // Sonstige Fehler werden behandelt wie Erfolg — verhindert Account-Enum
        setSuccess(true);
      }
      return;
    }

    setSuccess(true);
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* Brand-Panel — bewusst identisch zum Login-Stil, nur kürzer */}
      <aside className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 bg-mr-gradient">
        <div className="absolute inset-0 film-grain opacity-30" />
        <div className="reveal-up stagger-1 relative z-10">
          <Logo className="w-32 h-auto text-foreground-inverse" />
        </div>
        <div className="reveal-up stagger-3 relative z-10">
          <span className="text-[10px] text-foreground-inverse/60 tracking-[0.2em] uppercase font-mono-amount">
            Sicherer Self-Service-Reset
          </span>
        </div>
      </aside>

      {/* Form-Panel */}
      <section className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-canvas relative overflow-hidden">
        <div className="absolute inset-0 film-grain opacity-20" aria-hidden="true" />
        <div className="w-full max-w-md relative z-10">
          {/* Mobile-Logo */}
          <div className="lg:hidden reveal-up flex justify-center mb-8">
            <Logo className="w-24 h-auto text-brand" />
          </div>

          <div className="reveal-up stagger-1 flex justify-center lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
              <span className="text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
                Passwort zurücksetzen
              </span>
            </span>
          </div>

          <h1
            className="reveal-up stagger-2 mt-5 font-headline text-foreground tracking-[-0.02em] leading-[0.95] text-center lg:text-left"
            style={{ fontSize: "clamp(32px, 4vw, 44px)" }}
          >
            Passwort vergessen
          </h1>
          <p className="reveal-up stagger-3 mt-3 text-foreground-muted text-center lg:text-left leading-relaxed">
            Trag deine Firmen-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du dir ein neues Passwort vergibst.
          </p>

          <div className="reveal-up stagger-4 mt-10 bezel-shell">
            <div className="bezel-core p-6 md:p-7">
              {success ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-success-bg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-success"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-foreground text-[15px]">
                    Wenn ein Account mit dieser Mail existiert, ist gerade eine
                    Reset-Mail unterwegs. Schau ins Postfach (auch Spam) und
                    klick auf den Link.
                  </p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-[14px] text-brand hover:text-brand-light transition-colors underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded"
                  >
                    ← Zurück zum Login
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="reset-email"
                      className="block text-[10px] font-semibold text-foreground-subtle mb-2 tracking-[0.2em] uppercase font-mono-amount"
                    >
                      E-Mail
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-4 py-3.5 bg-input border border-line rounded-xl text-base text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-[border-color,box-shadow] duration-200 ease-fluid min-h-[48px]"
                      placeholder="name@mrumbau.de"
                    />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="flex items-start gap-2 p-3 bg-error-bg border border-error-border rounded-xl"
                    >
                      <svg
                        className="w-4 h-4 text-error mt-0.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                      <p className="text-[14px] text-error">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="group w-full relative overflow-hidden rounded-full pl-6 pr-2 py-2 text-[16px] font-semibold text-foreground-inverse flex items-center justify-between gap-3 transition-[background-color,transform] duration-200 ease-fluid active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] min-h-[56px] bg-brand hover:bg-brand-light"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {loading && (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {loading ? "Wird gesendet …" : "Reset-Link senden"}
                    </span>
                    <span
                      aria-hidden="true"
                      className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-white/15 group-hover:bg-white/22 transition-[background-color,transform] duration-200 ease-fluid group-hover:translate-x-1"
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
                  </button>

                  <div className="text-center">
                    <Link
                      href="/login"
                      className="text-[12px] text-foreground-subtle hover:text-foreground transition-colors duration-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded"
                    >
                      ← Zurück zum Login
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="reveal-up stagger-8 mt-10 flex items-center justify-center">
            <span className="text-[10px] text-foreground-faint tracking-[0.2em] uppercase font-mono-amount">
              cloud.mrumbau.de
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
