"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { IconActivity, IconCheck, IconX } from "@/components/ui/icons";

type HealthStatus = {
  status: string;
  timestamp: string;
  supabase: string;
  openai: string;
  make_webhook: string;
};

type Besteller = { id: string; name: string; kuerzel: string };

export function SystemOverviewClient({
  firma,
  besteller,
  extensionSignale,
}: {
  firma: { bueroAdresse: string; konfidenzDirekt: string; konfidenzVorschlag: string };
  besteller: Besteller[];
  extensionSignale: Record<string, string>;
}) {
  const { toast } = useToast();

  // Health
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({
        status: "error",
        timestamp: new Date().toISOString(),
        supabase: "error",
        openai: "error",
        make_webhook: "error",
      });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Firma/KI
  const [bueroAdresse, setBueroAdresse] = useState(firma.bueroAdresse);
  const [konfidenzDirekt, setKonfidenzDirekt] = useState(firma.konfidenzDirekt);
  const [konfidenzVorschlag, setKonfidenzVorschlag] = useState(firma.konfidenzVorschlag);
  const [firmaLoading, setFirmaLoading] = useState(false);

  async function saveFirma() {
    setFirmaLoading(true);
    try {
      const settings = [
        { schluessel: "buero_adresse", wert: bueroAdresse.trim() },
        { schluessel: "konfidenz_direkt", wert: konfidenzDirekt },
        { schluessel: "konfidenz_vorschlag", wert: konfidenzVorschlag },
      ];
      for (const s of settings) {
        const res = await fetch("/api/einstellungen/firma", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Speichern fehlgeschlagen");
        }
      }
      toast.success("Firma-Einstellungen gespeichert");
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setFirmaLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Übersicht" },
        ]}
        title="System-Übersicht"
        description="Health-Status externer Dienste, KI-Erkennung und Chrome-Extension. Detail-Bereiche (Logs, Benutzer, Testdaten) findest du in der Sub-Navigation oben."
      />

      {/* HEALTH */}
      <SectionCard
        title="Health-Status"
        description="Externe Dienste: Supabase, OpenAI und Make.com-Webhook."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchHealth}
            loading={healthLoading}
          >
            Prüfen
          </Button>
        }
      >
        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HealthCell label="Supabase" ok={health.supabase === "ok"} />
            <HealthCell label="OpenAI API" ok={health.openai === "ok"} />
            <HealthCell
              label="Make.com Webhook"
              ok={health.make_webhook === "configured"}
              okLabel="Konfiguriert"
              failLabel="Nicht konfiguriert"
            />
            <div className="flex items-center gap-2.5 p-2.5 rounded-md bg-canvas border border-line-subtle">
              <div className="text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4">
                <IconActivity />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                  Letzter Check
                </p>
                <p className="text-[12px] font-medium text-foreground-muted truncate">
                  {new Date(health.timestamp).toLocaleString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6">
            <Spinner size={20} />
          </div>
        )}
      </SectionCard>

      {/* FIRMA / KI */}
      <SectionCard
        title="Firma / KI-Erkennung"
        description="Büro-Adresse (wird bei Baustellen-Erkennung ignoriert) und Konfidenz-Schwellen der automatischen Zuordnung."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Büro-Adresse"
            placeholder="z.B. Hauptstraße 5, 50667 Köln"
            hint="Lieferungen an diese Adresse werden als Büroversand erkannt."
            value={bueroAdresse}
            onChange={(e) => setBueroAdresse(e.target.value)}
            wrapperClassName="md:col-span-2"
          />
          <Input
            label="Konfidenz Direkt-Zuordnung"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={konfidenzDirekt}
            onChange={(e) => setKonfidenzDirekt(e.target.value)}
            className="font-mono-amount"
            hint="Ab diesem Wert erfolgt automatische Zuordnung. Standard: 0.85"
          />
          <Input
            label="Konfidenz Vorschlag"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={konfidenzVorschlag}
            onChange={(e) => setKonfidenzVorschlag(e.target.value)}
            className="font-mono-amount"
            hint="Ab diesem Wert wird ein Vorschlag angezeigt. Standard: 0.60"
          />
        </div>
        <div className="mt-4 pt-4 border-t border-line-subtle">
          <Button onClick={saveFirma} loading={firmaLoading}>
            Einstellungen speichern
          </Button>
        </div>
      </SectionCard>

      {/* CHROME EXTENSION */}
      <SectionCard
        title="Chrome-Extension"
        description="Signale pro Besteller. Die Extension meldet jede Bestellung automatisch an die API."
      >
        {besteller.length === 0 ? (
          <p className="text-[13px] text-foreground-subtle py-2">Keine Besteller vorhanden.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {besteller.map((b) => {
              const ext = getExtensionStatus(extensionSignale[b.kuerzel]);
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md border border-line-subtle"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      aria-hidden="true"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white font-semibold text-[11px] font-mono-amount"
                    >
                      {b.kuerzel}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{b.name}</p>
                      <p className={cn("text-[11.5px]", ext.colorClass)}>{ext.label}</p>
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      ext.dot,
                      ext.tone === "error" ? "pulse-urgent" : "",
                    )}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11.5px] text-foreground-subtle">
          Installieren unter{" "}
          <span className="font-mono-amount text-foreground-muted">chrome://extensions</span>{" "}
          (Entwicklermodus). Die Extension sendet bei jeder erkannten Händler-Bestellung ein Signal.
        </p>
      </SectionCard>
    </div>
  );
}

function HealthCell({
  label,
  ok,
  okLabel = "Online",
  failLabel = "Offline",
}: {
  label: string;
  ok: boolean;
  okLabel?: string;
  failLabel?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 p-2.5 rounded-md border",
        ok ? "bg-success-bg border-success-border" : "bg-error-bg border-error-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded [&_svg]:h-3.5 [&_svg]:w-3.5",
          ok ? "bg-success text-white" : "bg-error text-white",
        )}
      >
        {ok ? <IconCheck /> : <IconX />}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
          {label}
        </p>
        <p className={cn("text-[12px] font-semibold", ok ? "text-success" : "text-error")}>
          {ok ? okLabel : failLabel}
        </p>
      </div>
    </div>
  );
}

function getExtensionStatus(letztesSignal: string | undefined): {
  label: string;
  colorClass: string;
  dot: string;
  tone: "success" | "warning" | "error";
} {
  if (!letztesSignal) {
    return {
      label: "Noch kein Signal",
      colorClass: "text-error",
      dot: "bg-error",
      tone: "error",
    };
  }
  const tage = Math.floor(
    (Date.now() - new Date(letztesSignal).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (tage < 7) {
    const label = tage === 0 ? "Aktiv heute" : `Aktiv vor ${tage} Tag${tage > 1 ? "en" : ""}`;
    return {
      label,
      colorClass: "text-status-freigegeben",
      dot: "bg-status-freigegeben",
      tone: "success",
    };
  }
  if (tage <= 30) {
    return {
      label: `Vor ${tage} Tagen`,
      colorClass: "text-warning",
      dot: "bg-warning",
      tone: "warning",
    };
  }
  return {
    label: `Vor ${tage} Tagen`,
    colorClass: "text-error",
    dot: "bg-error",
    tone: "error",
  };
}
