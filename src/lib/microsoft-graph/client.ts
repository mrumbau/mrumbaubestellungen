/**
 * Microsoft Graph fetch-Wrapper mit Auth, Retry/Throttling und Fehlertypen.
 *
 * - Auth-Token wird automatisch gesetzt
 * - 401 → einmaliger Token-Refresh und Retry
 * - 429/503 → exponentielles Backoff respektiert Retry-After-Header
 * - Andere 5xx → bis zu 2 Retries
 *
 * Endpoints sind RELATIV zur Graph-Base-URL (z.B. "/users/info@mrumbau.de/mailFolders").
 */

import { getGraphToken, refreshGraphToken } from "./auth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 3;

/**
 * F3.A6: Gemeinsamer Mailbox-Accessor. Liefert die konfigurierte Shared-Mailbox
 * (`info@mrumbau.de`) URL-encoded als Pfad-Segment. Wirft wenn ENV fehlt —
 * Boot-Validation in `src/lib/env.ts` (R3a) sollte das ohnehin abfangen.
 */
export function getMailboxSegment(): string {
  const m = process.env.MS_MAILBOX;
  if (!m) throw new Error("MS_MAILBOX nicht gesetzt");
  return encodeURIComponent(m);
}

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly graphCode?: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export interface GraphFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Override base URL (für Delta-NextLinks die als absolute URL kommen). */
  absoluteUrl?: string;
  /** Zusätzliche Header (z.B. Prefer für Delta-Page-Size). */
  headers?: Record<string, string>;
  /** Erwartete Response-Form. "json" → parse, "raw" → Response zurückgeben (für Streams). */
  responseType?: "json" | "raw";
}

export async function graphFetch<T = unknown>(
  endpoint: string,
  options: GraphFetchOptions = {},
): Promise<T> {
  const { method = "GET", body, absoluteUrl, headers = {}, responseType = "json" } = options;
  const url = absoluteUrl ?? `${GRAPH_BASE}${endpoint}`;

  let lastError: GraphError | Error = new Error("graphFetch: kein Versuch ausgeführt");
  let token = await getGraphToken();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...headers,
    };
    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 401: Token expired/revoked. Einmal refreshen und retry.
    if (res.status === 401 && attempt === 0) {
      token = await refreshGraphToken();
      continue;
    }

    // 429/503: Throttling. Retry-After respektieren.
    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers.get("Retry-After");
      const delayMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
        : Math.min(1000 * Math.pow(2, attempt), 8000);
      await sleep(delayMs);
      lastError = new GraphError(
        `Graph throttling ${res.status}, retry in ${delayMs}ms`,
        res.status,
      );
      continue;
    }

    // 5xx: kurzes Backoff
    if (res.status >= 500 && res.status < 600) {
      await sleep(1000 * (attempt + 1));
      lastError = new GraphError(`Graph 5xx ${res.status}`, res.status);
      continue;
    }

    if (!res.ok) {
      const errorBody = await safeReadJson(res);
      const code =
        typeof errorBody === "object" && errorBody && "error" in errorBody
          ? ((errorBody as { error?: { code?: string } }).error?.code ?? undefined)
          : undefined;
      throw new GraphError(
        `Graph ${res.status} ${code ?? ""}`.trim(),
        res.status,
        code,
        errorBody,
      );
    }

    if (responseType === "raw") {
      return res as unknown as T;
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  throw lastError;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
