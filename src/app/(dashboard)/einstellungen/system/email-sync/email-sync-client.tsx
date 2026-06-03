"use client";

/**
 * EmailSyncClient — Top-Level-Orchestrator für /einstellungen/system/email-sync.
 *
 * Block-4-Decomposition (12.05.2026, F6.2): von 1382 LOC monolith reduziert
 * auf Tab-Switcher + Page-Header. Tabs in `_components/`:
 *   - FoldersTab (mit HealthCard + SubscriptionCard + FolderAddModal)
 *   - MonitorTab (mit TraceModal)
 *   - TelemetryTab (mit Stat-Helper)
 */

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { FoldersTab } from "./_components/folders-tab";
import { MonitorTab } from "./_components/monitor-tab";
import { TelemetryTab } from "./_components/telemetry-tab";
import type { Folder, Tab } from "./_components/types";

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
          <Badge tone="neutral" size="md">
            {folders.filter((f) => f.enabled).length} aktive Folder
          </Badge>
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
        "px-3 py-1.5 text-meta font-medium rounded transition-colors min-h-[44px] md:min-h-0",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        active
          ? "bg-surface text-foreground shadow-card"
          : "text-foreground-subtle hover:text-foreground-muted",
      )}
    >
      {label}
    </button>
  );
}
