import { NextRequest } from "next/server";

const ALLOWED_ORIGINS = [
  "https://cloud.mrumbau.de",
  "http://localhost:3000",
  "http://localhost:3001",
];

/**
 * Prüft den Origin/Referer Header gegen erlaubte Domains.
 * Gibt true zurück wenn der Request erlaubt ist.
 */
export function checkCsrf(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Origin-Header prüfen (bevorzugt)
  if (origin) {
    return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
  }

  // Fallback: Referer-Header prüfen
  if (referer) {
    return ALLOWED_ORIGINS.some((allowed) => referer.startsWith(allowed));
  }

  // Kein Origin/Referer = Server-zu-Server oder gleiche Origin (erlaubt)
  return true;
}
