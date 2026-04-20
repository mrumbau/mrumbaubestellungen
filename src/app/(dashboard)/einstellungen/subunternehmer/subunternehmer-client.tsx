"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconTool,
} from "@/components/ui/icons";

export type Subunternehmer = {
  id: string;
  firma: string;
  ansprechpartner: string | null;
  gewerk: string | null;
  telefon: string | null;
  email: string | null;
  email_absender: string[];
  steuer_nr: string | null;
  iban: string | null;
  notizen: string | null;
  confirmed_at: string | null;
  created_at: string;
};

const GEWERKE = [
  "Elektro",
  "Sanitär/Heizung",
  "Trockenbau",
  "Maler/Lackierer",
  "Estrich",
  "Fliesen",
  "Bodenbelag",
  "Schreiner/Tischler",
  "Schlosser/Metallbau",
  "Fenster/Türen",
  "Dachdecker",
  "Reinigung",
  "Abbruch/Entsorgung",
  "Sonstiges",
];

type FormState = {
  firma: string;
  ansprechpartner: string;
  gewerk: string;
  telefon: string;
  email: string;
  emailAbsender: string;
  steuerNr: string;
  iban: string;
  notizen: string;
};

const emptyForm: FormState = {
  firma: "",
  ansprechpartner: "",
  gewerk: "",
  telefon: "",
  email: "",
  emailAbsender: "",
  steuerNr: "",
  iban: "",
  notizen: "",
};

