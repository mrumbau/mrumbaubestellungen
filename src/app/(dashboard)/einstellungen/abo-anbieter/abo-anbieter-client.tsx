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
import { IconPlus, IconEdit, IconTrash, IconRepeat } from "@/components/ui/icons";
import { useListManager } from "@/lib/use-list-manager";

export type AboAnbieter = {
  id: string;
  name: string;
  domain: string;
  email_absender: string[];
  intervall: "monatlich" | "quartalsweise" | "halbjaehrlich" | "jaehrlich";
  erwarteter_betrag: number | null;
  toleranz_prozent: number;
  naechste_rechnung: string | null;
  vertragsbeginn: string | null;
  vertragsende: string | null;
  kuendigungsfrist_tage: number | null;
  notizen: string | null;
  letzter_betrag: number | null;
  letzte_rechnung_am: string | null;
  created_at: string;
};

const INTERVALL_LABEL: Record<AboAnbieter["intervall"], string> = {
  monatlich: "Monatlich",
  quartalsweise: "Quartalsweise",
  halbjaehrlich: "Halbjährlich",
  jaehrlich: "Jährlich",
};

type FormState = {
  name: string;
  domain: string;
  emailAbsender: string;
  notizen: string;
  intervall: AboAnbieter["intervall"];
  betrag: string;
  toleranz: string;
  naechsteRechnung: string;
  vertragsbeginn: string;
  vertragsende: string;
  kuendigungsfrist: string;
};

const emptyForm: FormState = {
  name: "",
  domain: "",
  emailAbsender: "",
  notizen: "",
  intervall: "monatlich",
  betrag: "",
  toleranz: "10",
  naechsteRechnung: "",
  vertragsbeginn: "",
  vertragsende: "",
  kuendigungsfrist: "",
};

type AboAnbieterPayload = {
  name: string;
  domain: string;
  email_absender: string[];
  notizen: string | null;
  intervall: AboAnbieter["intervall"];
  erwarteter_betrag: number | null;
  toleranz_prozent: number;
  naechste_rechnung: string | null;
  vertragsbeginn: string | null;
  vertragsende: string | null;
  kuendigungsfrist_tage: number | null;
};

