import type { MetadataRoute } from "next";

/**
 * PWA-Manifest für das Bestellwesen-Hauptmodul (cloud.mrumbau.de).
 * Beachten: CardScan hat ein eigenes Manifest unter /cardscan-manifest.json
 * weil es ein eigenes Sub-Brand (Emerald) und Service-Worker-Scope hat.
 *
 * Next.js leitet automatisch /manifest.webmanifest aus dieser Datei ab.
 * 12.05.2026 — UI-Audit F7.8.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MR Umbau – Bestellmanagement",
    short_name: "MR Umbau",
    description:
      "Digitales Bestellmanagement für MR Umbau GmbH — Bestellungen, Lieferscheine, Rechnungen + Buchhaltungs-Freigabe.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#570006",
    lang: "de",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/apple-icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
