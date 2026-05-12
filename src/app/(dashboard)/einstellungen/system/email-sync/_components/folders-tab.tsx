"use client";

/**
 * FoldersTab + interne Sub-Komponenten (HealthCard, SubscriptionCard, FolderAddModal).
 * Aus email-sync-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { IconMail, IconPlus, IconRefresh, IconTrash, IconPlay } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { relativeTime } from "./helpers";
import type { Folder, GraphFolder, ToastFn } from "./types";

/* ════════════════════════════════════════════════════════════════════════
   Health-Card — aggregierter Subsystem-Status aus /api/health
   ════════════════════════════════════════════════════════════════════════ */

interface HealthData {
  email_sync: {
    status: "ok" | "warning" | "error" | "inactive";
    active_folders: number;
    folders_with_error: number;
    bootstrap_pending: number;
    last_processed_at: string | null;
    failed_last_24h: number;
    permanent_failures_24h: number;
    mismatch_rate_7d: number;
    pending_in_queue: number;
    stale_pending: number;
    warnings: string[];
  };
  microsoft_graph: string;
  openai: string;
}

function HealthCard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="rounded-lg border border-line-subtle bg-canvas p-3 text-xs text-foreground-subtle">
        Health wird geladen…
      </div>
    );
  }

  const es = data.email_sync;
  const tone =
    es.status === "ok"
      ? "success"
      : es.status === "warning"
        ? "warning"
        : es.status === "error"
          ? "error"
          : "neutral";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex flex-col gap-2",
        tone === "success" && "border-success-border bg-success-bg",
        tone === "warning" && "border-warning-border bg-warning-bg",
        tone === "error" && "border-error-border bg-error-bg",
        tone === "neutral" && "border-line-subtle bg-canvas",
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={tone} size="md">
            Sync-Status: {es.status === "inactive" ? "inaktiv" : es.status}
          </Badge>
          <span className="text-xs text-foreground-muted">
            {es.active_folders} aktive Folder
            {es.pending_in_queue > 0 && ` · ${es.pending_in_queue} in Queue`}
            {es.stale_pending > 0 && ` (${es.stale_pending} stale)`}
            {es.bootstrap_pending > 0 && ` · ${es.bootstrap_pending} Bootstrap-pending`}
            {es.failed_last_24h > 0 && ` · ${es.failed_last_24h} failed/24h`}
            {es.permanent_failures_24h > 0 && ` (${es.permanent_failures_24h} permanent)`}
          </span>
        </div>
        {es.last_processed_at && (
          <span className="text-[11px] text-foreground-subtle font-mono-amount">
            zuletzt {relativeTime(es.last_processed_at)}
          </span>
        )}
      </div>
      {es.warnings.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {es.warnings.map((w, i) => (
            <li key={i} className="text-foreground-muted">
              · {w}
            </li>
          ))}
        </ul>
      )}
      {es.mismatch_rate_7d > 0 && (
        <div className="text-[11px] text-foreground-subtle">
          Folder-Mismatch-Rate (7d): {(es.mismatch_rate_7d * 100).toFixed(1)} %
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Push-Subscriptions: Real-Time Mail-Empfang via Microsoft Graph
   ════════════════════════════════════════════════════════════════════════ */

interface SubscriptionRow {
  id: string;
  graph_subscription_id: string;
  expiration_at: string;
  last_renewed_at: string | null;
  last_renewal_error: string | null;
  consecutive_failures: number;
  mail_sync_folders: { folder_path: string; document_hint: string | null; enabled: boolean };
}

interface SubscriptionData {
  subscriptions: SubscriptionRow[];
  notification_url: string;
}

function SubscriptionCard({
  activeFolders,
  toast,
}: {
  activeFolders: number;
  toast: ToastFn & {
    success: ToastFn;
    error: ToastFn;
    warning: ToastFn;
    info: ToastFn;
  };
}) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email-sync/subscriptions");
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleActivate() {
    setActivating(true);
    try {
      const res = await fetch("/api/email-sync/subscriptions", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error("Aktivierung fehlgeschlagen", {
          description: json.error ?? "Bitte erneut versuchen.",
        });
        return;
      }
      const failures: Array<{ folder: string; error: string }> = json.failures ?? [];
      if (failures.length > 0) {
        toast.warning(`${json.created} Subscriptions erstellt, ${failures.length} fehlgeschlagen`, {
          description: failures.map((f) => `${f.folder}: ${f.error}`).join(" · "),
        });
      } else if (json.created === 0) {
        toast.info("Alle aktiven Folder haben bereits eine Subscription");
      } else {
        toast.success(`${json.created} Push-Subscription${json.created === 1 ? "" : "s"} aktiviert`, {
          description: "Mail-Empfang läuft jetzt nahezu in Echtzeit (<5s).",
        });
      }
      await reload();
    } catch {
      toast.error("Netzwerkfehler bei der Aktivierung");
    } finally {
      setActivating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-line-subtle bg-canvas p-3 text-xs text-foreground-subtle">
        Push-Subscriptions werden geladen…
      </div>
    );
  }

  const subs = data?.subscriptions ?? [];
  const activeSubs = subs.filter(
    (s) => s.mail_sync_folders?.enabled && new Date(s.expiration_at).getTime() > Date.now(),
  );
  const expiredOrBroken = subs.filter(
    (s) => new Date(s.expiration_at).getTime() <= Date.now() || s.consecutive_failures >= 2,
  );
  const missing = Math.max(0, activeFolders - activeSubs.length);

  const tone =
    expiredOrBroken.length > 0
      ? "error"
      : activeSubs.length === 0
        ? "warning"
        : missing > 0
          ? "warning"
          : "success";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex flex-col gap-2",
        tone === "success" && "border-success-border bg-success-bg",
        tone === "warning" && "border-warning-border bg-warning-bg",
        tone === "error" && "border-error-border bg-error-bg",
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={tone} size="md">
            Push-Subscriptions: {activeSubs.length} / {activeFolders} aktiv
          </Badge>
          {missing > 0 && (
            <span className="text-xs text-foreground-muted">
              {missing} Folder ohne Subscription · läuft auf Polling (~60s Latenz)
            </span>
          )}
          {expiredOrBroken.length > 0 && (
            <span className="text-xs text-error">
              {expiredOrBroken.length} expired oder mit Fehler · graph-rescue heilt automatisch
            </span>
          )}
          {activeSubs.length > 0 && missing === 0 && expiredOrBroken.length === 0 && (
            <span className="text-xs text-foreground-muted">
              Real-Time-Empfang aktiv · Renewal alle 12h via Cron
            </span>
          )}
        </div>
        {missing > 0 && (
          <Button
            variant={activeSubs.length === 0 ? "primary" : "secondary"}
            size="sm"
            onClick={handleActivate}
            disabled={activating}
            loading={activating}
          >
            <IconPlay className="h-3.5 w-3.5" />
            {activeSubs.length === 0 ? "Push-Subscriptions aktivieren" : `${missing} Subscription${missing === 1 ? "" : "s"} ergänzen`}
          </Button>
        )}
      </div>

      {data?.notification_url && (
        <div className="text-[11px] text-foreground-subtle font-mono-amount break-all">
          Webhook: {data.notification_url}
        </div>
      )}

      {subs.length > 0 && (
        <ul className="text-[11px] space-y-0.5 mt-1">
          {subs.map((s) => {
            const expired = new Date(s.expiration_at).getTime() <= Date.now();
            const broken = s.consecutive_failures >= 2;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-2",
                  (expired || broken) && "text-error",
                  !(expired || broken) && "text-foreground-muted",
                )}
              >
                <span>· {s.mail_sync_folders?.folder_path ?? "(unbekannt)"}</span>
                <span className="font-mono-amount">
                  {expired
                    ? "expired"
                    : broken
                      ? `${s.consecutive_failures}× Fehler`
                      : `läuft ab ${relativeTime(s.expiration_at)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 1: Folder-Verwaltung
   ════════════════════════════════════════════════════════════════════════ */

export function FoldersTab({
  folders,
  setFolders,
  toast,
}: {
  folders: Folder[];
  setFolders: (f: Folder[]) => void;
  toast: ToastFn & {
    success: ToastFn;
    error: ToastFn;
    warning: ToastFn;
    info: ToastFn;
  };
}) {
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/email-sync/folders");
      const json = await res.json();
      if (res.ok) setFolders(json.folders ?? []);
    } catch {
      toast.error("Folder-Liste konnte nicht aktualisiert werden");
    }
  }, [setFolders, toast]);

  async function toggleEnabled(folder: Folder) {
    const res = await fetch(`/api/email-sync/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !folder.enabled }),
    });
    if (res.ok) {
      const { folder: updated } = await res.json();
      setFolders(folders.map((f) => (f.id === folder.id ? updated : f)));
      toast.success(updated.enabled ? "Folder aktiviert" : "Folder deaktiviert");
    } else {
      toast.error("Update fehlgeschlagen");
    }
  }

  async function changeHint(folder: Folder, hint: string) {
    const res = await fetch(`/api/email-sync/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_hint: hint || null }),
    });
    if (res.ok) {
      const { folder: updated } = await res.json();
      setFolders(folders.map((f) => (f.id === folder.id ? updated : f)));
    } else {
      toast.error("Hint-Update fehlgeschlagen");
    }
  }

  async function resetDelta(folder: Folder) {
    if (
      !confirm(
        `Delta-Token für "${folder.folder_path}" zurücksetzen? Beim nächsten Sync werden alle aktuellen Mails als bootstrap_skip markiert (kein Reprocessing).`,
      )
    )
      return;
    const res = await fetch(`/api/email-sync/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset_delta_token: true }),
    });
    if (res.ok) {
      const { folder: updated } = await res.json();
      setFolders(folders.map((f) => (f.id === folder.id ? updated : f)));
      toast.success("Delta-Token zurückgesetzt");
    } else {
      toast.error("Reset fehlgeschlagen");
    }
  }

  async function deleteFolder(folder: Folder) {
    if (
      !confirm(
        `Folder "${folder.folder_path}" entfernen? Alle Log-Einträge werden mitgelöscht (CASCADE).`,
      )
    )
      return;
    const res = await fetch(`/api/email-sync/folders/${folder.id}`, { method: "DELETE" });
    if (res.ok) {
      setFolders(folders.filter((f) => f.id !== folder.id));
      toast.success("Folder entfernt");
    } else {
      toast.error("Delete fehlgeschlagen");
    }
  }

  const activeFolderCount = folders.filter((f) => f.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      <HealthCard />
      <SubscriptionCard activeFolders={activeFolderCount} toast={toast} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">
          Konfigurierte Outlook-Folder. Cron iteriert nur aktive Folder. Der Folder-Hint hilft der KI bei
          Klassifikation, kann aber von ihr überschrieben werden.
        </p>
        <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
          <IconPlus className="h-4 w-4" />
          Folder hinzufügen
        </Button>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          icon={<IconMail className="h-10 w-10" />}
          title="Noch kein Folder konfiguriert"
          description="Fügen Sie Outlook-Folder hinzu, die der Cron beobachten soll."
          primaryAction={
            <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
              <IconPlus className="h-4 w-4" />
              Folder hinzufügen
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-line-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas border-b border-line-subtle">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-subtle">
                  Folder
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-subtle">
                  Hint
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-subtle">
                  Letzter Sync
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-subtle">
                  Status
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-subtle">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => (
                <tr key={f.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{f.folder_name}</div>
                    <div className="text-[11px] text-foreground-subtle">{f.folder_path}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={f.document_hint ?? ""}
                      onChange={(e) => changeHint(f, e.target.value)}
                      className="text-xs"
                    >
                      <option value="">— kein Hint —</option>
                      <option value="rechnung">Rechnung</option>
                      <option value="lieferschein">Lieferschein</option>
                      <option value="bestellbestaetigung">Bestellbestätigung</option>
                      <option value="versand">Versand/Zustellung</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">
                    <div>{relativeTime(f.last_sync_at)}</div>
                    {f.last_sync_count !== null && f.last_sync_count > 0 && (
                      <div className="text-[11px] text-foreground-subtle font-mono-amount">
                        {f.last_sync_count} Mails
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f.last_error ? (
                      <Badge tone="error" size="sm">
                        {f.last_error.slice(0, 30)}
                      </Badge>
                    ) : f.delta_token === null ? (
                      <Badge tone="warning" size="sm">
                        Bootstrap nötig
                      </Badge>
                    ) : f.enabled ? (
                      <Badge tone="success" size="sm">
                        Aktiv
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        Deaktiviert
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleEnabled(f)}>
                        {f.enabled ? "Deaktivieren" : "Aktivieren"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => resetDelta(f)}>
                        <IconRefresh className="h-3.5 w-3.5" />
                        Reset
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteFolder(f)}>
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <FolderAddModal
          existingIds={folders.map((f) => f.graph_folder_id)}
          onClose={() => setShowAdd(false)}
          onAdded={(newFolder) => {
            setFolders([...folders, newFolder]);
            setShowAdd(false);
            refresh();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Folder-Add-Modal — Browse Outlook-Folder via Graph API
   ════════════════════════════════════════════════════════════════════════ */

function FolderAddModal({
  existingIds,
  onClose,
  onAdded,
  toast,
}: {
  existingIds: string[];
  onClose: () => void;
  onAdded: (folder: Folder) => void;
  toast: ToastFn & {
    success: ToastFn;
    error: ToastFn;
    warning: ToastFn;
    info: ToastFn;
  };
}) {
  const [graphFolders, setGraphFolders] = useState<GraphFolder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphFolder | null>(null);
  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/email-sync/graph-folders")
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.details || j.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((j) => {
        const fs: GraphFolder[] = j.folders ?? [];
        setGraphFolders(fs.filter((f) => !existingIds.includes(f.id)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Fehler"))
      .finally(() => setLoading(false));
  }, [existingIds]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/email-sync/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph_folder_id: selected.id,
          folder_name: selected.displayName,
          folder_path: selected.path,
          document_hint: hint || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const { folder } = await res.json();
      onAdded(folder);
      toast.success(`Folder "${folder.folder_path}" hinzugefügt`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Hinzufügen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Outlook-Folder hinzufügen" size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          Wähle einen Folder aus dem Outlook-Postfach <code className="font-mono-amount text-xs bg-canvas px-1 py-0.5 rounded">info@mrumbau.de</code>.
          Bereits konfigurierte Folder werden ausgeblendet.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size={24} />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-error-bg border border-error-border p-3 text-sm text-error">
            {error}
          </div>
        )}

        {graphFolders && graphFolders.length === 0 && !loading && (
          <p className="text-sm text-foreground-subtle italic">
            Alle verfügbaren Folder sind bereits konfiguriert.
          </p>
        )}

        {graphFolders && graphFolders.length > 0 && (
          <div className="border border-line-subtle rounded-md max-h-72 overflow-y-auto">
            {graphFolders.map((gf) => (
              <button
                key={gf.id}
                type="button"
                onClick={() => setSelected(gf)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm border-b border-line-subtle last:border-0 hover:bg-canvas transition-colors",
                  selected?.id === gf.id && "bg-canvas",
                )}
              >
                <div className="font-medium">{gf.path}</div>
                <div className="text-[11px] text-foreground-subtle font-mono-amount">
                  {gf.totalItemCount} Mails · {gf.unreadItemCount} ungelesen
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="rounded-md bg-canvas border border-line-subtle p-3">
            <div className="text-xs font-semibold mb-2">Document-Hint (optional)</div>
            <Select value={hint} onChange={(e) => setHint(e.target.value)}>
              <option value="">— kein Hint —</option>
              <option value="rechnung">Rechnung</option>
              <option value="lieferschein">Lieferschein</option>
              <option value="bestellbestaetigung">Bestellbestätigung</option>
              <option value="versand">Versand/Zustellung</option>
            </Select>
            <p className="text-[11px] text-foreground-subtle mt-2">
              Hint sagt der KI, welcher Dokument-Typ erwartet wird. KI darf widersprechen.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={!selected || submitting}
            loading={submitting}
            onClick={submit}
          >
            Hinzufügen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