export function AboAnbieterClient({ initialListe }: { initialListe: AboAnbieter[] }) {
  const list = useListManager<AboAnbieter, AboAnbieterPayload>({
    initial: initialListe,
    endpoint: "/api/abo-anbieter",
    responseKey: "abo_anbieter",
    toastLabels: {
      create: "Abo-Anbieter angelegt",
      update: "Abo-Anbieter aktualisiert",
      delete: (a) => `Abo-Anbieter "${a.name}" gelöscht`,
    },
    sortBy: (a, b) => a.name.localeCompare(b.name, "de"),
  });
  const liste = list.items;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    list.setError(null);
  }

  function startEdit(abo: AboAnbieter) {
    setForm({
      name: abo.name,
      domain: abo.domain,
      emailAbsender: (abo.email_absender || []).join(", "),
      notizen: abo.notizen ?? "",
      intervall: abo.intervall,
      betrag: abo.erwarteter_betrag != null ? String(abo.erwarteter_betrag) : "",
      toleranz: String(abo.toleranz_prozent ?? 10),
      naechsteRechnung: abo.naechste_rechnung ?? "",
      vertragsbeginn: abo.vertragsbeginn ?? "",
      vertragsende: abo.vertragsende ?? "",
      kuendigungsfrist: abo.kuendigungsfrist_tage ? String(abo.kuendigungsfrist_tage) : "",
    });
    setEditId(abo.id);
    setShowForm(true);
    list.setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.domain.trim()) {
      list.setError("Name und Domain sind Pflichtfelder.");
      return;
    }

    const payload: AboAnbieterPayload = {
      name: form.name.trim(),
      domain: form.domain.trim().toLowerCase(),
      email_absender: form.emailAbsender
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      notizen: form.notizen.trim() || null,
      intervall: form.intervall,
      erwarteter_betrag: form.betrag ? parseFloat(form.betrag.replace(",", ".")) : null,
      toleranz_prozent: parseInt(form.toleranz) || 10,
      naechste_rechnung: form.naechsteRechnung || null,
      vertragsbeginn: form.vertragsbeginn || null,
      vertragsende: form.vertragsende || null,
      kuendigungsfrist_tage: form.kuendigungsfrist ? parseInt(form.kuendigungsfrist) : null,
    };

    const saved = await list.submit({ id: editId, payload });
    if (saved) resetForm();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "Abo-Anbieter" },
        ]}
        title="Abo-Anbieter"
        description="Wiederkehrende Verträge (Software, Lizenzen, Handyverträge). Erkennung über E-Mail-Absender, Fristen werden im Dashboard gewarnt."
        meta={
          <span className="text-[12px] text-foreground-subtle font-mono-amount">
            {liste.length} Einträge
          </span>
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
              Abo hinzufügen
            </Button>
          ) : undefined
        }
      />

      {list.error && (
        <Alert tone="error" onDismiss={() => list.setError(null)}>
          {list.error}
        </Alert>
      )}

      {showForm && (
        <SectionCard
          title={editId ? "Abo-Anbieter bearbeiten" : "Neuen Abo-Anbieter anlegen"}
          description="Der erwartete Betrag plus Toleranz bestimmt, ob eine neue Rechnung als Preisanomalie markiert wird."
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Name"
              required
              placeholder="z.B. Hold & Spada"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <Input
              label="Domain"
              required
              placeholder="z.B. holdspada.de"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            />
            <Input
              label="E-Mail-Absender"
              hint="Kommagetrennt. E-Mails von diesen Absendern werden als Abo erkannt."
              placeholder="rechnung@holdspada.de, billing@firma.com"
              value={form.emailAbsender}
              onChange={(e) => setForm((f) => ({ ...f, emailAbsender: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <Select
              label="Intervall"
              value={form.intervall}
              onChange={(e) =>
                setForm((f) => ({ ...f, intervall: e.target.value as AboAnbieter["intervall"] }))
              }
            >
              <option value="monatlich">Monatlich</option>
              <option value="quartalsweise">Quartalsweise</option>
              <option value="halbjaehrlich">Halbjährlich</option>
              <option value="jaehrlich">Jährlich</option>
            </Select>
            <Input
              label="Erwarteter Betrag"
              placeholder="z.B. 49,90"
              value={form.betrag}
              onChange={(e) => setForm((f) => ({ ...f, betrag: e.target.value }))}
              className="font-mono-amount"
              iconRight={<span className="text-foreground-subtle">€</span>}
            />
            <Input
              label="Toleranz"
              type="number"
              min={0}
              max={100}
              value={form.toleranz}
              onChange={(e) => setForm((f) => ({ ...f, toleranz: e.target.value }))}
              iconRight={<span className="text-foreground-subtle">%</span>}
              hint="Abweichungstoleranz in Prozent."
            />
            <Input
              label="Nächste Rechnung"
              type="date"
              value={form.naechsteRechnung}
              onChange={(e) => setForm((f) => ({ ...f, naechsteRechnung: e.target.value }))}
            />
            <Input
              label="Vertragsbeginn"
              type="date"
              value={form.vertragsbeginn}
              onChange={(e) => setForm((f) => ({ ...f, vertragsbeginn: e.target.value }))}
            />
            <Input
              label="Vertragsende"
              type="date"
              value={form.vertragsende}
              onChange={(e) => setForm((f) => ({ ...f, vertragsende: e.target.value }))}
            />
            <Input
              label="Kündigungsfrist"
              type="number"
              min={0}
              placeholder="z.B. 30"
              value={form.kuendigungsfrist}
              onChange={(e) => setForm((f) => ({ ...f, kuendigungsfrist: e.target.value }))}
              iconRight={<span className="text-foreground-subtle">Tage</span>}
            />
            <Input
              label="Notizen"
              placeholder="z.B. Handwerker-Software"
              value={form.notizen}
              onChange={(e) => setForm((f) => ({ ...f, notizen: e.target.value }))}
              wrapperClassName="md:col-span-2"
            />
            <div className="md:col-span-2 flex items-center gap-2 pt-1">
              <Button type="submit" loading={list.loading}>
                {editId ? "Änderungen speichern" : "Abo-Anbieter anlegen"}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={list.loading}>
                Abbrechen
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {liste.length === 0 && !showForm ? (
        <EmptyState
          icon={<IconRepeat className="h-5 w-5" />}
          title="Noch keine Abo-Anbieter"
          description="Lege wiederkehrende Verträge an, um Preisabweichungen und Kündigungsfristen automatisch zu überwachen."
          primaryAction={
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              iconLeft={<IconPlus />}
            >
              Abo hinzufügen
            </Button>
          }
        />
      ) : (
        <SectionCard padding="none" headerBorder={false}>
          <ul className="divide-y divide-line-subtle">
            {liste.map((abo) => (
              <AboRow
                key={abo.id}
                abo={abo}
                onEdit={() => startEdit(abo)}
                onDelete={() => list.openDeleteConfirm(abo)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <ConfirmDialog
        open={list.deleteConfirm !== null}
        title="Abo-Anbieter löschen?"
        message={
          list.deleteConfirm
            ? `"${list.deleteConfirm.item.name}" wird endgültig gelöscht. Bereits zugeordnete Abo-Rechnungen bleiben erhalten.`
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

function AboRow({
  abo,
  onEdit,
  onDelete,
}: {
  abo: AboAnbieter;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const intervall = INTERVALL_LABEL[abo.intervall] ?? "Monatlich";
  const isOverdue = abo.naechste_rechnung && new Date(abo.naechste_rechnung) < new Date();

  const kuendigungsHinweis = (() => {
    if (!abo.kuendigungsfrist_tage || !abo.vertragsende) return null;
    const frist = new Date(abo.vertragsende);
    frist.setDate(frist.getDate() - abo.kuendigungsfrist_tage);
    const tageUebrig = Math.ceil((frist.getTime() - Date.now()) / 86400000);
    if (tageUebrig <= 0) {
      return { label: "Kündigungsfrist abgelaufen", tone: "error" as const };
    }
    if (tageUebrig <= 30) {
      return { label: `Kündigungsfrist in ${tageUebrig} Tagen`, tone: "warning" as const };
    }
    return null;
  })();

  return (
    <li className="group flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas border border-line-subtle text-foreground-muted mt-0.5 [&_svg]:h-4 [&_svg]:w-4"
        >
          <IconRepeat />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-foreground">{abo.name}</span>
            <span className="text-[11px] font-mono-amount text-foreground-subtle">
              {abo.domain}
            </span>
            <Badge tone="neutral" size="sm">
              {intervall}
            </Badge>
            {abo.erwarteter_betrag != null && (
              <span className="text-[12px] font-mono-amount font-semibold text-foreground">
                {Number(abo.erwarteter_betrag).toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-[11.5px]">
            {abo.naechste_rechnung && (
              <span
                className={
                  isOverdue ? "text-error font-semibold" : "text-foreground-muted"
                }
              >
                Nächste Rechnung:{" "}
                {new Date(abo.naechste_rechnung).toLocaleDateString("de-DE")}
              </span>
            )}
            {abo.vertragsende && (
              <span className="text-foreground-subtle">
                Vertragsende: {new Date(abo.vertragsende).toLocaleDateString("de-DE")}
              </span>
            )}
            {kuendigungsHinweis && (
              <Badge tone={kuendigungsHinweis.tone} size="sm">
                {kuendigungsHinweis.label}
              </Badge>
            )}
            {abo.notizen && (
              <span className="text-foreground-subtle">· {abo.notizen}</span>
            )}
          </div>
          {abo.email_absender && abo.email_absender.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {abo.email_absender.map((ea, i) => (
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
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`${abo.name} bearbeiten`}
          title="Bearbeiten"
        >
          <IconEdit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`${abo.name} löschen`}
          title="Löschen"
          className="hover:text-error"
        >
          <IconTrash className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
