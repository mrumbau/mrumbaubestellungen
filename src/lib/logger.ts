/**
 * Strukturiertes Error-Logging für API-Routen.
 * Schreibt JSON-Logs mit Timestamp, Route und Fehlerdetails.
 */
export function logError(route: string, message: string, error?: unknown) {
  const entry = {
    level: "error",
    timestamp: new Date().toISOString(),
    route,
    message,
    ...(error instanceof Error
      ? { error: error.message, stack: error.stack }
      : error != null
        ? { error: String(error) }
        : {}),
  };
  console.error(JSON.stringify(entry));
}

export function logInfo(route: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    level: "info",
    timestamp: new Date().toISOString(),
    route,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}
