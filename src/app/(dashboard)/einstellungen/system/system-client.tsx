"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  IconActivity,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";

type HealthStatus = {
  status: string;
  timestamp: string;
  supabase: string;
  openai: string;
  make_webhook: string;
};

type WebhookLog = {
  id: string;
  typ: string;
  status: string;
  bestellnummer: string | null;
  fehler_text: string | null;
  created_at: string;
};

type Benutzer = {
  id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: string;
};

export function SystemClient({
  firma,
  initialWebhookLogs,
  benutzer,
  extensionSignale,
  hatTestdaten: initialHatTestdaten,
}: {
  firma: { bueroAdresse: string; konfidenzDirekt: string; konfidenzVorschlag: string };
  initialWebhookLogs: WebhookLog[];
  benutzer: Benutzer[];
  extensionSignale: Record<string, string>;
  hatTestdaten: boolean;
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

  // Webhook-Logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>(initialWebhookLogs);
  const [logFilter, setLogFilter] = useState<"alle" | "error">("alle");
  const filteredLogs =
    logFilter === "error" ? webhookLogs.filter((l) => l.status === "error") : webhookLogs;

  async function refreshWebhookLogs() {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("webhook_logs")
        .select("id, typ, status, bestellnummer, fehler_text, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setWebhookLogs(data);
      toast.success("Webhook-Logs aktualisiert");
    } catch {
      toast.error("Aktualisierung fehlgeschlagen");
    }
  }

  // Testdaten
  const [hatTestdaten, setHatTestdaten] = useState(initialHatTestdaten);
  const [testdatenLoading, setTestdatenLoading] = useState(false);
  const [testdatenConfirm, setTestdatenConfirm] = useState<"create" | "delete" | null>(null);

  async function handleTestdaten(action: "create" | "delete") {
    setTestdatenConfirm(null);
    setTestdatenLoading(true);
    try {
      const res = await fetch("/api/testdaten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setHatTestdaten(action === "create");
      toast.success(
        action === "create" ? "Testdaten angelegt" : "Testdaten gelöscht",
        { description: data.message },
      );
    } catch (err) {
      toast.error("Testdaten-Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTestdatenLoading(false);
    }
  }

  const besteller = benutzer.filter((b) => b.rolle === "besteller");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System" },
        ]}
        title="System"
        description="Health-Status, KI-Erkennung, Chrome-Extension, Webhook-Protokoll und Testdaten — an einem Ort."
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

      {/* CHROME EXTENSION + BENUTZER (Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Chrome-Extension"
          description="Signale pro Besteller. Die Extension meldet jede Bestellung automatisch."
        >
          {besteller.length === 0 ? (
            <p className="text-[13px] text-foreground-subtle py-2">Keine Besteller vorhanden.</p>
          ) : (
            <ul className="space-y-2">
              {besteller.map((b) => {
                const ext = getExtensionStatus(extensionSignale[b.kuerzel]);
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md border border-line-subtle"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white font-semibold text-[11px] font-mono-amount"
                      >
                        {b.kuerzel}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{b.name}</p>
                        <p className={cn("text-[11.5px]", ext.colorClass)}>{ext.label}</p>
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
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
            (Entwicklermodus).
          </p>
        </SectionCard>

        <SectionCard
          title={`Benutzer (${benutzer.length})`}
          description="Alle registrierten Benutzer und ihre Rollen. Verwaltung erfolgt derzeit in Supabase Auth."
        >
          <ul className="space-y-2">
            {benutzer.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-md border border-line-subtle"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white font-semibold text-[11px] font-mono-amount"
                  >
                    {u.kuerzel}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{u.name}</p>
                    <p className="text-[11.5px] text-foreground-subtle truncate font-mono-amount">
                      {u.email}
                    </p>
                  </div>
                </div>
                <RolleBadge rolle={u.rolle} />
              </li>
            ))}
          </ul>
          {benutzer.length === 0 && (
            <p className="py-2 text-[13px] text-foreground-subtle">Keine Benutzer vorhanden.</p>
          )}
        </SectionCard>
      </div>

      {/* WEBHOOK-LOGS */}
      <SectionCard
        title="Webhook-Protokoll"
        description="Die letzten 20 eingehenden Webhooks. Bei Fehler: Details in der letzten Spalte."
        action={
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Log-Filter"
              className="inline-flex bg-canvas border border-line-subtle rounded-md p-0.5"
            >
              <FilterTab
                active={logFilter === "alle"}
                onClick={() => setLogFilter("alle")}
                label="Alle"
              />
              <FilterTab
                active={logFilter === "error"}
                onClick={() => setLogFilter("error")}
                label="Nur Fehler"
                tone="error"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={refreshWebhookLogs}>
              Aktualisieren
            </Button>
          </div>
        }
        padding="none"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-[13px] text-foreground-subtle py-8 text-center">
            {logFilter === "error"
              ? "Keine Fehler gefunden."
              : "Noch keine Webhook-Logs vorhanden."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas border-b border-line-subtle">
                <tr>
                  <Th>Zeitpunkt</Th>
                  <Th>Typ</Th>
                  <Th>Status</Th>
                  <Th>Bestellnr.</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={cn(
                      "border-b border-line-subtle last:border-b-0 hover:bg-surface-hover transition-colors",
                      log.status === "error" ? "bg-error-bg/40" : "",
                    )}
                  >
                    <td className="px-5 py-2.5 font-mono-amount text-[11.5px] text-foreground-muted whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="muted" size="sm">
                        {log.typ}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[11.5px] font-semibold",
                          log.status === "success" ? "text-status-freigegeben" : "text-error",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            log.status === "success" ? "bg-status-freigegeben" : "bg-error",
                          )}
                        />
                        {log.status === "success" ? "OK" : log.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono-amount text-[11.5px] text-foreground">
                      {log.bestellnummer || "–"}
                    </td>
                    <td className="px-5 py-2.5 text-[11.5px] text-foreground-subtle max-w-[320px] truncate">
                      {log.fehler_text || "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* TESTDATEN */}
      <SectionCard
        tone="accent"
        title="Testdaten"
        description="Material- & Subunternehmer-Bestellungen, Versandstatus, Projekte, Kunden — jederzeit mit einem Klick löschbar."
      >
        <Alert tone="warning">
          Testdaten erhalten das Präfix <span className="font-mono-amount font-semibold">TEST-</span>.
          Sie können jederzeit komplett entfernt werden und sind in der Produktion nicht sichtbar.
        </Alert>
        <div className="mt-4 flex gap-3">
          {!hatTestdaten ? (
            <Button
              onClick={() => setTestdatenConfirm("create")}
              loading={testdatenLoading}
              iconLeft={<IconPlus />}
            >
              Testdaten anlegen
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setTestdatenConfirm("delete")}
              loading={testdatenLoading}
              iconLeft={<IconTrash />}
            >
              Alle Testdaten löschen
            </Button>
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={testdatenConfirm !== null}
        title={testdatenConfirm === "create" ? "Testdaten anlegen?" : "Testdaten löschen?"}
        message={
          testdatenConfirm === "create"
            ? "Es werden mehrere Bestellungen mit TEST-Präfix angelegt, inkl. Projekte und Kunden. Kein Risiko für Produktivdaten."
            : "Alle Einträge mit TEST-Präfix werden unwiderruflich gelöscht."
        }
        confirmLabel={testdatenConfirm === "create" ? "Anlegen" : "Löschen"}
        variant={testdatenConfirm === "create" ? "default" : "danger"}
        loading={testdatenLoading}
        onConfirm={() => testdatenConfirm && handleTestdaten(testdatenConfirm)}
        onCancel={() => setTestdatenConfirm(null)}
      />
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
        <p
          className={cn(
            "text-[12px] font-semibold",
            ok ? "text-success" : "text-error",
          )}
        >
          {ok ? okLabel : failLabel}
        </p>
      </div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "error";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11.5px] font-semibold rounded transition-colors",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        active
          ? tone === "error"
            ? "bg-surface text-error shadow-card"
            : "bg-surface text-foreground shadow-card"
          : "text-foreground-subtle hover:text-foreground-muted",
      )}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle px-5 first:pl-5 py-2"
    >
      {children}
    </th>
  );
}

function RolleBadge({ rolle }: { rolle: string }) {
  if (rolle === "admin") {
    return (
      <Badge tone="brand" size="md">
        Admin
      </Badge>
    );
  }
  if (rolle === "buchhaltung") {
    return (
      <Badge tone="success" size="md">
        Buchhaltung
      </Badge>
    );
  }
  return (
    <Badge tone="info" size="md">
      Besteller
    </Badge>
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
