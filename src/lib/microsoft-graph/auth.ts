/**
 * Microsoft Graph Authentication via Client-Credentials-Flow.
 *
 * Holt Application-Tokens (kein User-Context) für die mrumbau-email-sync App.
 * Token-Cache läuft pro Lambda-Instanz im Modul-Scope, TTL 55 min.
 * Mutex-Promise verhindert parallele Refresh-Races bei mehreren gleichzeitigen
 * Anfragen — erste startet den Refresh, weitere awaiten denselben Promise.
 *
 * Scope: https://graph.microsoft.com/.default — alle bei der App-Registration
 * erteilten Application-Permissions (Mail.Read, Mail.ReadWrite).
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface TokenResponse {
  token_type: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
}

let cached: CachedToken | null = null;
let pendingRefresh: Promise<string> | null = null;

/** TTL-Puffer: Token wird 5 min vor Ablauf neu geholt um Edge-Races zu vermeiden. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getEnv(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph nicht konfiguriert: MS_TENANT_ID, MS_CLIENT_ID oder MS_CLIENT_SECRET fehlt.",
    );
  }
  return { tenantId, clientId, clientSecret };
}

async function fetchToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getEnv();
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph Token-Request fehlgeschlagen (${res.status}): ${text}`);
  }

  const json = (await res.json()) as TokenResponse;
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - REFRESH_BUFFER_MS,
  };
  return json.access_token;
}

/**
 * Liefert ein gültiges Access-Token. Cached und auto-refresht.
 * Bei parallelen Aufrufen während eines Refreshs awaiten alle denselben Promise.
 */
export async function getGraphToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  if (pendingRefresh) {
    return pendingRefresh;
  }
  pendingRefresh = fetchToken().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

/**
 * Forciert ein neues Token (z.B. nach 401 von Graph).
 * Cache wird invalidiert.
 */
export async function refreshGraphToken(): Promise<string> {
  cached = null;
  return getGraphToken();
}
