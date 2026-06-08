import { EditorialSection } from "@/components/ui/editorial-section";
import { LANE_COPY, type Lane } from "./lane-config";

/**
 * LaneEmptyState — wird in einer Lane gerendert wenn `data.bestellungen`
 * leer ist. Statt einer leeren Tabelle/Inbox bekommt der User eine ruhige
 * editoriale Botschaft, die zum jeweiligen Lane-Kontext passt.
 *
 * Server-Component — keine Hooks, kein State.
 */
export function LaneEmptyState({ lane }: { lane: Lane }) {
  const copy = LANE_COPY[lane];
  return (
    <EditorialSection
      tone="neutral"
      padding="relaxed"
      className="text-center"
      ariaLabel={`Lane ist leer: ${copy.label}`}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-canvas"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-6 w-6 text-foreground-subtle"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 7h18M5 7v12a2 2 0 002 2h10a2 2 0 002-2V7M9 11h6"
            />
          </svg>
        </div>
        <h3 className="font-headline text-lead text-foreground">
          {copy.emptyTitle}
        </h3>
        <p className="text-body-sm text-foreground-muted">
          {copy.emptyDescription}
        </p>
      </div>
    </EditorialSection>
  );
}
