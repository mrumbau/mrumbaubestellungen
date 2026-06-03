import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * SidebarBlock (UX-R3, 03.06.2026) — visueller Wrapper für die 3-Block-
 * Konsolidierung in der Detail-Sidebar.
 *
 * Aus 7 stacked Accordion-Panels werden 3 visuelle Gruppen:
 *   1. **AktionBlock**    — primärer CTA + Verwerfen-Ghost (ApprovalPanel)
 *   2. **MetaBlock**      — Bestellungsart / Projekt / Vendor (SidebarMetadata + KI-Vorschlag inline)
 *   3. **AktivitätBlock** — Timeline / Kommentare / KI-Tools (collapsible)
 *
 * Jeder Block hat einen Eyebrow-Title in `text-eyebrow uppercase tracking-
 * [0.18em]` als visueller Anker. Spacing zwischen Blocks (`gap-6`) ist
 * absichtlich größer als zwischen Children (`gap-3`) — der Block-Schnitt
 * dominiert die Sub-Card-Struktur.
 */
export function SidebarBlock({
  title,
  children,
  description,
  className,
}: {
  /** Eyebrow-Label oberhalb der Block-Children. */
  title: string;
  children: React.ReactNode;
  /** Optionaler Untertext zwischen Title und Children. */
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-eyebrow uppercase tracking-[0.18em] font-semibold text-foreground-subtle">
          {title}
        </h2>
      </div>
      {description && (
        <p className="text-meta text-foreground-muted -mt-1">{description}</p>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
