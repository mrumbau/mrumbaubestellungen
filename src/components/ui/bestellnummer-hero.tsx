import * as React from "react";
import { cn } from "@/lib/cn";
import { displayBestellnummer } from "@/lib/bestellung-utils";

/**
 * BestellnummerHero — editoriale Display-Variante für die Bestellnummer
 * auf der Bestelldetail-Page. Macht die Identität der Bestellung zum
 * visuellen Anker statt zu einer von zehn konkurrierenden Pills.
 *
 * Skala: clamp(36px, 5vw, 64px) in Barlow Condensed, tabular-nums (damit
 * Bestellnummern mit Ziffern + Buchstaben nicht springen).
 *
 * Halluzinations-Schutz: Wenn keine echte Bestellnummer da ist
 * (`displayBestellnummer` liefert "Ohne Nr."), rendert die Komponente
 * stattdessen einen Eyebrow "BN unbekannt" über dem Fallback-Identifier
 * (z.B. die ersten 8 Stellen der internen UUID). Visuell zurückhaltender,
 * aber immer noch der Anker.
 *
 * Wird ausschließlich auf der Detail-Page eingesetzt. Listen-Cards nutzen
 * weiter font-mono-amount + text-h2 für Bestellnummern.
 */
export type BestellnummerHeroProps = {
  bestellung: {
    id?: string | null;
    bestellnummer?: string | null;
    auftragsnummer?: string | null;
    lieferscheinnummer?: string | null;
  };
  /** Sub-Line rechts neben oder unter der Nummer (z.B. Vendor-Name + Alter). */
  subline?: React.ReactNode;
  className?: string;
};

export function BestellnummerHero({
  bestellung,
  subline,
  className,
}: BestellnummerHeroProps) {
  const display = displayBestellnummer(bestellung);
  const isFallback = display === "Ohne Nr.";
  const internalRef = bestellung.id ? `BNi-${bestellung.id.slice(0, 8).toUpperCase()}` : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {isFallback && (
        <div className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
          BN unbekannt
        </div>
      )}
      <h1
        className={cn(
          "font-headline text-display-numeral tracking-tight tabular-nums",
          isFallback ? "text-foreground-muted" : "text-foreground",
        )}
      >
        {isFallback && internalRef ? internalRef : display}
      </h1>
      {subline && (
        <div className="text-body-sm text-foreground-muted">{subline}</div>
      )}
    </div>
  );
}
