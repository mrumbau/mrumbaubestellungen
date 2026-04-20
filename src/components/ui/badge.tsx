import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeTone =
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "muted";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[#eef1f5] text-[#3d4350]",
  brand: "bg-[rgba(87,0,6,0.08)] text-[var(--mr-red)]",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
  muted: "bg-canvas text-foreground-muted border border-line",
};

type BadgeSize = "sm" | "md";
const sizeClasses: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 h-4",
  md: "text-[11px] px-2 py-0.5 h-5",
};

export function Badge({
  tone = "neutral",
  size = "md",
  className,
  children,
  ...rest
}: {
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-semibold uppercase tracking-wide whitespace-nowrap",
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
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
      style={{
        color: meta.color,
        backgroundColor: meta.bg,
      }}
    >
      <span
        aria-hidden="true"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: meta.color }}
      />
      {label ?? meta.label}
    </span>
  );
}
