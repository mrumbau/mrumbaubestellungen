import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Alert — persistent, non-dismissable feedback bound to a region.
 * For transient feedback use <Toast> via useToast() instead.
 */
export const alertVariants = cva(
  "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed",
  {
    variants: {
      tone: {
        error: "bg-error-bg border-error-border",
        success: "bg-success-bg border-success-border",
        warning: "bg-warning-bg border-warning-border",
        info: "bg-info-bg border-info-border",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const iconToneClass: Record<NonNullable<VariantProps<typeof alertVariants>["tone"]>, string> = {
  error: "text-error",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
};

const titleToneClass = iconToneClass;

const icons: Record<NonNullable<VariantProps<typeof alertVariants>["tone"]>, React.ReactNode> = {
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 10-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M8.3 2.7a2 2 0 013.4 0l6.5 11a2 2 0 01-1.7 3H3.5a2 2 0 01-1.7-3l6.5-11zM10 8a1 1 0 00-1 1v3a1 1 0 102 0V9a1 1 0 00-1-1zm0 7a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export type AlertProps = VariantProps<typeof alertVariants> & {
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  role?: "alert" | "status";
};

export function Alert({
  tone = "info",
  title,
  children,
  icon: customIcon,
  onDismiss,
  className,
  role,
}: AlertProps) {
  const resolvedTone = tone ?? "info";
  const computedRole = role ?? (resolvedTone === "error" ? "alert" : "status");

  return (
    <div
      role={computedRole}
      aria-live={computedRole === "alert" ? "assertive" : "polite"}
      className={cn(alertVariants({ tone }), className)}
    >
      <span
        aria-hidden="true"
        className={cn("mt-0.5 shrink-0", iconToneClass[resolvedTone])}
      >
        {customIcon ?? icons[resolvedTone]}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <div className={cn("font-semibold mb-0.5", titleToneClass[resolvedTone])}>
            {title}
          </div>
        )}
        {children && <div className="text-foreground">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Schließen"
          className={cn(
            "shrink-0 -mr-1 -mt-1 rounded p-1 opacity-60 hover:opacity-100 hover:bg-black/5 transition-opacity",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          )}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}
