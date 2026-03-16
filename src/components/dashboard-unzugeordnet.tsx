"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDatum, formatBetrag } from "@/lib/formatters";

interface UnzugeordneteBestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  waehrung: string;
  status: string;
  created_at: string;
}

interface Besteller {
  kuerzel: string;
  name: string;
}

export function DashboardUnzugeordnet({
  bestellungen,
  besteller,
}: {
  bestellungen: UnzugeordneteBestellung[];
  besteller: Besteller[];
}) {
  const [items, setItems] = useState(bestellungen);
  const [zuordnungId, setZuordnungId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (items.length === 0) return null;

  async function zuordnen(bestellungId: string, kuerzel: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/bestellungen/zuordnen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId, besteller_kuerzel: kuerzel }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((b) => b.id !== bestellungId));
        setZuordnungId(null);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 border-l-[3px] border-l-[#d97706]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Nicht zugeordnet</h2>
          <span className="font-mono-amount text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            {items.length}
          </span>
        </div>
      </div>

      <p className="text-xs text-[#9a9a9a] mb-3">
        Diese Bestellungen konnten keinem Besteller zugeordnet werden.
      </p>

      <div className="space-y-2">
        {items.map((b) => (
          <div key={b.id} className="bg-amber-50/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Link
                href={`/bestellungen/${b.id}`}
                className="flex-1 group"
              >
                <p className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#570006] transition-colors">
                  <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                  <span className="text-[#9a9a9a] font-normal"> – {b.haendler_name || "Unbekannt"}</span>
                </p>
                <p className="text-[11px] text-[#c4c2bf]">
                  {formatDatum(b.created_at)}
                  {b.betrag ? ` · ${formatBetrag(b.betrag, b.waehrung || "EUR")}` : ""}
                </p>
              </Link>

              {zuordnungId === b.id ? (
                <div className="flex items-center gap-1.5">
                  {besteller.map((be) => (
                    <button
                      key={be.kuerzel}
                      onClick={() => zuordnen(b.id, be.kuerzel)}
                      disabled={loading}
                      className="w-8 h-8 rounded-lg bg-[#570006] text-white text-[10px] font-bold hover:bg-[#7a1a1f] disabled:opacity-50 transition-colors"
                      title={be.name}
                    >
                      {be.kuerzel}
                    </button>
                  ))}
                  <button
                    onClick={() => setZuordnungId(null)}
                    className="w-8 h-8 rounded-lg bg-[#f0eeeb] text-[#9a9a9a] text-xs hover:bg-[#e8e6e3] transition-colors"
                    title="Abbrechen"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setZuordnungId(b.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Zuordnen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
