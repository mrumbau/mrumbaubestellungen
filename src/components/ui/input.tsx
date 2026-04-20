"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

/**
 * Base input styles — shared by <Input>, <Textarea>, <Select>.
 * - 16px font on mobile prevents iOS auto-zoom (see `md:text-sm` for desktop density).
 * - Focus state uses the brand-red box-shadow ring (consistent with buttons).
 * - Invalid state tinted via `aria-invalid="true"` — no prop drilling needed.
 */
export const inputBase =
  "w-full rounded-md border border-line bg-input text-foreground " +
  "placeholder:text-foreground-subtle " +
  "transition-[border-color,box-shadow,background-color] duration-150 " +
  "hover:border-line-strong " +
  "focus:outline-none focus:border-brand focus:bg-surface focus:shadow-[var(--shadow-focus-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-canvas " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgba(220,38,38,0.18)] " +
  "text-base md:text-sm";

const sizeClasses = {
  sm: "h-8 px-2.5 py-1",
  md: "h-9 px-3 py-1.5",
  lg: "h-11 px-3.5 py-2",
} as const;

type InputSize = keyof typeof sizeClasses;

type FieldShellProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
  children: (ids: { inputId: string; describedBy?: string }) => React.ReactNode;
};

/**
 * FieldShell renders label + input + hint/error with correct a11y wiring.
 * Generates stable IDs if not provided, ties aria-describedby to hint/error,
 * and aria-invalid to the input when error is present.
 */
export function FieldShell({
  label,
  hint,
  error,
  required,
  id,
  className,
  children,
}: FieldShellProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      {children({ inputId, describedBy })}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[12px] leading-snug text-error font-medium"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] leading-snug text-foreground-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  inputSize?: InputSize;
  wrapperClassName?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
};

export function Input({
  label,
  hint,
  error,
  inputSize = "md",
  required,
  className,
  wrapperClassName,
  iconLeft,
  iconRight,
  id,
  ...rest
}: InputProps) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      id={id}
      className={wrapperClassName}
    >
      {({ inputId, describedBy }) => (
        <div className="relative">
          {iconLeft && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4"
            >
              {iconLeft}
            </span>
          )}
          <input
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required={required}
            className={cn(
              inputBase,
              sizeClasses[inputSize],
              iconLeft ? "pl-8" : null,
              iconRight ? "pr-8" : null,
              className,
            )}
            {...rest}
          />
          {iconRight && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4"
            >
              {iconRight}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
}
