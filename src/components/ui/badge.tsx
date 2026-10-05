import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
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
        md: "text-[12px] px-2 py-0.5 h-5",
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

