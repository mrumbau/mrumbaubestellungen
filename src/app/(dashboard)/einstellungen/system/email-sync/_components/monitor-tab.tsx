"use client";

/**
 * MonitorTab + TraceModal.
 * Aus email-sync-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { IconMail, IconRefresh, IconPlay } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { relativeTime, statusTone } from "./helpers";
import { HINT_LABELS, type Folder, type LogEntry, type ToastFn } from "./types";

export function MonitorTab({
  folders,
  toast,
}: {
  folders: Folder[];
  toast: ToastFn & {
    success: ToastFn;
    error: ToastFn;
    warning: ToastFn;
    info: ToastFn;
  };
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
                <th className="text-left px-3 py-2 font-semibold text-foreground-subtle uppercase tracking-wider">Parser</th>
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
                  <td className="px-3 py-2">
                    {e.parser_source === "vendor" && e.parser_name ? (
                      <Badge tone="success" size="sm" title={`Deterministischer ${e.parser_name}-Parser`}>
                        {e.parser_name}
                      </Badge>
                    ) : e.parser_source === "ki" ? (
                      <Badge tone="info" size="sm">
                        KI
                      </Badge>
                    ) : (
                      <span className="text-foreground-subtle">—</span>
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

        <dt className="text-foreground-subtle">Parser-Quelle</dt>
        <dd>
          {entry.parser_source === "vendor" && entry.parser_name ? (
            <>
              <Badge tone="success" size="sm">{entry.parser_name}</Badge>
              <span className="ml-1 text-foreground-subtle">deterministisch (kein KI-Aufruf)</span>
            </>
          ) : entry.parser_source === "ki" ? (
            <Badge tone="info" size="sm">OpenAI gpt-4o</Badge>
          ) : (
            "—"
          )}
        </dd>

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
