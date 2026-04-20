import { cn } from "@/lib/cn";

type SpinnerTone = "brand" | "light" | "muted";

const toneRing: Record<SpinnerTone, string> = {
  brand: "border-[rgba(87,0,6,0.18)] border-t-[var(--mr-red)]",
  light: "border-white/30 border-t-white",
  muted: "border-[rgba(26,26,26,0.12)] border-t-[var(--text-secondary)]",
};

export function Spinner({
  size = 16,
  tone = "brand",
  className,
  "aria-label": ariaLabel = "Lädt",
}: {
  size?: number;
  tone?: SpinnerTone;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-block rounded-full border-2 animate-[spin_0.7s_linear_infinite]",
        toneRing[tone],
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
