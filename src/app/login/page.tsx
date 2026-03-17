"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

      let ziel = "/bestellungen";
      if (profil?.rolle === "buchhaltung") {
        ziel = "/buchhaltung";
      } else if (profil?.rolle === "admin") {
        ziel = "/dashboard";
      }

      router.refresh();
      router.push(ziel);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Brand Panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-mr-gradient relative overflow-hidden flex-col justify-between p-12">
        {/* Layered patterns for depth */}
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute inset-0 bg-diagonal-lines" />
        <div className="absolute inset-0 bg-iso-grid" />

        {/* Geometric corner accent – industrielle Winkel-Linien */}
        <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.07]">
          <svg viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="80" y1="0" x2="320" y2="240" stroke="white" strokeWidth="0.75" />
            <line x1="120" y1="0" x2="320" y2="200" stroke="white" strokeWidth="0.75" />
            <line x1="160" y1="0" x2="320" y2="160" stroke="white" strokeWidth="0.75" />
            <line x1="200" y1="0" x2="320" y2="120" stroke="white" strokeWidth="0.75" />
            <line x1="240" y1="0" x2="320" y2="80" stroke="white" strokeWidth="0.75" />
            <line x1="320" y1="80" x2="80" y2="320" stroke="white" strokeWidth="0.5" />
            <line x1="320" y1="160" x2="160" y2="320" stroke="white" strokeWidth="0.5" />
            <line x1="320" y1="240" x2="240" y2="320" stroke="white" strokeWidth="0.5" />
            <rect x="280" y="0" width="40" height="3" fill="white" opacity="0.4" />
            <rect x="317" y="0" width="3" height="40" fill="white" opacity="0.4" />
          </svg>
        </div>

        {/* Untere linke Ecke – spiegelverkehrt */}
        <div className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.05]">
          <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="160" x2="160" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="120" x2="120" y2="0" stroke="white" strokeWidth="0.75" />
            <rect x="0" y="197" width="30" height="3" fill="white" opacity="0.4" />
            <rect x="0" y="170" width="3" height="30" fill="white" opacity="0.4" />
          </svg>
        </div>

        {/* Horizontale Akzentlinien – subtile Tiefe */}
        <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <Logo size={56} color="#ffffff" />
        </div>

        {/* Haupttext + Motto */}
        <div className="relative z-10 max-w-md">
          <h2 className="font-headline text-5xl text-white leading-[1.1] tracking-tight">
            Digitales
            <br />
            Bestell<span className="text-white/40">management</span>
          </h2>

          {/* Dünne rote Trennlinie */}
          <div className="w-16 h-[2px] bg-white/20 mt-6 mb-5" />

          {/* Firmenmotto */}
          <p className="font-headline text-lg text-white/60 tracking-tight">
            Präzise. Robust. Digital.
          </p>
          <p className="text-white/30 mt-3 text-sm leading-relaxed max-w-xs">
            Automatische Dokumentenerkennung. KI-gestützter Abgleich.
            Vollständige Kontrolle über jeden Bestellprozess.
          </p>

          {/* Feature-Punkte mit Winkel-Markierungen */}
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
            <Logo size={40} color="#570006" />
          </div>

          <div>
            <h2 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Anmelden</h2>
            <p className="text-sm text-[#9a9a9a] mt-2">
              Melde dich mit deinem Firmenkonto an.
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
              className="btn-primary w-full py-3.5 rounded-lg text-sm disabled:opacity-50 active:scale-[0.98]"
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

          {/* Dünne rote Akzentlinie */}
          <div className="red-accent-line mt-10 mb-4" />

          <div className="flex items-center justify-center">
            <span className="text-[10px] text-[#c4c2bf] tracking-widest uppercase font-mono-amount">cloud.mrumbau.de</span>
          </div>
        </div>
      </div>
    </div>
  );
}
