"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Sparkline } from "@/components/ui/sparkline";
import { IconMail, IconPlus, IconRefresh, IconTrash, IconPlay } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Tab = "folders" | "monitor" | "telemetry";

interface Folder {
  id: string;
  graph_folder_id: string;
  folder_name: string;
  folder_path: string;
  document_hint: string | null;
  delta_token: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_count: number | null;
  last_error: string | null;
  created_at: string;
}

interface GraphFolder {
  id: string;
  displayName: string;
  path: string;
  totalItemCount: number;
  unreadItemCount: number;
}

interface LogEntry {
  internet_message_id: string;
  graph_message_id: string;
  folder_id: string;
  folder_hint: string | null;
  ki_classified_as: string | null;
  ki_confidence: number | null;
  folder_mismatch: boolean | null;
  status: "pending" | "irrelevant" | "processed" | "failed";
  received_at: string | null;
  processed_at: string | null;
  openai_input_tokens: number | null;
  openai_output_tokens: number | null;
  openai_cost_eur: number | null;
  error_msg: string | null;
  bestellung_id: string | null;
  sender: string | null;
  subject: string | null;
  has_attachments: boolean | null;
  created_at: string;
  mail_sync_folders: { folder_name: string; folder_path: string };
}

interface Telemetry {
  daily_spend: { date: string; eur: number }[];
  status_counts: Record<string, number>;
  mismatch_rate: number;
  total_cost_30d_eur: number;
  total_mails_30d: number;
  top_costly: {
    internet_message_id: string;
    sender: string | null;
    subject: string | null;
    cost_eur: number;
    created_at: string;
  }[];
  folder_health: {
    id: string;
    folder_name: string;
    folder_path: string;
    enabled: boolean;
    last_sync_at: string | null;
    last_sync_count: number | null;
    last_error: string | null;
    mails_24h: number;
  }[];
}

