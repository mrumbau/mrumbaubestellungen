"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IconUsers, IconShield, IconDownload } from "@/components/ui/icons";

export type Benutzer = {
  id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: string;
};

const ROLLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  buchhaltung: "Buchhaltung",
  besteller: "Besteller",
};

export function BenutzerClient({ benutzer }: { benutzer: Benutzer[] }) {
  const admins = benutzer.filter((b) => b.rolle === "admin");
  const buchhaltung = benutzer.filter((b) => b.rolle === "buchhaltung");
  const besteller = benutzer.filter((b) => b.rolle === "besteller");
  const sonstige = benutzer.filter(
    (b) => !["admin", "buchhaltung", "besteller"].includes(b.rolle),
  );

  const { toast } = useToast();
  const [erasureTarget, setErasureTarget] = useState<Benutzer | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // A4.13 (19.05.2026) — DSGVO Art. 15 Auskunftsrecht: JSON-Download
  // aller personenbezogenen Daten eines Bestellers für Aushändigung.
  async function handleExport(b: Benutzer) {
    setIsExporting(b.kuerzel);
    try {
      const res = await fetch("/api/admin/dsgvo-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ besteller_kuerzel: b.kuerzel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("DSGVO-Export fehlgeschlagen", {
          description: data.error || data.details || `HTTP ${res.status}`,
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsgvo-export-${b.kuerzel}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("DSGVO-Export erstellt", {
        description: `Personenbezogene Daten für ${b.name} heruntergeladen.`,
      });
    } catch (err) {
      toast.error("Netzwerk-Fehler", {
        description: err instanceof Error ? err.message : "Unbekannt",
      });
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Benutzer" },
        ]}
        title="Benutzer & Rollen"
        description="Übersicht aller registrierten Benutzer mit ihrer Rollenzuweisung."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {benutzer.length} Benutzer
            </span>
            <span className="text-[12px] text-foreground-subtle">·</span>
            <span className="text-[12px] text-foreground-subtle">
              {admins.length} Admin · {buchhaltung.length} Buchhaltung · {besteller.length} Besteller
            </span>
          </>
        }
      />

      <Alert tone="info" title="Nur lesender Zugriff">
        Benutzer anlegen, deaktivieren und Rollen ändern erfolgt derzeit direkt in Supabase Auth.
        Eine echte Verwaltungsoberfläche (Einladung, Rollen-Switch, Deaktivierung) ist für eine
        spätere Phase geplant.
      </Alert>

      {benutzer.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-5 w-5" />}
          title="Keine Benutzer gefunden"
          description="Benutzer werden über Supabase Auth angelegt und in die Tabelle benutzer_rollen gespiegelt."
        />
      ) : (
        <>
          {admins.length > 0 && (
            <Gruppe title="Administratoren" rolle="admin" benutzer={admins} />
          )}
          {buchhaltung.length > 0 && (
            <Gruppe title="Buchhaltung" rolle="buchhaltung" benutzer={buchhaltung} />
          )}
          {besteller.length > 0 && (
            <Gruppe
              title="Besteller"
              rolle="besteller"
              benutzer={besteller}
              onErasureRequest={setErasureTarget}
              onExportRequest={handleExport}
              exportingKuerzel={isExporting}
            />
          )}
          {sonstige.length > 0 && (
            <Gruppe title="Sonstige" rolle="unbekannt" benutzer={sonstige} />
          )}
        </>
      )}

      <DsgvoErasureModal
        target={erasureTarget}
        onClose={() => setErasureTarget(null)}
      />
    </div>
  );
}

