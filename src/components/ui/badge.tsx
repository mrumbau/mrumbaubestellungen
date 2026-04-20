import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded font-semibold uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      tone: {
        // eslint-disable-next-line no-restricted-syntax -- cool-gray outside brand palette; used for generic role-badges. Introduce `--neutral-*` tokens if needed beyond this single variant.
        neutral: "bg-[#eef1f5] text-[#3d4350]",
        brand: "bg-[rgba(87,0,6,0.08)] text-[var(--mr-red)]",
        info: "bg-info-bg text-info",
        success: "bg-success-bg text-success",
        warning: "bg-warning-bg text-warning",
        error: "bg-error-bg text-error",
        muted: "bg-canvas text-foreground-muted border border-line",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.5 h-4",
        md: "text-[11px] px-2 py-0.5 h-5",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

export type BadgeProps = VariantProps<typeof badgeVariants> &
  Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
    children?: React.ReactNode;
  };

export function Badge({ tone, size, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...rest}>
      {children}
    </span>
  );
}

/**
 * StatusBadge — reuses the existing `.status-tag` rule (linker Farbbalken)
 * from globals.css for Bestellungs-Workflow states. Keep this aligned with
 * the DB status enum in `bestellungen.status`.
 */
type BestellungStatus =
  | "erwartet"
  | "offen"
  | "vollstaendig"
  | "abweichung"
  | "ls_fehlt"
  | "freigegeben";

const statusMeta: Record<BestellungStatus, { label: string; color: string; bg: string }> = {
  erwartet: { label: "Erwartet", color: "var(--status-erwartet)", bg: "rgba(139,139,139,0.08)" },
  offen: { label: "Offen", color: "var(--status-offen)", bg: "rgba(37,99,235,0.08)" },
  vollstaendig: {
    label: "Vollständig",
    color: "var(--status-vollstaendig)",
    bg: "rgba(22,163,74,0.08)",
  },
  abweichung: {
    label: "Abweichung",
    color: "var(--status-abweichung)",
    bg: "rgba(220,38,38,0.08)",
  },
  ls_fehlt: {
    label: "LS fehlt",
    color: "var(--status-ls-fehlt)",
    bg: "rgba(217,119,6,0.08)",
  },
  freigegeben: {
    label: "Freigegeben",
    color: "var(--status-freigegeben)",
    bg: "rgba(5,150,105,0.08)",
  },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BestellungStatus;
  label?: string;
  className?: string;
}) {
  const meta = statusMeta[status];
  return (
    <span
      className={cn("status-tag", className)}
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: meta.color,
        }}
      />
      {label ?? meta.label}
    </span>
  );
}
