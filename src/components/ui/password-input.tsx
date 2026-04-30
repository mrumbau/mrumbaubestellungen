"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";
import { inputBase, inputSizeVariants } from "./input";
import type { VariantProps } from "class-variance-authority";

/**
 * PasswordInput — Input mit Show/Hide-Toggle.
 *
 * Folgt Material Design + Apple HIG: Show/Hide-Toggle für Passwortfelder
 * verbessert Erfolgsrate, vor allem auf Mobile mit Soft-Keyboards.
 *
 * a11y:
 * - Toggle-Button hat klares aria-label (kontextabhängig)
 * - aria-pressed reflects current visibility state
 * - aria-invalid auf <input>, wenn `error` gesetzt
 * - aria-describedby verweist auf Hint/Error-IDs
 */
type InputSizeVariant = VariantProps<typeof inputSizeVariants>;

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> &
  InputSizeVariant & {
    label?: React.ReactNode;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    wrapperClassName?: string;
  };

export function PasswordInput({
  label,
  hint,
  error,
  inputSize,
  required,
  id,
  className,
  wrapperClassName,
  autoComplete = "current-password",
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          autoComplete={autoComplete}
          className={cn(
            inputBase,
            inputSizeVariants({ inputSize }),
            "pr-10",
            className,
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
          aria-pressed={visible}
          tabIndex={-1}
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2",
            "p-1.5 rounded-md text-foreground-subtle hover:text-foreground hover:bg-surface-hover",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            "transition-colors",
          )}
        >
          {visible ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
        </button>
      </div>
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

function IconEye({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2.25" />
    </svg>
  );
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l12 12" />
      <path d="M6.5 6.5a2.25 2.25 0 003 3" />
      <path d="M3.5 4.5C2.2 5.6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.4-.4 3.4-1" />
      <path d="M5.5 3.7c.8-.2 1.6-.2 2.5-.2 4 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.3" />
    </svg>
  );
}
