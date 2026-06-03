/**
 * VendorFavicon — kompaktes Vendor-Brand-Mark via Domain-Favicon.
 *
 * 03.06.2026 (Pool 2.0 Sprint 1): Pool-Karten + Drawer-Hero brauchen
 * sofortige visuelle Vendor-Erkennung. Google s2 Favicons-Service liefert
 * 64px Favicons für jede Domain — kostenfrei, CDN-cached, kein Tracking.
 *
 * Fallback-Stack:
 *   1. Wenn `domain` da: Google s2 (`https://www.google.com/s2/favicons?domain=…&sz=64`)
 *   2. Wenn 1 lädt nicht: Initial-Tile mit ersten Buchstaben des Names
 *   3. Wenn weder Domain noch Name: leerer Tile (defensive)
 *
 * Visuell:
 *   - default 32×32 mit `rounded-md`
 *   - Border in `border-line-subtle` damit auf canvas-bg sichtbar
 *   - Tile-Background = brand-very-faint (tinted neutral)
 *   - Initial = headline-font für editorial Charakter
 */

import { cn } from "@/lib/cn";

const FAVICON_SIZE = 64;

function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;
}

function getInitial(name: string | null | undefined): string {
  if (!name) return "·";
  const trimmed = name.trim();
  if (!trimmed) return "·";
  // Nimmt ersten Buchstaben des ersten "wirklichen" Wortes
  // (skipt Sonderzeichen am Anfang)
  const match = trimmed.match(/[A-Za-zÄÖÜäöüß0-9]/);
  return match ? match[0].toUpperCase() : "·";
}

export interface VendorFaviconProps {
  /** Vendor-Domain (z. B. "raab-karcher.de"). Wenn null → Initial-Fallback. */
  domain?: string | null;
  /** Vendor-Name für Initial-Fallback + alt-text. */
  name?: string | null;
  /** Größe in px (default 32). */
  size?: number;
  className?: string;
}

export function VendorFavicon({
  domain,
  name,
  size = 32,
  className,
}: VendorFaviconProps) {
  const dimension = `${size}px`;
  const initial = getInitial(name);
  const altText = name ?? domain ?? "Vendor";

  return (
    <span
      aria-hidden={!name && !domain ? true : undefined}
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 rounded-md border border-line-subtle bg-brand/[0.04] text-foreground-muted overflow-hidden",
        className,
      )}
      style={{ width: dimension, height: dimension }}
      title={altText}
    >
      {/* Initial-Fallback liegt unten — wird sichtbar wenn img weggeblendet oder
          gar nicht gerendert (kein domain). */}
      <span
        className="absolute inset-0 flex items-center justify-center font-headline text-foreground-muted leading-none select-none"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {initial}
      </span>
      {domain ? (
        // eslint-disable-next-line @next/next/no-img-element -- s2 ist extern + CDN-cached, wir wollen kein next/image-Optimierungs-Loop
        <img
          src={getFaviconUrl(domain)}
          alt={altText}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="relative h-full w-full object-contain p-0.5"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
