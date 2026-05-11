/**
 * Empty-State pro Tab. Aus archiv-client.tsx extrahiert (11.05.2026).
 */

import { EmptyState as UIEmptyState } from "@/components/ui";
import { IconFolderOpen } from "@/components/ui/icons";
import type { TabKey } from "./types";

const EMPTY_MESSAGES: Record<TabKey, { title: string; description: string }> = {
  projekte: {
    title: "Keine abgeschlossenen Projekte",
    description:
      'Projekte mit Status "Abgeschlossen" landen hier und bleiben durchsuchbar, ohne die aktive Liste zu belasten.',
  },
  material: {
    title: "Keine archivierten Material-Bestellungen",
    description:
      "Bezahlte Material-Rechnungen werden nach der Buchung automatisch hierher verschoben.",
  },
  subunternehmer: {
    title: "Keine archivierten SU-Rechnungen",
    description:
      "Bezahlte Subunternehmer-Rechnungen werden nach der Buchung automatisch hierher verschoben.",
  },
};

export function ArchivEmptyState({ type }: { type: TabKey }) {
  const msg = EMPTY_MESSAGES[type];
  return (
    <UIEmptyState
      tone="info"
      icon={<IconFolderOpen className="w-5 h-5" />}
      title={msg.title}
      description={msg.description}
    />
  );
}
