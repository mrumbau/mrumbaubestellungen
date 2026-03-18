"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function PasswortAendern() {
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [bestaetigung, setBestaetigung] = useState("");
  const [loading, setLoading] = useState(false);
  const [meldung, setMeldung] = useState<{ typ: "erfolg" | "fehler"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMeldung(null);

    if (neuesPasswort.length < 8) {
      setMeldung({ typ: "fehler", text: "Passwort muss mindestens 8 Zeichen lang sein." });
      return;
    }

    if (neuesPasswort !== bestaetigung) {
      setMeldung({ typ: "fehler", text: "Passwörter stimmen nicht überein." });
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: neuesPasswort });

      if (error) {
        setMeldung({ typ: "fehler", text: error.message });
      } else {
        setMeldung({ typ: "erfolg", text: "Passwort erfolgreich geändert." });
        setNeuesPasswort("");
        setBestaetigung("");
      }
    } catch {
      setMeldung({ typ: "fehler", text: "Ein Fehler ist aufgetreten." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8e6e3] p-6">
      <h2 className="text-lg font-semibold text-[#1a1a1a] mb-1">Passwort ändern</h2>
      <p className="text-sm text-[#1a1a1a]/50 mb-6">Geben Sie ein neues Passwort ein (mindestens 8 Zeichen).</p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label htmlFor="neues-passwort" className="block text-sm font-medium text-[#1a1a1a]/70 mb-1.5">
            Neues Passwort
          </label>
          <input
            id="neues-passwort"
            type="password"
            value={neuesPasswort}
            onChange={(e) => setNeuesPasswort(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#e8e6e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#570006]/20 focus:border-[#570006]/40"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="bestaetigung" className="block text-sm font-medium text-[#1a1a1a]/70 mb-1.5">
            Passwort bestätigen
          </label>
          <input
            id="bestaetigung"
            type="password"
            value={bestaetigung}
            onChange={(e) => setBestaetigung(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#e8e6e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#570006]/20 focus:border-[#570006]/40"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {meldung && (
          <div className={`text-sm px-3 py-2 rounded-lg ${
            meldung.typ === "erfolg"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {meldung.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-[#570006] rounded-lg hover:bg-[#570006]/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Wird gespeichert…" : "Passwort ändern"}
        </button>
      </form>
    </div>
  );
}