export function SubunternehmerClient({
  initialListe,
  canEdit,
}: {
  initialListe: Subunternehmer[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [liste, setListe] = useState<Subunternehmer[]>(initialListe);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; firma: string } | null>(null);

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(su: Subunternehmer) {
    setForm({
      firma: su.firma,
      ansprechpartner: su.ansprechpartner ?? "",
      gewerk: su.gewerk ?? "",
      telefon: su.telefon ?? "",
      email: su.email ?? "",
      emailAbsender: (su.email_absender || []).join(", "),
      steuerNr: su.steuer_nr ?? "",
      iban: su.iban ?? "",
      notizen: su.notizen ?? "",
    });
    setEditId(su.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firma.trim()) {
      setError("Firma ist ein Pflichtfeld.");
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      firma: form.firma.trim(),
      ansprechpartner: form.ansprechpartner.trim() || null,
      gewerk: form.gewerk || null,
      telefon: form.telefon.trim() || null,
      email: form.email.trim() || null,
      email_absender: form.emailAbsender.split(",").map((s) => s.trim()).filter(Boolean),
      steuer_nr: form.steuerNr.trim() || null,
      iban: form.iban.trim() || null,
      notizen: form.notizen.trim() || null,
    };

    try {
      const url = editId ? `/api/subunternehmer/${editId}` : "/api/subunternehmer";
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      if (editId) {
        setListe((prev) => prev.map((s) => (s.id === editId ? data.subunternehmer : s)));
        toast.success("Subunternehmer aktualisiert");
      } else {
        setListe((prev) =>
          [...prev, data.subunternehmer].sort((a, b) => a.firma.localeCompare(b.firma)),
        );
        toast.success("Subunternehmer angelegt");
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const target = liste.find((s) => s.id === id);
    setDeleteConfirm(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/subunternehmer/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setListe((prev) => prev.filter((s) => s.id !== id));
      toast.success("Subunternehmer gelöscht", {
        description: target ? target.firma : undefined,
      });
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleBestaetigen(id: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/subunternehmer/bestaetigen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subunternehmer_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bestätigung fehlgeschlagen");
      setListe((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, confirmed_at: new Date().toISOString() } : s,
        ),
      );
      toast.success("Subunternehmer bestätigt");
    } catch (err) {
      toast.error("Bestätigung fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  const unconfirmed = liste.filter((s) => !s.confirmed_at).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "Subunternehmer" },
        ]}
        title="Subunternehmer"
        description={
          canEdit
            ? "Firmen und Gewerke für die automatische Rechnungszuordnung. Auto-erkannte Subunternehmer warten hier auf Bestätigung."
            : "Subunternehmer-Stammdaten (schreibgeschützt)."
        }
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {liste.length} Einträge
            </span>
            {unconfirmed > 0 && (
              <Badge tone="warning" size="md">
                {unconfirmed} unbestätigt
              </Badge>
            )}
          </>
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
              Subunternehmer hinzufügen
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
          title={editId ? "Subunternehmer bearbeiten" : "Neuen Subunternehmer anlegen"}
          description="E-Mail-Absender steuern die automatische Rechnungserkennung."
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Firma"
              required
              value={form.firma}
              onChange={(e) => setForm((f) => ({ ...f, firma: e.target.value }))}
              autoFocus
              wrapperClassName="md:col-span-2"
            />
            <Input
              label="Ansprechpartner"
              value={form.ansprechpartner}
              onChange={(e) => setForm((f) => ({ ...f, ansprechpartner: e.target.value }))}
            />
            <Select
              label="Gewerk"
              value={form.gewerk}
              onChange={(e) => setForm((f) => ({ ...f, gewerk: e.target.value }))}
            >
              <option value="">– Bitte wählen –</option>
              {GEWERKE.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <Input
              label="Telefon"
              type="tel"
              autoComplete="tel"
              value={form.telefon}
              onChange={(e) => setForm((f) => ({ ...f, telefon: e.target.value }))}
            />
            <Input
              label="E-Mail"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="E-Mail-Absender"
              hint="Kommagetrennt. Für die automatische Rechnungserkennung."
              placeholder="rechnung@firma.de, buchhaltung@firma.de"
              value={form.emailAbsender}
              onChange={(e) => setForm((f) => ({ ...f, emailAbsender: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <Input
              label="Steuer-Nr"
              value={form.steuerNr}
              onChange={(e) => setForm((f) => ({ ...f, steuerNr: e.target.value }))}
            />
            <Input
              label="IBAN"
              value={form.iban}
              onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
              className="font-mono-amount"
            />
            <Textarea
              label="Notizen"
              rows={2}
              value={form.notizen}
              onChange={(e) => setForm((f) => ({ ...f, notizen: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <div className="md:col-span-2 flex items-center gap-2 pt-1">
              <Button type="submit" loading={loading}>
                {editId ? "Änderungen speichern" : "Subunternehmer anlegen"}
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
          icon={<IconTool className="h-5 w-5" />}
          title="Noch keine Subunternehmer"
          description={
            canEdit
              ? "Lege deinen ersten Subunternehmer an. Rechnungen werden dann automatisch per E-Mail-Absender zugeordnet."
              : "Ein Administrator muss Subunternehmer anlegen."
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
                Subunternehmer hinzufügen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard padding="none" headerBorder={false}>
          <ul className="divide-y divide-line-subtle">
            {liste.map((su) => (
              <SuRow
                key={su.id}
                su={su}
                canEdit={canEdit}
                onEdit={() => startEdit(su)}
                onDelete={() => setDeleteConfirm({ id: su.id, firma: su.firma })}
                onConfirm={() => handleBestaetigen(su.id)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Subunternehmer löschen?"
        message={
          deleteConfirm
            ? `"${deleteConfirm.firma}" wird endgültig gelöscht. Bereits zugeordnete Rechnungen bleiben erhalten.`
            : ""
        }
        confirmLabel="Löschen"
        variant="danger"
        loading={loading}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function SuRow({
  su,
  canEdit,
  onEdit,
  onDelete,
  onConfirm,
}: {
  su: Subunternehmer;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}) {
  return (
    <li className="group flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas border border-line-subtle text-foreground-muted mt-0.5 [&_svg]:h-4 [&_svg]:w-4">
          <IconTool />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-foreground">{su.firma}</span>
            {su.gewerk && (
              <Badge tone="neutral" size="sm">
                {su.gewerk}
              </Badge>
            )}
            {!su.confirmed_at && (
              <Badge tone="warning" size="sm">
                Auto-erkannt
              </Badge>
            )}
          </div>
          {su.ansprechpartner && (
            <p className="text-[11.5px] text-foreground-muted mt-0.5">{su.ansprechpartner}</p>
          )}
          {su.telefon && (
            <p className="text-[11.5px] text-foreground-subtle font-mono-amount">{su.telefon}</p>
          )}
          {su.email_absender && su.email_absender.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {su.email_absender.map((ea, i) => (
                <span
                  key={i}
                  className="text-[10.5px] font-mono-amount px-1.5 py-0.5 rounded bg-canvas border border-line-subtle text-foreground-muted"
                >
                  {ea}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {!su.confirmed_at && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onConfirm}
              aria-label={`${su.firma} bestätigen`}
              title="Bestätigen"
              className="hover:text-status-freigegeben"
            >
              <IconCheck className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`${su.firma} bearbeiten`}
            title="Bearbeiten"
          >
            <IconEdit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`${su.firma} löschen`}
            title="Löschen"
            className="hover:text-error"
          >
            <IconTrash className="h-4 w-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
