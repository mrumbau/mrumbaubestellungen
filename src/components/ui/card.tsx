import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Card — the primary grouping surface. Uses the existing `.card` rule
 * (border + shadow-card + bg-surface + rounded-lg) from globals.css
 * so elevation is tied to the global shadow scale.
 */
export const cardVariants = cva("card", {
  variants: {
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
      xl: "p-6",
    },
    interactive: {
      true: "card-hover cursor-pointer",
      false: "",
    },
    tone: {
      default: "",
      // Subtle brand-accented card for admin/system panels — uses the industrial red-accent
      accent:
        "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-brand " +
        "relative overflow-hidden",
    },
  },
  defaultVariants: {
    padding: "md",
    interactive: false,
    tone: "default",
  },
});

export type CardProps = VariantProps<typeof cardVariants> &
  React.HTMLAttributes<HTMLDivElement>;

export function Card({
  padding,
  interactive,
  tone,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(cardVariants({ padding, interactive, tone }), className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * SectionCard — a card with a header row (title + description + optional action).
 * Use this for Settings page sections (Händler, Projekte, …) so every section
 * has identical header rhythm and action-button placement.
 */
export function SectionCard({
  title,
  description,
  action,
  footer,
  className,
  children,
  padding = "lg",
  tone,
  headerBorder = true,
  ...rest
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  headerBorder?: boolean;
} & CardProps) {
  return (
    <Card padding="none" tone={tone} className={cn("overflow-hidden", className)} {...rest}>
      {(title || action) && (
        <div
          className={cn(
            "flex items-start justify-between gap-4 px-5 pt-4 pb-3",
            headerBorder ? "border-b border-line-subtle" : "",
          )}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="font-headline text-[15px] tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground-muted">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0 pt-0.5">{action}</div>}
        </div>
      )}
      <div
        className={cn(
          padding === "none"
            ? ""
            : padding === "sm"
              ? "p-3"
              : padding === "md"
                ? "p-4"
                : padding === "xl"
                  ? "p-6"
                  : "p-5",
        )}
      >
        {children}
      </div>
      {footer && (
        <div className="border-t border-line-subtle bg-canvas px-5 py-3">{footer}</div>
      )}
    </Card>
  );
}
