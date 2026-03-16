"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

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
      <div className="hidden lg:flex lg:w-[45%] bg-mr-gradient bg-grid-pattern relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 bg-diagonal-lines" />

        {/* Geometric corner accent */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
          <svg viewBox="0 0 200 200" fill="none">
            <line x1="0" y1="0" x2="200" y2="200" stroke="white" strokeWidth="0.5" />
            <line x1="50" y1="0" x2="200" y2="150" stroke="white" strokeWidth="0.5" />
            <line x1="100" y1="0" x2="200" y2="100" stroke="white" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="150" y2="200" stroke="white" strokeWidth="0.5" />
            <line x1="0" y1="100" x2="100" y2="200" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg flex items-center justify-center">
              <span className="font-headline text-2xl text-white font-bold tracking-tight">MR</span>
            </div>
            <div>
              <h1 className="font-headline text-3xl text-white tracking-tight">UMBAU</h1>
              <div className="h-px w-16 bg-white/30 mt-1" />
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-headline text-5xl text-white leading-tight tracking-tight">
            Digitales
            <br />
            Bestell<span className="text-white/50">management</span>
          </h2>
          <p className="text-white/40 mt-6 text-sm leading-relaxed max-w-xs">
            Automatische Dokumentenerkennung. KI-gestützter Abgleich.
            Vollständige Kontrolle über jeden Bestellprozess.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-white/20 text-xs tracking-widest uppercase">MR Umbau GmbH</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#f5f4f2]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-[#570006] rounded-lg flex items-center justify-center">
              <span className="font-headline text-lg text-white font-bold">MR</span>
            </div>
            <span className="font-headline text-xl text-[#1a1a1a] tracking-tight">UMBAU</span>
          </div>

          <div>
            <h2 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Anmelden</h2>
            <p className="text-sm text-[#9a9a9a] mt-2">
              Melde dich mit deinem Firmenkonto an.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-2 tracking-wide uppercase">
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
              <label className="block text-xs font-medium text-[#6b6b6b] mb-2 tracking-wide uppercase">
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
              className="w-full py-3.5 bg-[#570006] text-white rounded-lg font-semibold text-sm hover:bg-[#7a1a1f] transition-all disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 spinner" />
                  Wird angemeldet...
                </span>
              ) : (
                "Anmelden"
              )}
            </button>
          </form>

          <div className="mt-12 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e8e6e3]" />
            <span className="text-[10px] text-[#c4c2bf] tracking-widest uppercase">cloud.mrumbau.de</span>
            <div className="h-px flex-1 bg-[#e8e6e3]" />
          </div>
        </div>
      </div>
    </div>
  );
}
