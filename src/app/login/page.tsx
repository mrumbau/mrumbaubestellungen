"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
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

      // Redirect-Parameter hat Vorrang (von Tool-Auswahl)
      let ziel = redirectTo || "/bestellungen";
      if (!redirectTo) {
        if (profil?.rolle === "buchhaltung") {
          ziel = "/buchhaltung";
        } else if (profil?.rolle === "admin") {
          ziel = "/dashboard";
        }
      }

      router.refresh();
      router.push(ziel);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Brand Panel – kontextabhängig */}
      <div className={`hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 ${
        isCardScan ? "bg-[#141414]" : "bg-mr-gradient"
      }`}>
        {/* Patterns */}
        {isCardScan ? (
          <>
            <div className="absolute inset-0 bg-dot-grid opacity-60" />
            <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/[0.08] to-transparent" />
            <div className="absolute top-[60%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/[0.05] to-transparent" />
            {/* Geometric corner */}
            <div className="absolute top-0 left-0 w-64 h-64 opacity-[0.06]">
              <svg viewBox="0 0 260 260" fill="none">
                <line x1="0" y1="60" x2="200" y2="260" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="100" x2="160" y2="260" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="140" x2="120" y2="260" stroke="white" strokeWidth="0.75" />
                <rect x="0" y="0" width="3" height="40" fill="white" opacity="0.4" />
                <rect x="0" y="0" width="40" height="3" fill="white" opacity="0.4" />
              </svg>
            </div>
            {/* Bottom right circles */}
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
            {/* Geometric corner accent */}
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
            {/* Bottom left corner */}
            <div className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.05]">
              <svg viewBox="0 0 200 200" fill="none">
                <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="160" x2="160" y2="0" stroke="white" strokeWidth="0.75" />
                <line x1="0" y1="120" x2="120" y2="0" stroke="white" strokeWidth="0.75" />
                <rect x="0" y="197" width="30" height="3" fill="white" opacity="0.4" />
                <rect x="0" y="170" width="3" height="30" fill="white" opacity="0.4" />
              </svg>
            </div>
            {/* Horizontal accent lines */}
            <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
          </>
        )}

        {/* Logo */}
        <div className="relative z-10">
          {isCardScan ? (
            <div className="flex items-center gap-3">
              <Logo size={44} color="#ffffff" />
              <div className="h-5 w-px bg-white/10" />
              <span className="text-[10px] text-white/20 tracking-[0.15em] uppercase font-mono-amount">Scan</span>
            </div>
          ) : (
            <Logo size={56} color="#ffffff" />
          )}
        </div>

        {/* Content – kontextabhängig */}
        <div className="relative z-10 max-w-md">
          {isCardScan ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded border border-emerald-500/30 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  </svg>
                </div>
                <span className="text-[10px] text-white/30 tracking-[0.15em] uppercase font-mono-amount">Modul 02</span>
              </div>

              <h2 className="font-headline text-5xl text-white leading-[1.1] tracking-tight">
                Card<span className="text-emerald-500/50">Scan</span>
              </h2>

              <div className="w-12 h-[2px] bg-emerald-500/20 mt-6 mb-5" />

              <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                Kontaktdaten aus Visitenkarten, E-Mails, Webseiten erfassen und direkt ins CRM übertragen.
              </p>

              <div className="mt-8 space-y-2.5">
                {["Foto & Kamera", "Text & Clipboard", "URL & Dateien", "Dual-CRM Write"].map((label, i) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-5 h-5 border border-emerald-500/15 rounded flex items-center justify-center">
                      <span className="font-mono-amount text-[9px] text-emerald-500/40">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <span className="text-white/35 text-xs tracking-wide">{label}</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <svg className="w-3 h-3 text-emerald-500/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-headline text-5xl text-white leading-[1.1] tracking-tight">
                Digitales
                <br />
                Bestell<span className="text-white/40">management</span>
              </h2>

              <div className="w-16 h-[2px] bg-white/20 mt-6 mb-5" />

              <p className="font-headline text-lg text-white/60 tracking-tight">
                Präzise. Robust. Digital.
              </p>
              <p className="text-white/30 mt-3 text-sm leading-relaxed max-w-xs">
                Automatische Dokumentenerkennung. KI-gestützter Abgleich.
                Vollständige Kontrolle über jeden Bestellprozess.
              </p>

              <div className="mt-8 space-y-2.5">
                {["Bestellbestätigung", "Lieferschein", "Rechnung"].map((label, i) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-5 h-5 border border-white/20 rounded flex items-center justify-center">
                      <span className="font-mono-amount text-[9px] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <span className="text-white/40 text-xs tracking-wide">{label}</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-white/20 text-[10px] tracking-[0.15em] uppercase font-mono-amount">MR Umbau GmbH · 2026</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#f5f4f2]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-12">
            <Logo size={40} color={isCardScan ? "#141414" : "#570006"} />
          </div>

          <div>
            <h2 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Anmelden</h2>
            <p className="text-sm text-[#9a9a9a] mt-2">
              {isCardScan
                ? "Melde dich an um CardScan zu nutzen."
                : "Melde dich mit deinem Firmenkonto an."}
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] mb-2 tracking-widest uppercase">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/20 focus:border-[#570006] transition-colors"
                placeholder="name@mrumbau.de"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] mb-2 tracking-widest uppercase">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/20 focus:border-[#570006] transition-colors"
                placeholder="Passwort eingeben"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-all ${
                isCardScan
                  ? "bg-[#141414] hover:bg-[#1f1f1f]"
                  : "btn-primary"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Wird angemeldet...
                </span>
              ) : (
                "Anmelden"
              )}
            </button>
          </form>

          {/* Dünne Akzentlinie */}
          <div className={`mt-10 mb-4 h-px ${
            isCardScan
              ? "bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"
              : "bg-gradient-to-r from-transparent via-[#570006]/10 to-transparent"
          }`} />

          <div className="flex items-center justify-center">
            <span className="text-[10px] text-[#c4c2bf] tracking-widest uppercase font-mono-amount">cloud.mrumbau.de</span>
          </div>
        </div>
      </div>
    </div>
  );
}
