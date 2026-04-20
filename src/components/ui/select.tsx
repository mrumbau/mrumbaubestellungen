"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { FieldShell, inputBase } from "./input";

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  wrapperClassName?: string;
  selectSize?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-8 pl-2.5 pr-8 py-1",
  md: "h-9 pl-3 pr-9 py-1.5",
  lg: "h-11 pl-3.5 pr-10 py-2",
} as const;

export function Select({
  label,
  hint,
  error,
  required,
  className,
  wrapperClassName,
  selectSize = "md",
  id,
  children,
  ...rest
}: SelectProps) {
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
          <select
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required={required}
            className={cn(
              inputBase,
              sizeClasses[selectSize],
              // Reset browser chevron to draw our own for visual consistency
              "appearance-none bg-no-repeat cursor-pointer",
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-subtle"
          >
            <path
              d="M5.5 8l4.5 4.5L14.5 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </FieldShell>
  );
}
