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
  IconEdit,
  IconTrash,
  IconFolderOpen,
  IconChevronRight,
} from "@/components/ui/icons";

export type Projekt = {
  id: string;
  name: string;
  farbe: string;
  budget: number | null;
  status: string;
  beschreibung: string | null;
  kunde: string | null;
  adresse: string | null;
  adresse_keywords: string[] | null;
};

const PROJEKT_FARBEN = [
  "#570006",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

type FormState = {
  name: string;
  beschreibung: string;
  farbe: string;
  budget: string;
  kunde: string;
  status: string;
  adresse: string;
};

const emptyForm: FormState = {
  name: "",
  beschreibung: "",
  farbe: PROJEKT_FARBEN[0],
  budget: "",
  kunde: "",
  status: "aktiv",
  adresse: "",
};

export function ProjekteClient({
  initialProjekte,
  canEdit,
}: {
  initialProjekte: Projekt[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [projekte, setProjekte] = useState<Projekt[]>(initialProjekte);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivConfirm, setArchivConfirm] = useState<{ id: string; name: string } | null>(null);

  const aktiveProjekte = projekte.filter((p) => ["aktiv", "pausiert"].includes(p.status));
  const inaktiveProjekte = projekte.filter((p) =>
    ["abgeschlossen", "archiviert"].includes(p.status),
  );

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(p: Projekt) {
    setForm({
      name: p.name,
      beschreibung: p.beschreibung ?? "",
      farbe: p.farbe,
      budget: p.budget ? String(p.budget) : "",
      kunde: p.kunde ?? "",
      status: p.status,
      adresse: p.adresse ?? "",
    });
    setEditId(p.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Projektname ist ein Pflichtfeld.");
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      beschreibung: form.beschreibung.trim() || null,
      kunde: form.kunde.trim() || null,
      farbe: form.farbe,
      budget: form.budget ? Number(form.budget) : null,
      status: form.status,
      adresse: form.adresse.trim() || null,
      adresse_keywords: form.adresse.trim()
        ? form.adresse.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
        : [],
    };

    try {
      const url = editId ? `/api/projekte/${editId}` : "/api/projekte";
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      if (editId) {
        setProjekte((prev) => prev.map((p) => (p.id === editId ? data.projekt : p)));
        toast.success("Projekt aktualisiert");
      } else {
        setProjekte((prev) =>
          [...prev, data.projekt].sort((a, b) => a.name.localeCompare(b.name)),
        );
        toast.success("Projekt angelegt");
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiv(id: string) {
    const target = projekte.find((p) => p.id === id);
    setArchivConfirm(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projekte/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Archivieren fehlgeschlagen");
      if (data.geloescht) {
        setProjekte((prev) => prev.filter((p) => p.id !== id));
        toast.success("Projekt gelöscht", {
          description: target ? target.name : undefined,
        });
      } else {
        setProjekte((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "archiviert" } : p)),
        );
        toast.success("Projekt archiviert", {
          description: target ? target.name : undefined,
        });
      }
    } catch (err) {
      toast.error("Archivieren fehlgeschlagen", {
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
          { label: "Projekte" },
        ]}
        title="Projekte / Baustellen"
        description={
          canEdit
            ? "Projekte mit Farbe, Budget und Adresse. Die Adresse dient zur automatischen Erkennung eingehender Lieferungen."
            : "Projektübersicht (schreibgeschützt)."
        }
        meta={
          <span className="text-[12px] text-foreground-subtle font-mono-amount">
            {aktiveProjekte.length} aktiv · {inaktiveProjekte.length} archiviert
          </span>
        }
        actions={
          canEdit && !showForm ? (
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              iconLeft={<IconPlus />}
            >
              Neues Projekt
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {canEdit && showForm && (
        <SectionCard
          title={editId ? "Projekt bearbeiten" : "Neues Projekt anlegen"}
          description="Farbe, Budget und Adresse sind optional. Die Adresse hilft bei der automatischen Zuordnung von Lieferungen."
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Name"
              required
              placeholder="z.B. Sanierung Hauptstraße 12"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
              wrapperClassName="md:col-span-2"
            />
            <Input
              label="Beschreibung"
              placeholder="Optional"
              value={form.beschreibung}
              onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))}
            />
            <Input
              label="Kunde"
              placeholder="z.B. Müller GmbH"
              value={form.kunde}
              onChange={(e) => setForm((f) => ({ ...f, kunde: e.target.value }))}
            />
            <FarbePicker
              value={form.farbe}
              onChange={(farbe) => setForm((f) => ({ ...f, farbe }))}
            />
            <Input
              label="Budget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Optional"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              className="font-mono-amount"
              iconRight={<span className="text-foreground-subtle">€</span>}
            />
            <Input
              label="Baustellen-Adresse"
              hint="Lieferadresse der Baustelle — wird zur Projekt-Erkennung genutzt."
              placeholder="z.B. Musterstraße 12, 10115 Berlin"
              value={form.adresse}
              onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            {editId && (
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="aktiv">Aktiv</option>
                <option value="pausiert">Pausiert</option>
                <option value="abgeschlossen">Abgeschlossen</option>
              </Select>
            )}
            <div className="md:col-span-2 flex items-center gap-2 pt-1">
              <Button type="submit" loading={loading}>
                {editId ? "Änderungen speichern" : "Projekt anlegen"}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={loading}>
                Abbrechen
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {aktiveProjekte.length === 0 && !showForm ? (
        <EmptyState
          icon={<IconFolderOpen className="h-5 w-5" />}
          title="Noch keine aktiven Projekte"
          description={
            canEdit
              ? "Lege dein erstes Projekt an — Bestellungen können dann einem Projekt zugeordnet werden."
              : "Ein Administrator muss Projekte anlegen."
          }
          primaryAction={
            canEdit ? (
              <Button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                iconLeft={<IconPlus />}
              >
                Neues Projekt
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard padding="none" headerBorder={false}>
          <ul className="divide-y divide-line-subtle">
            {aktiveProjekte.map((p) => (
              <ProjektRow
                key={p.id}
                projekt={p}
                canEdit={canEdit}
                onEdit={() => startEdit(p)}
                onArchive={() => setArchivConfirm({ id: p.id, name: p.name })}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {inaktiveProjekte.length > 0 && (
        <details className="group">
          <summary
            className={cn(
              "inline-flex items-center gap-2 cursor-pointer select-none",
              "text-[12.5px] font-medium text-foreground-muted hover:text-foreground transition-colors",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1",
            )}
          >
            <IconChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {inaktiveProjekte.length} archivierte Projekte
          </summary>
          <ul className="mt-2 space-y-1">
            {inaktiveProjekte.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-3 py-1.5 rounded-md text-foreground-subtle"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 opacity-60"
                  style={{ background: p.farbe }}
                />
                <span className="text-[13px]">{p.name}</span>
                <Badge tone="muted" size="sm">
                  {p.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={archivConfirm !== null}
        title="Projekt archivieren?"
        message={
          archivConfirm
            ? `"${archivConfirm.name}" wird archiviert. Wenn noch keine Bestellungen zugeordnet sind, wird es endgültig gelöscht. Bereits zugeordnete Bestellungen bleiben erhalten.`
            : ""
        }
        confirmLabel="Archivieren"
        variant="danger"
        loading={loading}
        onConfirm={() => archivConfirm && handleArchiv(archivConfirm.id)}
        onCancel={() => setArchivConfirm(null)}
      />
    </div>
  );
}

function FarbePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (farbe: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground-muted leading-none">Farbe</span>
      <div
        role="radiogroup"
        aria-label="Projekt-Farbe auswählen"
        className="flex flex-wrap gap-2"
      >
        {PROJEKT_FARBEN.map((farbe) => {
          const active = value === farbe;
          return (
            <button
              key={farbe}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Farbe ${farbe}`}
              onClick={() => onChange(farbe)}
              className={cn(
                "h-7 w-7 rounded-md transition-all",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                active
                  ? "ring-2 ring-offset-2 ring-foreground scale-110"
                  : "hover:scale-105 hover:ring-1 hover:ring-line-strong hover:ring-offset-1",
              )}
              style={{ background: farbe }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProjektRow({
  projekt,
  canEdit,
  onEdit,
  onArchive,
}: {
  projekt: Projekt;
  canEdit: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="group flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: projekt.farbe }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-foreground">{projekt.name}</span>
            {projekt.status === "pausiert" && (
              <Badge tone="warning" size="sm">
                Pausiert
              </Badge>
            )}
            {projekt.kunde && (
              <span className="text-[11.5px] text-foreground-subtle">· {projekt.kunde}</span>
            )}
          </div>
          {projekt.beschreibung && (
            <p className="text-[11.5px] text-foreground-subtle mt-0.5">{projekt.beschreibung}</p>
          )}
          <div className="flex items-center gap-3 mt-0.5 text-[11.5px]">
            {projekt.adresse && (
              <span className="text-foreground-muted truncate">{projekt.adresse}</span>
            )}
            {projekt.budget != null && (
              <span className="font-mono-amount text-foreground-muted">
                Budget:{" "}
                {Number(projekt.budget).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            )}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`${projekt.name} bearbeiten`}
            title="Bearbeiten"
          >
            <IconEdit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onArchive}
            aria-label={`${projekt.name} archivieren`}
            title="Archivieren"
            className="hover:text-error"
          >
            <IconTrash className="h-4 w-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
