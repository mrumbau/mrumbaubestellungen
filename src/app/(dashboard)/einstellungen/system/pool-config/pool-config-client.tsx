"use client";

/**
 * PoolConfigClient — Admin-Form für Pool-2.0-Auto-Claim + Score-Gewichte.
 *
 * 03.06.2026 (Pool 2.0 Sprint 3):
 *   - Toggle, Slider, Multi-Select für die Auto-Claim-Konfiguration
 *   - 5 normierte Slider für die Score-Gewichte (Sum-Anzeige zur Orientierung)
 *   - Speichert via PUT /api/pool/config (idempotent Patch via firma_einstellungen)
 *   - Optimistic UI + Toast bei Save
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui";
import { DEFAULT_POOL_SCORE_WEIGHTS, type PoolScoreWeights } from "@/lib/pool-score";

interface InitialState {
  enabled: boolean;
  threshold: number;
  methods: string[];
  weightsRaw: string;
  topXThreshold: number;
}

const METHODS_AVAILABLE = [
  { value: "besteller_im_dokument", label: "Besteller im Dokument (klassischer Name-Match)" },
  { value: "name_im_text", label: "Name im Mail-Text (Volltext-Match)" },
  { value: "haendler_affinitaet", label: "Händler-Affinität (historisch ≥60%)" },
  { value: "ki_historisch", label: "KI-Historisch (Artikel-Vergleich)" },
] as const;

function parseWeights(raw: string): PoolScoreWeights {
  try {
    const parsed = JSON.parse(raw || "{}");
    return {
      age: typeof parsed.age === "number" ? parsed.age : DEFAULT_POOL_SCORE_WEIGHTS.age,
      urgency: typeof parsed.urgency === "number" ? parsed.urgency : DEFAULT_POOL_SCORE_WEIGHTS.urgency,
      vorschlag_konf:
        typeof parsed.vorschlag_konf === "number" ? parsed.vorschlag_konf : DEFAULT_POOL_SCORE_WEIGHTS.vorschlag_konf,
      projekt_aff:
        typeof parsed.projekt_aff === "number" ? parsed.projekt_aff : DEFAULT_POOL_SCORE_WEIGHTS.projekt_aff,
      vendor_aff:
        typeof parsed.vendor_aff === "number" ? parsed.vendor_aff : DEFAULT_POOL_SCORE_WEIGHTS.vendor_aff,
    };
  } catch {
    return { ...DEFAULT_POOL_SCORE_WEIGHTS };
  }
}

export function PoolConfigClient({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [methods, setMethods] = useState<string[]>(initial.methods);
  const [weights, setWeights] = useState<PoolScoreWeights>(parseWeights(initial.weightsRaw));
  const [topX, setTopX] = useState(initial.topXThreshold);

  const sumWeights =
    weights.age + weights.urgency + weights.vorschlag_konf + weights.projekt_aff + weights.vendor_aff;

  function toggleMethod(m: string) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/pool/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          threshold,
          methods,
          weights,
          top_x_threshold: topX,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || json.success !== true) {
        toast.error("Speichern fehlgeschlagen", { description: json.error });
        return;
      }
      toast.success("Pool-Konfiguration gespeichert");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Auto-Claim-Block */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <header className="mb-3">
          <h2 className="font-headline text-[16px] tracking-tight text-foreground">Auto-Claim</h2>
          <p className="mt-0.5 text-[13px] text-foreground-muted">
            Wenn aktiv, übernimmt die Pipeline UNBEKANNT-Material-Bestellungen automatisch wenn die
            Vorschlag-Konfidenz die Schwelle erreicht und die Methode in der Whitelist steht. Cron
            läuft alle 5 Minuten. Owner erhält 24h-Korrekturfenster.
          </p>
        </header>

        <label className="flex items-center gap-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand/20"
          />
          <span className="text-[14px] text-foreground">Auto-Claim aktiviert</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-[12px] font-medium text-foreground-muted uppercase tracking-wider mb-1">
              Konfidenz-Schwelle
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-brand"
              />
              <span className="font-mono-amount tabular-nums text-[13px] text-foreground min-w-[3.5em] text-right">
                {(threshold * 100).toFixed(0)} %
              </span>
            </div>
            <p className="text-[11px] text-foreground-subtle mt-1">
              Default 95% (sehr konservativ). Hoch genug, dass nur eindeutige Pipeline-Vorschläge
              auto-claimed werden.
            </p>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-foreground-muted uppercase tracking-wider mb-1">
              Methoden-Whitelist
            </label>
            <div className="flex flex-col gap-1.5">
              {METHODS_AVAILABLE.map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer text-[13px]">
                  <input
                    type="checkbox"
                    checked={methods.includes(m.value)}
                    onChange={() => toggleMethod(m.value)}
                    className="h-3.5 w-3.5 rounded border-line text-brand focus:ring-brand/20"
                  />
                  <span className="text-foreground-muted">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Score-Gewichte */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <header className="mb-3">
          <h2 className="font-headline text-[16px] tracking-tight text-foreground">Score-Gewichte</h2>
          <p className="mt-0.5 text-[13px] text-foreground-muted">
            Gewichten die Priorisierung der Pool-Inbox. Score normalisiert auf die Summe — ein höheres
            Gewicht in einer Kategorie macht andere relativ leiser. Default ist auf typisches Triage
            ausgelegt.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {(["age", "urgency", "vorschlag_konf", "projekt_aff", "vendor_aff"] as const).map((key) => (
            <div key={key}>
              <label className="flex items-center justify-between text-[12px] font-medium text-foreground-muted uppercase tracking-wider mb-1">
                <span>{labelFor(key)}</span>
                <span className="font-mono-amount tabular-nums text-foreground">
                  {weights[key].toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: parseFloat(e.target.value) })}
                className="w-full accent-brand"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label className="block text-[12px] font-medium text-foreground-muted uppercase tracking-wider mb-1">
              "Priorität"-Pill-Schwelle
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={topX}
                onChange={(e) => setTopX(parseFloat(e.target.value))}
                className="flex-1 accent-brand"
              />
              <span className="font-mono-amount tabular-nums text-[13px] text-foreground min-w-[3.5em] text-right">
                {topX.toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-foreground-subtle mt-1">
              Items über dieser Score-Schwelle zeigen das "↑ Priorität"-Pill in der Inbox.
            </p>
          </div>
          <div className="flex items-end">
            <p className="text-[11px] text-foreground-subtle">
              Gewichts-Summe:{" "}
              <span className="font-mono-amount text-foreground">{sumWeights.toFixed(2)}</span>
              {" — Score wird intern normalisiert, eine Summe ≠ 1.0 ist OK."}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving} loading={saving}>
          Speichern
        </Button>
      </div>
    </div>
  );
}

function labelFor(key: keyof PoolScoreWeights): string {
  switch (key) {
    case "age": return "Alter (1 - exp(-Δd/7))";
    case "urgency": return "Dringend (Mahnung > Fälligkeit)";
    case "vorschlag_konf": return "Pipeline-Vorschlag-Konfidenz";
    case "projekt_aff": return "Projekt-Affinität (User-historisch)";
    case "vendor_aff": return "Vendor-Affinität (User-historisch)";
  }
}
