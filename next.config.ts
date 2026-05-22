import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 22.05.2026 (Perf Stufe 4 / Item 4) — React Compiler aktivieren.
  // Babel-Plugin auto-memoizt Components ohne useMemo/useCallback-Boilerplate
  // → 30-50% weniger Re-Renders in DataTable + Filter-Pfaden erwartet.
  // Rollback: reactCompiler: false setzen falls Production-Bug.
  reactCompiler: true,
  async headers() {
    return [
      {
        // PWA-Manifest braucht den korrekten MIME-Type, sonst meckert Chrome
        // mit "Manifest: Syntax error" obwohl die JSON valide ist.
        source: "/cardscan-manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        ],
      },
      {
        // 22.05.2026 — Bestellwesen-Manifest (next-generated aus manifest.ts).
        // Ohne expliziten Content-Type liefert Next/Vercel application/octet-stream
        // oder text/plain → Chrome wirft "Manifest: Syntax error".
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        ],
      },
      {
        source: "/api/pdfs/:id*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/((?!api/pdfs).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // F2.10: Globale CSP. 'unsafe-inline'/'unsafe-eval' sind Next.js-bedingt
          // unvermeidlich (Inline-Hydration-Bootstrap, Tailwind-Runtime). connect-src
          // listet die externen Backends explizit auf — verhindert Daten-Exfil zu
          // unbekannten Endpoints. frame-ancestors 'none' blockt Clickjacking;
          // /api/pdfs hat eigene Policy mit 'self' fürs Bestelldetail-Embed.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              // 07.05.2026 — wss:// für Supabase Realtime ergänzt (sonst blockt
              // CSP die /realtime/v1/websocket-Verbindung).
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://api.openai.com https://graph.microsoft.com https://login.microsoftonline.com https://vision.googleapis.com https://app.das-programm.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
