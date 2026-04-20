"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "subtle";
type ButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon-md";

const variants: Record<ButtonVariant, string> = {
  primary:
    // Industrial red brand button — uses existing .btn-primary rule for gradient hover sheen
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
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg font-semibold",
  "icon-sm": "h-8 w-8 rounded-md",
  "icon-md": "h-9 w-9 rounded-md",
};

const base =
  "inline-flex items-center justify-center whitespace-nowrap font-medium select-none " +
  "transition-[background-color,border-color,box-shadow,transform,color] duration-150 " +
  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] " +
  "relative";

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
};

export type ButtonProps = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children?: React.ReactNode;
  };

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  fullWidth,
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
      className={cn(
        base,
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
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
