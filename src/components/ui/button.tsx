"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Button variants
 *
 * primary      — brand-red, primary call-to-action (max 1 per screen, per HIG)
 * secondary    — neutral, bordered; "Cancel"-tier actions
 * ghost        — transparent; tertiary / toolbar buttons
 * destructive  — semantic red; irreversible actions (Delete, Archive)
 * subtle       — filled neutral; sits inside cards without stealing focus
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap font-medium select-none",
    "transition-[background-color,border-color,box-shadow,transform,color] duration-150",
    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
    "relative",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "btn-primary text-white " +
          "disabled:bg-[#8b6369] disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-[#8b6369] disabled:hover:translate-y-0",
        secondary:
          "bg-surface text-foreground border border-line " +
          "hover:bg-surface-hover hover:border-line-strong " +
          "active:bg-input " +
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface",
        ghost:
          "bg-transparent text-foreground-muted " +
          "hover:bg-surface-hover hover:text-foreground " +
          "active:bg-input " +
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        destructive:
          "bg-error text-white " +
          "hover:bg-[#b91c1c] hover:shadow-[0_4px_12px_rgba(220,38,38,0.25)] hover:-translate-y-px " +
          "active:translate-y-0 active:shadow-none " +
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-error disabled:hover:translate-y-0 disabled:hover:shadow-none",
        subtle:
          "bg-input text-foreground-muted border border-line " +
          "hover:bg-surface-hover hover:text-foreground " +
          "disabled:opacity-50 disabled:cursor-not-allowed",
      },
      size: {
        sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
        md: "h-9 px-4 text-sm gap-2 rounded-md",
        lg: "h-11 px-5 text-[15px] gap-2 rounded-lg font-semibold",
        "icon-sm": "h-8 w-8 rounded-md",
        "icon-md": "h-9 w-9 rounded-md",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export type ButtonProps = ButtonVariants &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    loading?: boolean;
    iconLeft?: React.ReactNode;
    iconRight?: React.ReactNode;
    children?: React.ReactNode;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isIconOnly = size === "icon-sm" || size === "icon-md";
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner
            size={size === "lg" ? 16 : 14}
            tone={variant === "primary" || variant === "destructive" ? "light" : "muted"}
            className="absolute inset-0 m-auto"
            aria-label="Lädt"
          />
          <span className="invisible inline-flex items-center gap-2">
            {iconLeft}
            {!isIconOnly && children}
            {iconRight}
          </span>
        </>
      ) : (
        <>
          {iconLeft}
          {!isIconOnly && children}
          {iconRight}
        </>
      )}
    </button>
  );
}