const HINT_LABELS: Record<string, string> = {
  rechnung: "Rechnung",
  lieferschein: "Lieferschein",
  bestellbestaetigung: "Bestellbestätigung",
  versand: "Versand/Zustellung",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "nie";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "gerade eben";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

function statusTone(status: string): "neutral" | "warning" | "success" | "error" {
  switch (status) {
    case "processed":
      return "success";
    case "failed":
      return "error";
    case "irrelevant":
      return "neutral";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

export function EmailSyncClient({ initialFolders }: { initialFolders: Folder[] }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("folders");
  const [folders, setFolders] = useState<Folder[]>(initialFolders);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "E-Mail-Sync" },
        ]}
        title="E-Mail-Sync"
        description="Microsoft-Graph-Pipeline ersetzt Make.com. Outlook-Folder von info@ werden alle 2 Min gepollt, Mails durch die existierende KI-Pipeline verarbeitet."
        meta={
          <>
            <Badge tone="neutral" size="md">
              {folders.filter((f) => f.enabled).length} aktive Folder
            </Badge>
          </>
        }
      />

      <SectionCard padding="none" headerBorder={false}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line-subtle">
          <div
            role="tablist"
            aria-label="E-Mail-Sync Tabs"
            className="inline-flex bg-canvas border border-line-subtle rounded-md p-0.5"
          >
            <TabButton active={tab === "folders"} onClick={() => setTab("folders")} label="Folder" />
            <TabButton active={tab === "monitor"} onClick={() => setTab("monitor")} label="Live-Monitor" />
            <TabButton active={tab === "telemetry"} onClick={() => setTab("telemetry")} label="Telemetrie" />
          </div>
        </div>

        <div className="p-5">
          {tab === "folders" && (
            <FoldersTab folders={folders} setFolders={setFolders} toast={toast} />
          )}
          {tab === "monitor" && <MonitorTab folders={folders} toast={toast} />}
          {tab === "telemetry" && <TelemetryTab toast={toast} />}
        </div>
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Tab-Button
   ════════════════════════════════════════════════════════════════════════ */

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-foreground-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 1: Folder-Verwaltung
   ════════════════════════════════════════════════════════════════════════ */

function FoldersTab({
  folders,
  setFolders,
  toast,
}: {
  folders: Folder[];
  setFolders: (f: Folder[]) => void;
  toast: ReturnType<typeof useToast>["toast"];
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

  return (
    <div className="flex flex-col gap-4">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleEnabled(f)}
                      >
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
  toast: ReturnType<typeof useToast>["toast"];
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

/* ════════════════════════════════════════════════════════════════════════
   TAB 2: Live-Monitor
   ════════════════════════════════════════════════════════════════════════ */

function MonitorTab({
  folders,
  toast,
}: {
  folders: Folder[];
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderFilter, setFolderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [trace, setTrace] = useState<LogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (folderFilter) params.set("folder_id", folderFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (mismatchOnly) params.set("mismatch", "true");
    try {
      const res = await fetch(`/api/email-sync/log?${params}`);
      const json = await res.json();
      if (res.ok) setEntries(json.entries ?? []);
    } catch {
      toast.error("Log-Liste konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [folderFilter, statusFilter, mismatchOnly, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-Refresh alle 30 Sek
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function replay(entry: LogEntry) {
    if (!confirm(`Mail "${entry.subject}" erneut durch die Pipeline jagen?`)) return;
    const res = await fetch(
      `/api/email-sync/log/${encodeURIComponent(entry.internet_message_id)}/replay`,
      { method: "POST" },
    );
    const json = await res.json();
    if (res.ok && json.success) {
      toast.success(`Replay erfolgreich: ${json.outcome}`);
      load();
    } else {
      toast.error(json.error || json.fehler || "Replay fehlgeschlagen");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="text-xs"
          >
            <option value="">Alle Folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.folder_path}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs"
          >
            <option value="">Alle Status</option>
            <option value="processed">Verarbeitet</option>
            <option value="irrelevant">Irrelevant</option>
            <option value="failed">Fehlgeschlagen</option>
            <option value="pending">Ausstehend</option>
          </Select>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={mismatchOnly}
              onChange={(e) => setMismatchOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span>Nur Folder-Mismatch</span>
          </label>
        </div>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <IconRefresh className="h-3.5 w-3.5" />
          Neu laden
        </Button>
      </div>

      {entries.length === 0 && !loading ? (
        <EmptyState
          icon={<IconMail className="h-10 w-10" />}
          title="Keine Einträge"
          description="Sobald der Cron läuft, erscheinen hier verarbeitete Mails."
        />
      ) : (
        <div className="rounded-lg border border-line-subtle overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-canvas border-b border-line-subtle">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Zeit</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Folder</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Sender</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Betreff</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Kosten</th>
                <th className="text-right px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.internet_message_id}
                  className={cn(
                    "border-b border-line-subtle last:border-0 hover:bg-canvas",
                    e.folder_mismatch && "bg-warning-bg/30",
                  )}
                >
                  <td className="px-3 py-2 text-foreground-muted whitespace-nowrap">
                    {relativeTime(e.created_at)}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {e.mail_sync_folders?.folder_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[180px]">{e.sender ?? "—"}</td>
                  <td className="px-3 py-2 truncate max-w-[280px]">{e.subject ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(e.status)} size="sm">
                      {e.status}
                    </Badge>
                    {e.folder_mismatch && (
                      <Badge tone="warning" size="sm" className="ml-1">
                        Mismatch
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono-amount">
                    {e.openai_cost_eur ? `${Number(e.openai_cost_eur).toFixed(4)} €` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setTrace(e)}>
                        Trace
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => replay(e)}>
                        <IconPlay className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trace && <TraceModal entry={trace} onClose={() => setTrace(null)} />}
    </div>
  );
}

function TraceModal({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Trace-Details" size="lg">
      <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="text-foreground-subtle">Internet-Message-ID</dt>
        <dd className="font-mono-amount break-all">{entry.internet_message_id}</dd>

        <dt className="text-foreground-subtle">Folder</dt>
        <dd>
          {entry.mail_sync_folders?.folder_path}
          {entry.folder_hint && (
            <span className="ml-1 text-foreground-subtle">(hint: {HINT_LABELS[entry.folder_hint] ?? entry.folder_hint})</span>
          )}
        </dd>

        <dt className="text-foreground-subtle">Sender</dt>
        <dd>{entry.sender ?? "—"}</dd>

        <dt className="text-foreground-subtle">Betreff</dt>
        <dd>{entry.subject ?? "—"}</dd>

        <dt className="text-foreground-subtle">Status</dt>
        <dd>
          <Badge tone={statusTone(entry.status)} size="sm">
            {entry.status}
          </Badge>
        </dd>

        <dt className="text-foreground-subtle">KI-Klassifikation</dt>
        <dd>
          {entry.ki_classified_as ?? "—"}
          {entry.ki_confidence !== null && (
            <span className="ml-1 text-foreground-subtle">
              ({Math.round(entry.ki_confidence * 100)}%)
            </span>
          )}
        </dd>

        <dt className="text-foreground-subtle">Folder-Mismatch</dt>
        <dd>{entry.folder_mismatch ? "Ja — KI wich vom Folder-Hint ab" : "Nein"}</dd>

        <dt className="text-foreground-subtle">Tokens (in/out)</dt>
        <dd className="font-mono-amount">
          {entry.openai_input_tokens ?? "—"} / {entry.openai_output_tokens ?? "—"}
        </dd>

        <dt className="text-foreground-subtle">Kosten</dt>
        <dd className="font-mono-amount">
          {entry.openai_cost_eur ? `${Number(entry.openai_cost_eur).toFixed(4)} €` : "—"}
        </dd>

        <dt className="text-foreground-subtle">Empfangen</dt>
        <dd>{entry.received_at ? new Date(entry.received_at).toLocaleString("de-DE") : "—"}</dd>

        <dt className="text-foreground-subtle">Verarbeitet</dt>
        <dd>{entry.processed_at ? new Date(entry.processed_at).toLocaleString("de-DE") : "—"}</dd>

        <dt className="text-foreground-subtle">Bestellung</dt>
        <dd>
          {entry.bestellung_id ? (
            <a
              href={`/bestellungen/${entry.bestellung_id}`}
              className="text-brand hover:underline font-mono-amount"
            >
              {entry.bestellung_id.slice(0, 8)}…
            </a>
          ) : (
            "—"
          )}
        </dd>

        {entry.error_msg && (
          <>
            <dt className="text-foreground-subtle">Fehler</dt>
            <dd className="text-error font-mono-amount whitespace-pre-wrap">{entry.error_msg}</dd>
          </>
        )}
      </dl>

      <div className="flex justify-end pt-4 border-t border-line-subtle mt-4">
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 3: Telemetrie
   ════════════════════════════════════════════════════════════════════════ */

function TelemetryTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [data, setData] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/email-sync/telemetry")
      .then((res) => res.json())
      .then(setData)
      .catch(() => toast.error("Telemetrie konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    );
  }
  if (!data) return null;

  const sparklineData = data.daily_spend.map((d) => d.eur);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI-Zeile */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Mails (30 Tage)" value={data.total_mails_30d.toLocaleString("de-DE")} />
        <Stat
          label="OpenAI-Kosten (30 Tage)"
          value={`${data.total_cost_30d_eur.toFixed(2)} €`}
          sparkline={sparklineData}
        />
        <Stat
          label="Folder-Mismatch-Rate"
          value={`${(data.mismatch_rate * 100).toFixed(1)} %`}
          tone={data.mismatch_rate > 0.15 ? "warning" : "success"}
        />
        <Stat
          label="Verarbeitet / Fehler / Irrelevant"
          value={`${data.status_counts.processed} / ${data.status_counts.failed} / ${data.status_counts.irrelevant}`}
        />
      </div>

      {/* Folder-Health */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Folder-Health</h3>
        <div className="rounded-lg border border-line-subtle overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-canvas border-b border-line-subtle">
              <tr>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Folder</th>
                <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">24h</th>
                <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Letzter Sync</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.folder_health.map((f) => (
                <tr key={f.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-3 py-2">{f.folder_path}</td>
                  <td className="px-3 py-2 text-right font-mono-amount">{f.mails_24h}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">
                    {relativeTime(f.last_sync_at)}
                  </td>
                  <td className="px-3 py-2">
                    {f.last_error ? (
                      <Badge tone="error" size="sm">
                        Fehler
                      </Badge>
                    ) : !f.enabled ? (
                      <Badge tone="neutral" size="sm">
                        Aus
                      </Badge>
                    ) : (
                      <Badge tone="success" size="sm">
                        OK
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top-10 Costly */}
      {data.top_costly.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Top 10 teuerste Mails (30 Tage)</h3>
          <div className="rounded-lg border border-line-subtle overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-canvas border-b border-line-subtle">
                <tr>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Zeit</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Sender</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-foreground-subtle">Betreff</th>
                  <th className="text-right px-3 py-2 uppercase tracking-wider text-foreground-subtle">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {data.top_costly.map((c) => (
                  <tr key={c.internet_message_id} className="border-b border-line-subtle last:border-0">
                    <td className="px-3 py-2 text-foreground-muted whitespace-nowrap">
                      {relativeTime(c.created_at)}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{c.sender ?? "—"}</td>
                    <td className="px-3 py-2 truncate max-w-[300px]">{c.subject ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono-amount">
                      {c.cost_eur.toFixed(4)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sparkline,
  tone,
}: {
  label: string;
  value: string;
  sparkline?: number[];
  tone?: "warning" | "success";
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-card p-4">
      <div className="text-[11px] text-foreground-subtle uppercase tracking-wider mb-2">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-semibold font-mono-amount",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {sparkline && sparkline.length > 0 && (
        <div className="mt-2 h-8">
          <Sparkline data={sparkline} width={140} height={32} ariaLabel="OpenAI-Kosten Trend 30 Tage" />
        </div>
      )}
    </div>
  );
}
