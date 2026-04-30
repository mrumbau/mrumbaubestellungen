"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Toast system — lightweight, no dependencies.
 *
 * Usage:
 *   // In (dashboard)/layout.tsx or root layout:
 *   <ToastProvider>{children}</ToastProvider>
 *
 *   // In any client component:
 *   const { toast } = useToast();
 *   toast.success("Bestellung freigegeben");
 *   toast.error("Fehler beim Speichern", { description: "..." });
 *
 * Accessibility:
 * - Region uses aria-live="polite" → announces without stealing focus.
 * - role="status" on each toast.
 * - Close button has aria-label.
 * - prefers-reduced-motion is respected via globals.css.
 *
 * ────────────────────────────────────────────────────────────────────
 * Feedback-Pattern Decision Matrix (use the right tool for the situation)
 * ────────────────────────────────────────────────────────────────────
 *
 *   Toast — non-blocking, auto-dismiss (default 4s):
 *     ✓ Success-Confirms ("Bestellung gespeichert")
 *     ✓ Background-Action-Acknowledgements ("3 Bestellungen archiviert")
 *     ✓ Soft-Errors that don't require user action
 *     ✗ Form-Validation-Errors (use inline Alert/error-prop on Input)
 *     ✗ Destructive-Confirm (use Modal/ConfirmDialog)
 *
 *   Inline Alert (`<Alert tone="error|warning|info|success">`):
 *     ✓ Form-Level errors (Login: "E-Mail oder Passwort falsch")
 *     ✓ Page-Level state-banner ("KI-Analyse läuft im Hintergrund…")
 *     ✓ Persistent until user fixes the underlying issue
 *     ✗ Transient confirms (use Toast)
 *
 *   Modal (`<Modal>` / `<ConfirmDialog>`):
 *     ✓ Destructive-Confirm ("Bestellung wirklich löschen?")
 *     ✓ Required user-input that blocks the flow
 *     ✓ Multi-step wizard (DATEV-Export configuration)
 *     ✗ Simple acknowledgements (use Toast)
 *     ✗ Inline-Field-Errors (use Input.error prop)
 *
 *   Field-Error (`<Input error="…">` / `aria-invalid`):
 *     ✓ Per-field validation feedback ("Mindestens 8 Zeichen")
 *     ✓ Real-time on-blur validation
 *     ✗ Form-Submit-Errors (use Alert above the form)
 *
 * Don't mix patterns: a destructive action either uses ConfirmDialog OR a
 * toast with an "Undo"-action — not both. A field-error inline OR an alert
 * above the form — not both.
 */

type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  duration: number;
  action?: { label: string; onClick: () => void };
};

type ToastAPI = {
  toast: {
    (title: React.ReactNode, opts?: ToastOptions): string;
    success: (title: React.ReactNode, opts?: ToastOptions) => string;
    error: (title: React.ReactNode, opts?: ToastOptions) => string;
    warning: (title: React.ReactNode, opts?: ToastOptions) => string;
    info: (title: React.ReactNode, opts?: ToastOptions) => string;
  };
  dismiss: (id: string) => void;
};

type ToastOptions = {
  tone?: ToastTone;
  description?: React.ReactNode;
  duration?: number; // 0 = persistent
  action?: { label: string; onClick: () => void };
};

const ToastContext = React.createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() muss innerhalb von <ToastProvider> verwendet werden.");
  }
  return ctx;
}

const toneClasses: Record<ToastTone, { bar: string; icon: string }> = {
  success: { bar: "bg-success", icon: "text-success" },
  error: { bar: "bg-error", icon: "text-error" },
  warning: { bar: "bg-warning", icon: "text-warning" },
  info: { bar: "bg-info", icon: "text-info" },
};

const icons: Record<ToastTone, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 10-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = React.useCallback(
    (title: React.ReactNode, opts: ToastOptions = {}): string => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tone = opts.tone ?? "info";
      const duration = opts.duration ?? (tone === "error" ? 6000 : 4000);

      const item: ToastItem = {
        id,
        tone,
        title,
        description: opts.description,
        duration,
        action: opts.action,
      };
      setItems((prev) => [...prev, item]);

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const api = React.useMemo<ToastAPI>(() => {
    const base = (title: React.ReactNode, opts?: ToastOptions) => pushToast(title, opts);
    const toast = Object.assign(base, {
      success: (title: React.ReactNode, opts?: ToastOptions) =>
        pushToast(title, { ...opts, tone: "success" }),
      error: (title: React.ReactNode, opts?: ToastOptions) =>
        pushToast(title, { ...opts, tone: "error" }),
      warning: (title: React.ReactNode, opts?: ToastOptions) =>
        pushToast(title, { ...opts, tone: "warning" }),
      info: (title: React.ReactNode, opts?: ToastOptions) =>
        pushToast(title, { ...opts, tone: "info" }),
    });
    return { toast, dismiss };
  }, [pushToast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className={cn(
        "pointer-events-none fixed z-[100]",
        "bottom-3 right-3 sm:bottom-4 sm:right-4",
        "flex flex-col gap-2 w-[min(92vw,360px)] safe-area-bottom",
      )}
    >
      {items.map((item) => {
        const t = toneClasses[item.tone];
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto animate-scale-in",
              "flex items-start gap-2.5 rounded-lg bg-surface border border-line",
              "shadow-[var(--shadow-elevated)] pl-3 pr-2 py-2.5",
              "relative overflow-hidden",
            )}
          >
            <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", t.bar)} />
            <span aria-hidden="true" className={cn("mt-0.5 shrink-0", t.icon)}>
              {icons[item.tone]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-foreground leading-snug">
                {item.title}
              </div>
              {item.description && (
                <div className="mt-0.5 text-[12px] leading-snug text-foreground-muted">
                  {item.description}
                </div>
              )}
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    onDismiss(item.id);
                  }}
                  className={cn(
                    "mt-1.5 inline-flex items-center text-[12px] font-semibold",
                    "text-brand hover:text-brand-light underline underline-offset-2",
                    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded",
                  )}
                >
                  {item.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Benachrichtigung schließen"
              className={cn(
                "shrink-0 h-6 w-6 inline-flex items-center justify-center rounded",
                "text-foreground-subtle hover:text-foreground hover:bg-canvas transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
              )}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
