import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Skeleton — placeholder for async-loaded content.
 *
 * Uses the `.skeleton`/`.skeleton-text` classes defined in globals.css,
 * which honour `prefers-reduced-motion` and tint via `var(--border-default)`.
 *
 * Variants:
 *   - `block` (default): generic block placeholder, radius `--radius-md`
 *   - `text`:            inline text-row, radius `--radius-sm`, height `1em`
 *   - `circle`:          circular avatar/dot placeholder
 */
export function Skeleton({
  variant = "block",
  className,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "block" | "text" | "circle";
}) {
  const base =
    variant === "text"
      ? "skeleton-text"
      : variant === "circle"
        ? "skeleton rounded-full"
        : "skeleton";
  return (
    <div
      role="status"
      aria-hidden="true"
      className={cn(base, className)}
      style={style}
      {...rest}
    />
  );
}