function Gruppe({
  title,
  rolle,
  benutzer,
  onErasureRequest,
  onExportRequest,
  exportingKuerzel,
}: {
  title: string;
  rolle: string;
  benutzer: Benutzer[];
  onErasureRequest?: (b: Benutzer) => void;
  onExportRequest?: (b: Benutzer) => void;
  exportingKuerzel?: string | null;
}) {
  return (
    <SectionCard
      title={`${title} (${benutzer.length})`}
      padding="none"
      headerBorder
    >
      <ul className="divide-y divide-line-subtle">
        {benutzer.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white font-semibold text-[12px] font-mono-amount"
              >
                {u.kuerzel}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate">{u.name}</p>
                <p className="text-[12px] text-foreground-subtle truncate font-mono-amount">
                  {u.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RolleBadge rolle={u.rolle} />
              {onExportRequest && rolle === "besteller" && (
                <button
                  type="button"
                  onClick={() => onExportRequest(u)}
                  disabled={exportingKuerzel === u.kuerzel}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-foreground-subtle hover:text-info hover:bg-info-bg transition-colors disabled:opacity-50 disabled:cursor-wait"
                  title="DSGVO Art. 15 — Daten exportieren (JSON-Download)"
                  aria-label={`DSGVO-Export für ${u.name}`}
                >
                  <IconDownload className="w-3 h-3" />
                  {exportingKuerzel === u.kuerzel ? "Lädt…" : "Export"}
                </button>
              )}
              {onErasureRequest && rolle === "besteller" && (
                <button
                  type="button"
                  onClick={() => onErasureRequest(u)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-foreground-subtle hover:text-error hover:bg-error-bg transition-colors"
                  title="DSGVO Right-to-Erasure ausführen"
                  aria-label={`DSGVO-Erasure für ${u.name}`}
                >
                  <IconShield className="w-3 h-3" />
                  DSGVO
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RolleBadge({ rolle }: { rolle: string }) {
  const label = ROLLE_LABEL[rolle] ?? rolle;
  if (rolle === "admin") {
    return (
      <Badge tone="brand" size="md">
        {label}
      </Badge>
    );
  }
  if (rolle === "buchhaltung") {
    return (
      <Badge tone="success" size="md">
        {label}
      </Badge>
    );
  }
  if (rolle === "besteller") {
    return (
      <Badge tone="info" size="md">
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone="muted" size="md">
      {label}
    </Badge>
  );
}

function DsgvoErasureModal({
  target,
  onClose,
}: {
  target: Benutzer | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const open = target !== null;
  const expectedToken = target?.kuerzel ?? "";
  const canSubmit = open && confirmText.trim() === expectedToken;

  const handleClose = () => {
    if (isPending) return;
    setConfirmText("");
    onClose();
  };

  const handleSubmit = () => {
    if (!target || !canSubmit) return;
    const kuerzel = target.kuerzel;
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/dsgvo-erasure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            besteller_kuerzel: kuerzel,
            bestaetigung: "DSGVO_ERASURE_CONFIRMED",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("DSGVO-Erasure fehlgeschlagen", {
            description: data.error || data.details || `HTTP ${res.status}`,
          });
          return;
        }
        toast.success("DSGVO-Erasure ausgeführt", {
          description: `Personenbezug für ${kuerzel} wurde anonymisiert.`,
        });
        setConfirmText("");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error("Netzwerk-Fehler", {
          description: err instanceof Error ? err.message : "Unbekannt",
        });
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="DSGVO Right-to-Erasure"
      description={
        target
          ? `Personenbezug für ${target.name} (${target.kuerzel}) anonymisieren`
          : undefined
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            loading={isPending}
          >
            Anonymisierung ausführen
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert tone="error" title="Diese Aktion ist irreversibel">
          <ul className="list-disc pl-5 text-[14px] space-y-1 mt-1">
            <li>Personenbezug wird auf <code className="font-mono-amount">[anonymisiert]</code> gesetzt</li>
            <li>Alle Kommentare des Bestellers werden gelöscht</li>
            <li>Belege (Bestellungen, Dokumente, Freigaben) bleiben erhalten — GoBD §147</li>
            <li>Archivierte Bestellungen bleiben unverändert (DB-Trigger blockiert)</li>
            <li>Audit-Log in <code className="font-mono-amount">webhook_logs</code> wird angelegt</li>
          </ul>
        </Alert>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-foreground-subtle">
            Tippe das Kürzel <code className="font-mono-amount font-semibold text-foreground">{expectedToken}</code> ein, um zu bestätigen:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expectedToken}
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
            className="px-3 py-2 rounded-md border border-line-strong bg-input text-foreground font-mono-amount text-sm focus:outline-none focus:shadow-[var(--shadow-focus-ring)]"
          />
        </div>
      </div>
    </Modal>
  );
}
