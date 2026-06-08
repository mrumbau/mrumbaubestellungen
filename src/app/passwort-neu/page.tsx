"use client";

/**
 * Neues Passwort setzen — Recovery-Landing-Page (08.06.2026).
 *
 * Reset-Mail-Link aus /passwort-vergessen führt hierher. Supabase setzt
 * die Recovery-Session bereits beim Klick auf den Link auf, der User-Token
 * wird in den Cookies des @supabase/ssr Browser-Clients verfügbar.
 *
 * Wir checken vor dem Render, dass eine aktive Session existiert. Wenn
 * nicht (z.B. Link expired oder direkt aufgerufen): freundliche Nachricht
 * mit Re-Trigger-Link statt eines stillen Fehlers.
 *
 * Nach erfolgreichem Update: redirect auf /login mit Success-Hint.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Logo } from "@/components/logo";

const MIN_LEN = 8;

export default function PasswortNeuPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"checking" | "valid" | "missing">("checking");

  // Beim Mount: prüfen ob Recovery-Session vorhanden. Supabase setzt sie
  // automatisch wenn der Recovery-Link geklickt wurde.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionStatus(data.session ? "valid" : "missing");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_LEN) {
      setError(`Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`);
      return;
    }
    if (password !== confirm) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updErr) {
      const msg = updErr.message?.toLowerCase() ?? "";
      if (msg.includes("session") || msg.includes("token")) {
        setError("Der Reset-Link ist abgelaufen. Bitte fordere einen neuen an.");
      } else if (msg.includes("password") && msg.includes("short")) {
        setError(`Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`);
      } else if (msg.includes("same")) {
        setError("Das neue Passwort darf nicht mit dem alten identisch sein.");
      } else {
        setError(`Passwort konnte nicht gesetzt werden: ${updErr.message}`);
      }
      return;
    }

    setSuccess(true);
    // Kurz Erfolgsanzeige, dann redirect — User soll bewusst loggen
    setTimeout(() => {
      router.replace("/login");
    }, 2500);
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      <aside className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 bg-mr-gradient">
        <div className="absolute inset-0 film-grain opacity-30" />
        <div className="reveal-up stagger-1 relative z-10">
          <Logo className="w-32 h-auto text-foreground-inverse" />
        </div>
        <div className="reveal-up stagger-3 relative z-10">
          <span className="text-[10px] text-foreground-inverse/60 tracking-[0.2em] uppercase font-mono-amount">
            Neues Passwort vergeben
          </span>
        </div>
      </aside>

      <section className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-canvas relative overflow-hidden">
        <div className="absolute inset-0 film-grain opacity-20" aria-hidden="true" />
        <div className="w-full max-w-md relative z-10">
          <div className="lg:hidden reveal-up flex justify-center mb-8">
            <Logo className="w-24 h-auto text-brand" />
          </div>

          <div className="reveal-up stagger-1 flex justify-center lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
              <span className="text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
                Letzter Schritt
              </span>
            </span>
          </div>

          <h1
            className="reveal-up stagger-2 mt-5 font-headline text-foreground tracking-[-0.02em] leading-[0.95] text-center lg:text-left"
            style={{ fontSize: "clamp(32px, 4vw, 44px)" }}
          >
            Neues Passwort
          </h1>

          <div className="reveal-up stagger-4 mt-10 bezel-shell">
            <div className="bezel-core p-6 md:p-7">
              {sessionStatus === "checking" && (
                <div className="text-center py-6">
                  <div className="inline-block w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                  <p className="text-foreground-muted text-[14px] mt-3">Reset-Link wird geprüft …</p>
                </div>
              )}

              {sessionStatus === "missing" && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-warning-bg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-warning"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.5a9 9 0 11-9 9 9 9 0 019-9zm0 13.5h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-foreground text-[15px]">
                    Der Reset-Link ist abgelaufen oder ungültig.
                  </p>
                  <Link
                    href="/passwort-vergessen"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-foreground-inverse text-[14px] font-semibold hover:bg-brand-light transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                  >
                    Neuen Link anfordern
                  </Link>
                </div>
              )}

              {sessionStatus === "valid" && success && (
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
                    Passwort gespeichert. Du wirst gleich zum Login weitergeleitet.
                  </p>
                </div>
              )}

              {sessionStatus === "valid" && !success && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-[10px] font-semibold text-foreground-subtle mb-2 tracking-[0.2em] uppercase font-mono-amount"
                    >
                      Neues Passwort
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        minLength={MIN_LEN}
                        autoFocus
                        className="w-full pl-4 pr-14 py-3.5 bg-input border border-line rounded-xl text-base text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-[border-color,box-shadow] duration-200 ease-fluid min-h-[48px]"
                        placeholder={`Mindestens ${MIN_LEN} Zeichen`}
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

                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-[10px] font-semibold text-foreground-subtle mb-2 tracking-[0.2em] uppercase font-mono-amount"
                    >
                      Passwort bestätigen
                    </label>
                    <input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      autoComplete="new-password"
                      minLength={MIN_LEN}
                      className="w-full px-4 py-3.5 bg-input border border-line rounded-xl text-base text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-[border-color,box-shadow] duration-200 ease-fluid min-h-[48px]"
                      placeholder="Nochmal eintippen"
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
                    disabled={loading || !password || !confirm}
                    className="group w-full relative overflow-hidden rounded-full pl-6 pr-2 py-2 text-[16px] font-semibold text-foreground-inverse flex items-center justify-between gap-3 transition-[background-color,transform] duration-200 ease-fluid active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] min-h-[56px] bg-brand hover:bg-brand-light"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {loading && (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {loading ? "Wird gespeichert …" : "Neues Passwort speichern"}
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  </button>
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
