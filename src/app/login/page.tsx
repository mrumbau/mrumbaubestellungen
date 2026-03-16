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

    // Rolle holen und weiterleiten
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#1E4D8C]">MR Umbau</h1>
            <p className="text-sm text-slate-500 mt-1">Bestellmanagement</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
                placeholder="name@mrumbau.de"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1E4D8C] text-white rounded-lg font-medium hover:bg-[#2E6BAD] transition-colors disabled:opacity-50"
            >
              {loading ? "Wird angemeldet..." : "Anmelden"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
