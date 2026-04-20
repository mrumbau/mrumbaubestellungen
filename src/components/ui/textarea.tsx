"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { FieldShell, inputBase } from "./input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  wrapperClassName?: string;
};

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  wrapperClassName,
  id,
  rows = 4,
  ...rest
}: TextareaProps) {
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
        <textarea
          id={inputId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={cn(inputBase, "min-h-[4.5rem] px-3 py-2 leading-relaxed resize-y", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
