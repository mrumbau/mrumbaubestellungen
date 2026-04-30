"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconBuilding,
} from "@/components/ui/icons";
import { useListManager } from "@/lib/use-list-manager";

export type Haendler = {
  id: string;
  name: string;
  domain: string;
  url_muster: string[];
  email_absender: string[];
};

export type HaendlerStat = {
  gesamt: number;
  letzte: string | null;
  abweichungen: number;
};

type FormState = {
  name: string;
  domain: string;
  urlMuster: string;
  emailAbsender: string;
};

type HaendlerPayload = {
  name: string;
  domain: string;
  url_muster: string[];
  email_absender: string[];
};

const emptyForm: FormState = { name: "", domain: "", urlMuster: "", emailAbsender: "" };

export function HaendlerClient({
  initialHaendler,
  stats,
}: {
  initialHaendler: Haendler[];
  stats: Record<string, HaendlerStat>;
}) {
  // CRUD-State + async-Mutationen via Hook
  const list = useListManager<Haendler, HaendlerPayload>({
    initial: initialHaendler,
    endpoint: "/api/haendler",
    responseKey: "haendler",
    toastLabels: {
      create: "Händler angelegt",
      update: "Händler aktualisiert",
      delete: (h) => `Händler "${h.name}" gelöscht`,
    },
    sortBy: (a, b) => a.name.localeCompare(b.name, "de"),
  });

  // Form-State bleibt lokal (Page-spezifisch)
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    list.setError(null);
  }

  function startEdit(h: Haendler) {
    setForm({
      name: h.name,
      domain: h.domain,
      urlMuster: h.url_muster.join(", "),
      emailAbsender: h.email_absender.join(", "),
    });
    setEditId(h.id);
    setShowForm(true);
    list.setError(null);
  }

  function startNew() {
    resetForm();
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.domain.trim()) {
      list.setError("Name und Domain sind Pflichtfelder.");
      return;
    }

    const payload: HaendlerPayload = {
      name: form.name.trim(),
      domain: form.domain.trim(),
      url_muster: form.urlMuster.split(",").map((s) => s.trim()).filter(Boolean),
      email_absender: form.emailAbsender.split(",").map((s) => s.trim()).filter(Boolean),
    };

    const saved = await list.submit({ id: editId, payload });
    if (saved) resetForm();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "Händler" },
        ]}
        title="Händler"
        description="Webshop-Erkennungsmuster (Domain, URL, E-Mail-Absender) und Bestell-Statistik pro Händler."
        meta={
          <span className="text-[12px] text-foreground-subtle font-mono-amount">
            {list.items.length} Einträge
          </span>
        }
        actions={
          !showForm && (
            <Button onClick={startNew} iconLeft={<IconPlus />}>
              Händler hinzufügen
            </Button>
          )
        }
      />

      {list.error && (
        <Alert tone="error" onDismiss={() => list.setError(null)}>
          {list.error}
        </Alert>
      )}

      {showForm && (
        <SectionCard
          title={editId ? "Händler bearbeiten" : "Neuen Händler anlegen"}
          description="Domain und E-Mail-Absender steuern die automatische Erkennung eingehender Bestellungen."
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Name"
              required
              placeholder="z.B. Bauhaus"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <Input
              label="Domain"
              required
              placeholder="z.B. bauhaus.de"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            />
            <Input
              label="URL-Muster"
              hint="Kommagetrennt. Z.B. /checkout/confirmation, /bestellbestaetigung"
              placeholder="/checkout/confirmation, /bestellbestaetigung"
              value={form.urlMuster}
              onChange={(e) => setForm((f) => ({ ...f, urlMuster: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <Input
              label="E-Mail-Absender"
              hint="Kommagetrennt. Z.B. bestellung@bauhaus.de, noreply@bauhaus.de"
              placeholder="bestellung@bauhaus.de, noreply@bauhaus.de"
              value={form.emailAbsender}
              onChange={(e) => setForm((f) => ({ ...f, emailAbsender: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <div className="md:col-span-2 flex items-center gap-2 pt-1">
              <Button type="submit" loading={list.loading}>
                {editId ? "Änderungen speichern" : "Händler anlegen"}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={list.loading}>
                Abbrechen
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {list.items.length === 0 && !showForm ? (
        <EmptyState
          icon={<IconBuilding className="h-5 w-5" />}
          title="Noch keine Händler"
          description="Lege deinen ersten Händler an, damit eingehende Bestellungen automatisch zugeordnet werden."
          primaryAction={
            <Button onClick={startNew} iconLeft={<IconPlus />}>
              Händler hinzufügen
            </Button>
          }
        />
      ) : (
        <SectionCard padding="none" headerBorder={false}>
          <ul className="divide-y divide-line-subtle">
            {list.items.map((h) => (
              <HaendlerRow
                key={h.id}
                haendler={h}
                stat={stats[h.name]}
                onEdit={() => startEdit(h)}
                onDelete={() => list.openDeleteConfirm(h)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <ConfirmDialog
        open={list.deleteConfirm !== null}
        title="Händler löschen?"
        message={
          list.deleteConfirm
            ? `Der Händler "${list.deleteConfirm.item.name}" wird endgültig gelöscht. Bereits zugeordnete Bestellungen bleiben erhalten, verlieren aber die Händler-Referenz.`
            : ""
        }
        confirmLabel="Löschen"
        variant="danger"
        loading={list.loading}
        onConfirm={() => list.deleteConfirm && list.remove(list.deleteConfirm.id)}
        onCancel={list.closeDeleteConfirm}
      />
    </div>
  );
}

function HaendlerRow({
  haendler,
  stat,
  onEdit,
  onDelete,
}: {
  haendler: Haendler;
  stat?: HaendlerStat;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const abweichungsQuote =
    stat && stat.gesamt > 0 ? Math.round((stat.abweichungen / stat.gesamt) * 100) : null;

  return (
    <li className="group flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-foreground">{haendler.name}</span>
          <span className="text-[11px] font-mono-amount text-foreground-muted bg-canvas border border-line-subtle rounded px-1.5 py-0.5">
            {haendler.domain}
          </span>
        </div>
        {haendler.url_muster.length > 0 && (
          <p className="text-[11.5px] text-foreground-subtle mt-1 truncate">
            <span className="text-foreground-muted">URLs:</span>{" "}
            {haendler.url_muster.join(", ")}
          </p>
        )}
        {haendler.email_absender.length > 0 && (
          <p className="text-[11.5px] text-foreground-subtle truncate">
            <span className="text-foreground-muted">E-Mails:</span>{" "}
            {haendler.email_absender.join(", ")}
          </p>
        )}
        {stat && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px]">
            <span className="text-foreground-muted">
              <span className="font-mono-amount font-semibold text-foreground">
                {stat.gesamt}
              </span>{" "}
              Bestellungen
            </span>
            {stat.letzte && (
              <span className="text-foreground-subtle">
                Letzte {new Date(stat.letzte).toLocaleDateString("de-DE")}
              </span>
            )}
            {abweichungsQuote !== null && (
              <span
                className={
                  abweichungsQuote > 0
                    ? "font-medium text-status-abweichung"
                    : "font-medium text-status-freigegeben"
                }
              >
                {abweichungsQuote}% Abweichung
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`${haendler.name} bearbeiten`}
          title="Bearbeiten"
        >
          <IconEdit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`${haendler.name} löschen`}
          title="Löschen"
          className="hover:text-error"
        >
          <IconTrash className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
