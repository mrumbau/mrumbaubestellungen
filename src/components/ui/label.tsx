import * as React from "react";
import { cn } from "@/lib/cn";

export function Label({
  required,
  className,
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-medium text-foreground-muted leading-none",
        className,
      )}
      {...rest}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="text-error">
          *
        </span>
      )}
    </label>
  );
}
