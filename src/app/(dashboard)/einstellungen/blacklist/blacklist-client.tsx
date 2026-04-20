"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  IconPlus,
  IconTrash,
  IconShield,
  IconChevronRight,
} from "@/components/ui/icons";
import { IRRELEVANT_DOMAINS, VERSAND_DOMAINS } from "@/lib/blacklist-constants";

export type BlacklistEntry = {
  muster: string;
  typ: "domain" | "adresse";
  grund: string | null;
  erstellt_am: string;
};

export function BlacklistClient({ initialListe }: { initialListe: BlacklistEntry[] }) {
  const { toast } = useToast();
  const [liste, setListe] = useState<BlacklistEntry[]>(initialListe);
  const [showForm, setShowForm] = useState(false);
  const [muster, setMuster] = useState("");
  const [typ, setTyp] = useState<"domain" | "adresse">("domain");
  const [grund, setGrund] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteMuster, setDeleteMuster] = useState<string | null>(null);

  function resetForm() {
    setMuster("");
    setTyp("domain");
    setGrund("");
    setShowForm(false);
    setError(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!muster.trim()) {
      setError("Muster ist ein Pflichtfeld.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muster: muster.trim(),
          typ,
          grund: grund.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setListe((prev) => [
        {
          muster: muster.trim().toLowerCase(),
          typ,
          grund: grund.trim() || null,
          erstellt_am: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success("Muster blockiert", { description: muster.trim().toLowerCase() });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Hinzufügen");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(m: string) {
    setDeleteMuster(null);
    setLoading(true);
    try {
      const res = await fetch("/api/blacklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: m }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Löschen fehlgeschlagen");
      }
      setListe((prev) => prev.filter((bl) => bl.muster !== m));
      toast.success("Muster entsperrt", { description: m });
    } catch (err) {
      toast.error("Entsperren fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "Blacklist" },
        ]}
        title="E-Mail Blacklist"
        description="Blockierte Absender-Domains und -Adressen. E-Mails von diesen Mustern werden nicht als Bestellung verarbeitet."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {liste.length} manuelle Einträge
            </span>
            <span className="text-[12px] text-foreground-subtle">·</span>
            <span className="text-[12px] text-foreground-subtle">
              {IRRELEVANT_DOMAINS.length + VERSAND_DOMAINS.length} System-Domains
            </span>
          </>
        }
        actions={
          !showForm ? (
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              iconLeft={<IconPlus />}
            >
              Muster hinzufügen
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {showForm && (
        <SectionCard
          title="Neues Muster blockieren"
          description="Blockiere einen kompletten Absender-Domain oder eine einzelne Adresse."
        >
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Typ"
              value={typ}
              onChange={(e) => setTyp(e.target.value as "domain" | "adresse")}
            >
              <option value="domain">Domain (z.B. newsletter.de)</option>
              <option value="adresse">E-Mail-Adresse (z.B. spam@firma.de)</option>
            </Select>
            <Input
              label={typ === "domain" ? "Domain" : "E-Mail-Adresse"}
              required
              placeholder={typ === "domain" ? "newsletter.beispiel.de" : "spam@firma.de"}
              value={muster}
              onChange={(e) => setMuster(e.target.value)}
              autoFocus
              className="font-mono-amount"
            />
            <Input
              label="Grund"
              hint="Optional. Hilft bei späterer Überprüfung."
              placeholder="z.B. Newsletter, Werbung, irrelevant"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              wrapperClassName="md:col-span-2"
            />
            <div className="md:col-span-2 flex items-center gap-2 pt-1">
              <Button type="submit" variant="destructive" loading={loading}>
                Blockieren
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={loading}>
                Abbrechen
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {liste.length === 0 && !showForm ? (
        <EmptyState
          icon={<IconShield className="h-5 w-5" />}
          title="Keine manuellen Blockierungen"
          description="Die System-Domains unten sind automatisch blockiert. Füge einzelne Muster hinzu, wenn weitere Absender ignoriert werden sollen."
          primaryAction={
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              iconLeft={<IconPlus />}
            >
              Muster hinzufügen
            </Button>
          }
        />
      ) : (
        <SectionCard title="Manuell blockiert" headerBorder padding="none">
          <ul className="divide-y divide-line-subtle">
            {liste.map((bl) => (
              <BlacklistRow
                key={bl.muster}
                entry={bl}
                onDelete={() => setDeleteMuster(bl.muster)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <details className="group">
        <summary
          className={cn(
            "inline-flex items-center gap-2 cursor-pointer select-none",
            "text-[12.5px] font-medium text-foreground-muted hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1",
          )}
        >
          <IconChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          System-Domains anzeigen ({IRRELEVANT_DOMAINS.length + VERSAND_DOMAINS.length}{" "}
          automatisch blockiert)
        </summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground-subtle mb-2">
              Irrelevant (Freemail, Marketing, Social Media)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {IRRELEVANT_DOMAINS.map((d) => (
                <span
                  key={d}
                  className="text-[11px] font-mono-amount px-2 py-1 rounded bg-canvas border border-line-subtle text-foreground-muted"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground-subtle mb-2">
              Versand (DHL, DPD, Hermes — werden als Versandbenachrichtigung verarbeitet)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VERSAND_DOMAINS.map((d) => (
                <span
                  key={d}
                  className="text-[11px] font-mono-amount px-2 py-1 rounded bg-info-bg border border-info-border text-info"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </details>

      <ConfirmDialog
        open={deleteMuster !== null}
        title="Muster entsperren?"
        message={
          deleteMuster
            ? `"${deleteMuster}" wird wieder zugelassen. Neue E-Mails von dieser Adresse werden wieder als Bestellung verarbeitet.`
            : ""
        }
        confirmLabel="Entsperren"
        variant="danger"
        loading={loading}
        onConfirm={() => deleteMuster && handleDelete(deleteMuster)}
        onCancel={() => setDeleteMuster(null)}
      />
    </div>
  );
}

function BlacklistRow({
  entry,
  onDelete,
}: {
  entry: BlacklistEntry;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-error-bg text-error [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          <IconShield />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-mono-amount font-semibold text-foreground">
              {entry.muster}
            </span>
            <Badge tone={entry.typ === "domain" ? "error" : "warning"} size="sm">
              {entry.typ}
            </Badge>
          </div>
          {entry.grund && (
            <p className="text-[11.5px] text-foreground-subtle mt-0.5">{entry.grund}</p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`${entry.muster} entsperren`}
        title="Entsperren"
        className="hover:text-error opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      >
        <IconTrash className="h-4 w-4" />
      </Button>
    </li>
  );
}
