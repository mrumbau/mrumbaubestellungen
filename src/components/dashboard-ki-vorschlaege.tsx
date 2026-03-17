"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface KiVorschlag {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  projekt_vorschlag_konfidenz: number | null;
  projekt_vorschlag_methode: string | null;
  projekt_vorschlag_begruendung: string | null;
  vorschlag_projekt_name: string | null;
  vorschlag_projekt_farbe: string | null;
  lieferadresse_erkannt: string | null;
}

const METHODEN_LABELS: Record<string, string> = {
  lieferadresse: "Lieferadresse",
  kundenname: "Kundenname",
  projektname_text: "Projektname im Text",
  besteller_affinitaet: "Besteller-Muster",
};

export function DashboardKiVorschlaege({
  vorschlaege,
}: {
  vorschlaege: KiVorschlag[];
}) {
  const [items, setItems] = useState(vorschlaege);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  if (items.length === 0) return null;

  async function handleAktion(bestellungId: string, aktion: "bestaetigen" | "ablehnen") {
    setLoading(bestellungId);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/projekt-bestaetigen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((v) => v.id !== bestellungId));
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card p-5 border-l-[3px] border-l-[#d97706]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">KI-Projekt-Vorschläge</h2>
          <span className="font-mono-amount text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            {items.length}
          </span>
        </div>
      </div>

      <p className="text-xs text-[#9a9a9a] mb-3">
        Diese Bestellungen wurden automatisch einem Projekt zugeordnet. Bitte prüfen und bestätigen.
      </p>

      <div className="space-y-2">
        {items.map((v) => (
          <div key={v.id} className="bg-amber-50/50 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    href={`/bestellungen/${v.id}`}
                    className="text-sm font-medium text-[#1a1a1a] hover:text-[#570006] transition-colors"
                  >
                    {v.bestellnummer || "–"}
                  </Link>
                  {v.haendler_name && (
                    <span className="text-[10px] text-[#c4c2bf]">{v.haendler_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: v.vorschlag_projekt_farbe || "#570006" }}
                  />
                  <span className="text-xs font-medium text-[#6b6b6b]">
                    {v.vorschlag_projekt_name || "–"}
                  </span>
                  <span className="font-mono-amount text-[10px] text-amber-700 font-bold">
                    {Math.round((v.projekt_vorschlag_konfidenz || 0) * 100)}%
                  </span>
                  <span className="text-[10px] text-[#c4c2bf]">
                    {METHODEN_LABELS[v.projekt_vorschlag_methode || ""] || v.projekt_vorschlag_methode}
                  </span>
                </div>
                {v.lieferadresse_erkannt && (
                  <p className="text-[10px] text-[#c4c2bf] truncate">{v.lieferadresse_erkannt}</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                <button
                  onClick={() => handleAktion(v.id, "bestaetigen")}
                  disabled={loading === v.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  OK
                </button>
                <button
                  onClick={() => handleAktion(v.id, "ablehnen")}
                  disabled={loading === v.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#9a9a9a] bg-[#f0eeeb] rounded-lg hover:bg-[#e8e6e3] transition-colors disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <Link
                  href={`/bestellungen/${v.id}`}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#9a9a9a] bg-[#f0eeeb] rounded-lg hover:bg-[#e8e6e3] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
