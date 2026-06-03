"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX } from "@/components/ui/icons";

export type Rule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  condition: { type: string; value: string };
  target_kuerzel: string | null;
  confidence: number;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
};

export type BestellerRoleEntry = {
  kuerzel: string;
  name: string;
  rolle: string;
};

const CONDITION_TYPES: Array<{ value: string; label: string; example: string }> = [
  { value: "haendler_domain", label: "Händler-Domain (exakt)", example: "raab-karcher.de" },
  { value: "haendler_domain_contains", label: "Händler-Domain (enthält)", example: "amazon" },
  { value: "absender_pattern", label: "Absender-Regex", example: "@hamdi-muhameti\\.de$" },
  { value: "subject_keyword", label: "Betreff enthält", example: "T-Mobile" },
  { value: "haendler_id", label: "Händler-UUID (exakt)", example: "abcd-1234-..." },
  // 03.06.2026 (Pool 2.0 Sprint 3) — neue Condition-Types für Pool 2.0
  { value: "betrag_min", label: "Betrag ≥ (EUR)", example: "500" },
  { value: "betrag_max", label: "Betrag ≤ (EUR)", example: "10000" },
  { value: "projekt_keyword", label: "Projekt-Name enthält", example: "Schule" },
];

export function RulesClient({
  initialRules,
  bestellerListe,
}: {
  initialRules: Rule[];
  bestellerListe: BestellerRoleEntry[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function saveRule(rule: Partial<Rule> & { id?: string }) {
    setError(null);
    try {
      const url = rule.id
        ? `/api/admin/rules/${rule.id}`
        : `/api/admin/rules`;
      const res = await fetch(url, {
        method: rule.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Speichern fehlgeschlagen");
        return false;
      }
      setEditing(null);
      setShowAdd(false);
      router.refresh();
      // Optimistic update
      const result = await res.json();
      if (rule.id) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...result.rule } : r)));
      } else {
        setRules((prev) => [...prev, result.rule].sort((a, b) => a.priority - b.priority));
      }
      return true;
    } catch {
      setError("Netzwerkfehler beim Speichern");
      return false;
    }
  }

  async function toggleEnabled(rule: Rule) {
    const next = !rule.enabled;
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)));
    const ok = await saveRule({ id: rule.id, enabled: next });
    if (!ok) {
      // Rollback
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Löschen fehlgeschlagen");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      setDeleteId(null);
      router.refresh();
    } catch {
      setError("Netzwerkfehler beim Löschen");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start justify-between gap-2">
          <Alert tone="error">{error}</Alert>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 text-foreground-subtle hover:text-foreground"
            aria-label="Fehler verwerfen"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[14px] text-foreground-muted">
          {rules.length === 0
            ? "Noch keine Regeln definiert. Pipeline nutzt die 5-Stufen-Standard-Logik."
            : `${rules.length} Regel${rules.length === 1 ? "" : "n"} aktiv. Pipeline-Auswertung nach Priorität (niedrigster Wert zuerst).`}
        </p>
        <Button onClick={() => setShowAdd(true)} iconLeft={<IconPlus />} size="sm">
          Neue Regel
        </Button>
      </div>

      {rules.length === 0 && (
        <EmptyState
          icon={<IconPlus className="h-5 w-5" />}
          title="Keine Regeln aktiv"
          description="Regeln greifen vor der Standard-Pipeline und überschreiben Besteller-Zuordnungen z.B. nach Händler-Domain oder Absender-Pattern. Ohne Regeln läuft die 5-Stufen-Heuristik (Whitelist → Signal → Erwartet → Bestätigt → KI)."
          primaryAction={
            <Button onClick={() => setShowAdd(true)} iconLeft={<IconPlus />} size="sm">
              Erste Regel anlegen
            </Button>
          }
        />
      )}

      {rules.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Aktiv</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Prio</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Bedingung</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">→ Besteller</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Trefferzahl</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground-muted text-[12px] uppercase tracking-wider">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-line-subtle ${i % 2 === 1 ? "bg-zebra" : ""} ${
                    !r.enabled ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleEnabled(r)}
                      className={`w-9 h-5 rounded-full relative transition-colors ${
                        r.enabled ? "bg-success" : "bg-line-strong"
                      }`}
                      title={r.enabled ? "Deaktivieren" : "Aktivieren"}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-surface rounded-full transition-transform ${
                          r.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono-amount">{r.priority}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                  <td className="px-4 py-3 font-mono-amount text-[12px]">
                    <span className="text-foreground-subtle">{r.condition.type}:</span>{" "}
                    <span className="text-foreground">&quot;{r.condition.value}&quot;</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.target_kuerzel ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-brand text-white text-[10px] font-bold font-mono-amount">
                        {r.target_kuerzel}
                      </span>
                    ) : (
                      <span className="text-foreground-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-amount">
                    {r.hit_count > 0 ? (
                      <span title={r.last_hit_at ? `Letzter Hit: ${new Date(r.last_hit_at).toLocaleString("de-DE")}` : ""}>
                        {r.hit_count}×
                      </span>
                    ) : (
                      <span className="text-foreground-subtle">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="p-1.5 rounded hover:bg-canvas text-foreground-muted hover:text-foreground"
                        title="Bearbeiten"
                      >
                        <IconEdit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(r.id)}
                        className="p-1.5 rounded hover:bg-error-bg text-foreground-muted hover:text-error"
                        title="Löschen"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(showAdd || editing) && (
        <RuleForm
          rule={editing}
          bestellerListe={bestellerListe}
          onSave={saveRule}
          onCancel={() => {
            setEditing(null);
            setShowAdd(false);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Regel löschen?"
        message="Die Regel wird permanent entfernt. Pipeline nutzt für künftige Mails wieder die Standard-5-Stufen-Logik."
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => { if (deleteId) deleteRule(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function RuleForm({
  rule,
  bestellerListe,
  onSave,
  onCancel,
}: {
  rule: Rule | null;
  bestellerListe: BestellerRoleEntry[];
  onSave: (rule: Partial<Rule> & { id?: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [conditionType, setConditionType] = useState(rule?.condition.type ?? "haendler_domain");
  const [conditionValue, setConditionValue] = useState(rule?.condition.value ?? "");
  const [targetKuerzel, setTargetKuerzel] = useState(rule?.target_kuerzel ?? "");
  const [confidence, setConfidence] = useState(rule?.confidence ?? 0.85);
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const selectedConditionType = CONDITION_TYPES.find((c) => c.value === conditionType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !conditionValue.trim() || !targetKuerzel) return;
    setSaving(true);
    await onSave({
      id: rule?.id,
      name: name.trim(),
      priority,
      condition: { type: conditionType, value: conditionValue.trim() },
      target_kuerzel: targetKuerzel,
      confidence,
      notes: notes.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Card padding="md" className="border-2 border-brand/30">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline text-[16px] text-foreground">
            {rule ? "Regel bearbeiten" : "Neue Regel"}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-foreground-subtle hover:text-foreground"
            aria-label="Abbrechen"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="z.B. RK → MT"
              className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
              Priorität (niedrigster Wert zuerst)
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
              min={0}
              max={9999}
              className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface font-mono-amount focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
            Bedingungs-Typ
          </span>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value)}
            className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
          >
            {CONDITION_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
            Bedingungs-Wert
          </span>
          <input
            type="text"
            value={conditionValue}
            onChange={(e) => setConditionValue(e.target.value)}
            required
            placeholder={selectedConditionType?.example ?? ""}
            className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface font-mono-amount focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
              → Besteller
            </span>
            <select
              value={targetKuerzel}
              onChange={(e) => setTargetKuerzel(e.target.value)}
              required
              className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
            >
              <option value="">— wählen —</option>
              {bestellerListe.map((b) => (
                <option key={b.kuerzel} value={b.kuerzel}>
                  {b.kuerzel} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1 flex items-center justify-between">
              <span>Konfidenz</span>
              <span className="font-mono-amount text-foreground">
                {(confidence * 100).toFixed(0)} %
              </span>
            </span>
            {/* 03.06.2026 (Pool 2.0 Sprint 3): Number-Input → Slider mit
                Live-Anzeige. Pool-Auto-Claim-Schwelle (default 0.95) ist hier
                der relevante Vergleichswert — Regeln über 0.95 fließen in
                Auto-Claim-Logik wenn aktiviert. */}
            <input
              type="range"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              step={0.05}
              min={0}
              max={1}
              className="w-full accent-brand"
            />
            <span className="block text-[10px] text-foreground-faint mt-1">
              Pool-Auto-Claim wertet Regeln ≥ Schwelle (default 95 %) automatisch aus.
            </span>
          </label>
        </div>

        <label className="block">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
            Notizen (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="z.B. 'MT bestellt fast nur bei RK seit Jan 2026'"
            className="w-full px-3 py-2 text-[14px] border border-line rounded bg-surface focus:shadow-[var(--shadow-focus-ring)] focus:outline-none"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving} iconLeft={<IconCheck />}>
            {rule ? "Speichern" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
