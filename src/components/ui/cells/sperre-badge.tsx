import { IconLock } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { sperrText, type SperreFelder } from "@/lib/sperre";

/**
 * SperreBadge — rotes "Gesperrt" neben dem Status (11.10.2026).
 *
 * Erscheint in Listen, Buchhaltung und Detailkopf, sobald eine Bestellung
 * `gesperrt_am` traegt. Der Tooltip nennt Urheber, Datum und Grund, damit
 * niemand erst den Vorgang oeffnen muss, um zu wissen, warum nichts geht.
 */
export function SperreBadge({
  bestellung,
  size = "sm",
  className,
}: {
  bestellung: SperreFelder | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!bestellung?.gesperrt_am) return null;
  const text = sperrText(bestellung);
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-error/30 bg-error-bg font-bold uppercase tracking-wide text-error",
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
        className,
      )}
    >
      <IconLock className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      Gesperrt
    </span>
  );
}
