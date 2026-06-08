import { cn } from "@/lib/cn";

/**
 * PayPalBadge — kleines blaues "P" wenn eine Bestellung per PayPal
 * (oder einer anderen bereits-erkannten Zahlungsmethode) bezahlt wurde.
 *
 * Anzeige nur wenn:
 *   - `bezahlt_bereits` ist true (KI hat eindeutig erkannt) ODER
 *   - `bezahlt_am` ist gesetzt UND `bezahlt_von` enthält "PayPal"/"Auto-erkannt"
 *
 * Stufe-3-Element (subtle) nach Drei-Sprachen-Disziplin v2.
 * Tooltip via native `title`-Attribut (a11y-konform, keine Hook-Abhängigkeit).
 *
 * 03.06.2026 — Bezahlt-Erkennung (UX-R7).
 */
export interface PayPalBadgeProps {
  /** Aus dokumente.bezahlt_bereits (KI-erkannt) oder bestellungen-aggregiert. */
  bezahltBereits?: boolean | null;
  /** Aus dokumente.zahlungsmethode oder bestellungen-aggregiert. */
  zahlungsmethode?: string | null;
  /** Optional: größere Variante für Detail-Header. */
  size?: "sm" | "md";
  className?: string;
}

export function PayPalBadge({
  bezahltBereits,
  zahlungsmethode,
  size = "sm",
  className,
}: PayPalBadgeProps) {
  // Wir zeigen das P NUR wenn KI tatsächlich "bezahlt_bereits=true" erkannt
  // hat (= Auto-Erkennung), nicht bei manueller Buchhaltung-Markierung.
  if (!bezahltBereits) return null;

  const isPayPal = zahlungsmethode === "paypal";
  const methodLabel = (() => {
    switch (zahlungsmethode) {
      case "paypal":
        return "PayPal";
      case "vorkasse":
        return "Vorkasse";
      case "kreditkarte":
        return "Kreditkarte";
      case "lastschrift":
        return "Lastschrift";
      case "klarna":
        return "Klarna";
      case "stripe":
        return "Stripe";
      case "sofort":
        return "Sofortüberweisung";
      case "ueberweisung":
        return "Überweisung";
      case "andere":
        return "andere Zahlungsmethode";
      default:
        return "Auto-erkannt";
    }
  })();

  const tooltip = isPayPal
    ? "PayPal bezahlt"
    : `Bereits bezahlt (${methodLabel})`;

  // Blau für PayPal (Brand-Farbe), neutral für andere Methoden.
  // Wir hardcoden den exakten Hex für PayPal-Blau (#0070BA) — DESIGN.md
  // erlaubt das explizit für externe Marken-Identitäten (gleiches Pattern
  // wie CardScan-Emerald-Sub-Brand).
  const sizeClasses =
    size === "md"
      ? "h-5 w-5 text-[12px]"
      : "h-4 w-4 text-[10px]";

  // PayPal-Blau als externes Markenzeichen — bewusst hardcoded, keine
  // Token-Familie, weil es nur diese eine Stelle gibt. Inline-Style
  // umgeht den Tailwind-Default-Color-Blocker per Design.
  const paypalStyle = isPayPal
    ? { background: "#0070BA", color: "#ffffff" }
    : undefined;

  return (
    <span
      role="img"
      aria-label={tooltip}
      title={tooltip}
      style={paypalStyle}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-headline font-bold leading-none",
        "tabular-nums select-none",
        sizeClasses,
        !isPayPal && "bg-success/15 text-success",
        className,
      )}
    >
      {isPayPal ? "P" : "✓"}
    </span>
  );
}
