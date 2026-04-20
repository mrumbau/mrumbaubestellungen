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

type AktionModus = null | "zuordnen" | "verwerfen" | "blockieren";

export function DashboardUnzugeordnet({
  bestellungen,
  besteller,
}: {
  bestellungen: UnzugeordneteBestellung[];
  besteller: Besteller[];
}) {
  const [items, setItems] = useState(bestellungen);
  const [aktionId, setAktionId] = useState<string | null>(null);
  const [aktionModus, setAktionModus] = useState<AktionModus>(null);
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (items.length === 0) return null;

  function openAktion(id: string, modus: AktionModus) {
    setAktionId(id);
    setAktionModus(modus);
  }

  function closeAktion() {
    setAktionId(null);
    setAktionModus(null);
  }

  async function zuordnen(bestellungId: string, kuerzel: string) {
    setLoading(true);
    setFehler(null);
    try {
      const res = await fetch("/api/bestellungen/zuordnen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId, besteller_kuerzel: kuerzel }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((b) => b.id !== bestellungId));
        closeAktion();
      } else {
        setFehler("Zuordnung fehlgeschlagen");
      }
    } finally {
      setLoading(false);
    }
  }

  async function verwerfen(bestellungId: string) {
    setLoading(true);
    setFehler(null);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((b) => b.id !== bestellungId));
        closeAktion();
      } else {
        setFehler("Verwerfen fehlgeschlagen");
      }
    } finally {
      setLoading(false);
    }
  }

  async function blockieren(bestellungId: string, domain: string) {
    setLoading(true);
    try {
      // 1. Domain auf Blacklist setzen
      const blRes = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: domain, typ: "domain", grund: "Manuell blockiert vom Dashboard" }),
      });
      if (!blRes.ok) {
        setFehler("Blacklist-Eintrag fehlgeschlagen");
        return;
      }

      // 2. Alle Bestellungen mit dieser Domain verwerfen (inkl. aktuelle)
      const zuVerwerfen = items.filter((b) => b.haendler_name === domain);
      const verworfenIds: string[] = [];
      for (const b of zuVerwerfen) {
        const res = await fetch("/api/bestellungen/verwerfen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellung_id: b.id }),
        });
        if (res.ok) verworfenIds.push(b.id);
      }

      // UI aktualisieren — nur erfolgreich verworfene entfernen
      if (verworfenIds.length > 0) {
        setItems((prev) => prev.filter((b) => !verworfenIds.includes(b.id)));
      }
      closeAktion();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center">
            <svg className="w-4 h-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h3 className="font-headline text-sm text-foreground tracking-tight">Nicht zugeordnet</h3>
        </div>
      </div>

      <p className="text-xs text-foreground-subtle mb-3">
        Diese Bestellungen konnten keinem Besteller zugeordnet werden.
      </p>

      {fehler && (
        <p className="text-xs text-error bg-error-bg rounded px-2 py-1 mb-2">{fehler}</p>
      )}

      <div className="space-y-2">
        {items.map((b) => (
          <div key={b.id} className="bg-canvas rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Link
                href={`/bestellungen/${b.id}`}
                className="flex-1 group"
              >
                <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">
                  <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                  <span className="text-foreground-subtle font-normal"> – {b.haendler_name || "Unbekannt"}</span>
                </p>
                <p className="text-[11px] text-foreground-faint">
                  {formatDatum(b.created_at)}
                  {b.betrag ? ` · ${formatBetrag(b.betrag, b.waehrung || "EUR")}` : ""}
                </p>
              </Link>

              {aktionId === b.id && aktionModus === "zuordnen" ? (
                <div className="flex items-center gap-1.5">
                  {besteller.map((be) => (
                    <button
                      key={be.kuerzel}
                      onClick={() => zuordnen(b.id, be.kuerzel)}
                      disabled={loading}
                      className="w-8 h-8 rounded-lg bg-brand text-white text-[10px] font-bold hover:bg-brand-light disabled:opacity-50 transition-colors"
                      title={be.name}
                    >
                      {be.kuerzel}
                    </button>
                  ))}
                  <button
                    onClick={closeAktion}
                    className="w-8 h-8 rounded-lg bg-line-subtle text-foreground-subtle text-xs hover:bg-line transition-colors"
                    title="Abbrechen"
                  >
                    &times;
                  </button>
                </div>
              ) : aktionId === b.id && aktionModus === "verwerfen" ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-error">Löschen?</span>
                  <button
                    onClick={() => verwerfen(b.id)}
                    disabled={loading}
                    className="px-2 py-1 text-[10px] font-bold text-white bg-error rounded hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    Ja
                  </button>
                  <button
                    onClick={closeAktion}
                    className="px-2 py-1 text-[10px] font-medium text-foreground-subtle bg-line-subtle rounded hover:bg-line transition-colors"
                  >
                    Nein
                  </button>
                </div>
              ) : aktionId === b.id && aktionModus === "blockieren" ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-error max-w-[120px] truncate">
                    {b.haendler_name} blockieren?
                  </span>
                  <button
                    onClick={() => blockieren(b.id, b.haendler_name || "")}
                    disabled={loading || !b.haendler_name}
                    className="px-2 py-1 text-[10px] font-bold text-white bg-error rounded hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    Ja
                  </button>
                  <button
                    onClick={closeAktion}
                    className="px-2 py-1 text-[10px] font-medium text-foreground-subtle bg-line-subtle rounded hover:bg-line transition-colors"
                  >
                    Nein
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openAktion(b.id, "zuordnen")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand bg-brand/5 rounded-lg hover:bg-brand/10 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Zuordnen
                  </button>
                  <button
                    onClick={() => openAktion(b.id, "verwerfen")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-error bg-error-bg rounded-lg hover:opacity-80 transition-colors"
                    title="Einmalig verwerfen"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Verwerfen
                  </button>
                  <button
                    onClick={() => openAktion(b.id, "blockieren")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-error bg-error-bg border border-error-border rounded-lg hover:opacity-80 transition-colors"
                    title="Absender dauerhaft blockieren (Newsletter/Spam)"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    Blockieren
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
