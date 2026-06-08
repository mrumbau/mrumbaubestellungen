import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { computeDashboardEnabled } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  // 08.06.2026 — Self-Service-Passwort-Reset für alle Rollen.
  // Beide Pages müssen ohne aktive Session erreichbar sein. /passwort-neu
  // bekommt vom Recovery-Mail-Link einen kurzlebigen Auth-Token in der URL
  // mitgeliefert und tauscht ihn dort in eine Recovery-Session ein.
  "/passwort-vergessen",
  "/passwort-neu",
  "/api/webhook",
  "/api/cron",
  "/api/health",
  // 22.05.2026 — PWA-Manifest muss ohne Auth abrufbar sein, sonst redirected
  // Middleware den Manifest-Fetch zu /login HTML und Browser meldet
  // "Manifest: Line: 1, column: 1, Syntax error".
  "/manifest.webmanifest",
];

// F2.18: Defense-in-Depth — diese Prefix-public Routen MÜSSEN selbst
// authentifizieren (Bearer/Body-Secret). Wenn eine Route versehentlich ohne
// Auth-Check erstellt wird, fängt dieser Check sie ab:
// `Authorization: Bearer ...` oder `secret`-Body-Field MUSS vorhanden sein.
// Verhindert dass z.B. /api/webhook/debug versehentlich offen ist.
const AUTH_HEADER_REQUIRED_PREFIXES = ["/api/webhook", "/api/cron"];

// Ausnahmen vom F2.18-Block: Routen die NICHT mit Header/Body-Secret authen
// können, weil ein externer Service ohne Vorab-Wissen sie callt.
// - graph-notification: Microsoft schickt den Validation-Handshake OHNE
//   Auth-Header (Subscription existiert ja noch nicht). Die Route hat eigene
//   Auth via `clientState`-DB-Lookup für echte Notifications — siehe
//   graph-notification/route.ts:128.
const AUTH_HEADER_REQUIRED_EXCEPTIONS = ["/api/webhook/graph-notification"];

// Exakte Pfade die ohne Auth erreichbar sind (Tool-Auswahl)
const PUBLIC_EXACT = ["/"];

// 21.05.2026 — volles Profil-Cache (vorher nur Rolle).
// Spart pro Page-Navigation: 1× auth.getUser() Roundtrip + 1× benutzer_rollen-SELECT
// im Dashboard-Layout (siehe src/lib/auth.ts getBenutzerProfil).
// httpOnly → kein JS-Access, nicht spoofbar für User-facing-Decisions.
// API-Routes laden Profil weiterhin frisch aus DB (Defense-in-Depth).
const ROLLE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROLLE_COOKIE_NAME = "mr_profil_cache";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // F2.18 Defense-in-Depth: webhook/cron/extension benötigen IMMER ein Auth-Token
  // (entweder Authorization-Header ODER secret-Field im Body — Body lesen wir
  // hier nicht, also reicht Header-Check als Sanity-Filter).
  if (
    AUTH_HEADER_REQUIRED_PREFIXES.some((p) => pathname.startsWith(p))
    && !AUTH_HEADER_REQUIRED_EXCEPTIONS.some((p) => pathname.startsWith(p))
  ) {
    const authHeader = request.headers.get("authorization");
    const contentType = request.headers.get("content-type") ?? "";
    const looksLikeJson = contentType.includes("application/json");
    // POST mit JSON-Body darf ohne Auth-Header durchgehen (Body kann `secret` haben).
    // GET ohne Auth-Header → block.
    if (!authHeader && !(request.method === "POST" && looksLikeJson)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Öffentliche Pfade durchlassen
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || PUBLIC_EXACT.includes(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Nicht eingeloggt → Login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Rolle-Cache löschen bei Logout
    response = NextResponse.redirect(url);
    response.cookies.delete(ROLLE_COOKIE_NAME);
    return response;
  }

  // Profil: erst aus Cookie-Cache lesen, nur bei Cache-Miss aus DB
  let rolle = "";
  const profilCookie = request.cookies.get(ROLLE_COOKIE_NAME)?.value;

  const ERLAUBTE_ROLLEN = ["admin", "besteller", "buchhaltung"];
  if (profilCookie) {
    try {
      const cached = JSON.parse(profilCookie);
      if (
        cached && typeof cached === "object" &&
        cached.uid === user.id &&
        cached.exp > Date.now() &&
        typeof cached.rolle === "string" &&
        ERLAUBTE_ROLLEN.includes(cached.rolle)
      ) {
        rolle = cached.rolle;
      }
    } catch { /* ungültiger Cookie → neu laden */ }
  }

  if (!rolle) {
    // Cache-Miss: volles Profil aus DB laden (id, user_id, email, name, kuerzel, rolle)
    // Layout liest später denselben Cookie → spart dort einen weiteren DB-Roundtrip.
    // 22.05.2026 — `dashboard_config` mit-laden um dashboardEnabled-Flag für die
    // Sidebar-Visibility zu berechnen und ins Cookie zu pinnen.
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("id, user_id, email, name, kuerzel, rolle, dashboard_config")
      .eq("user_id", user.id)
      .single();

    rolle = profil?.rolle || "";

    if (profil) {
      const dashboardConfig =
        (profil.dashboard_config as { dashboard_enabled?: boolean } | null) ?? null;
      const dashboardEnabled = computeDashboardEnabled(profil.kuerzel, dashboardConfig);
      // dashboard_config nicht ins Cookie (potenziell groß) — nur den derived flag.
      const { dashboard_config: _drop, ...slim } = profil;
      void _drop;
      response.cookies.set(ROLLE_COOKIE_NAME, JSON.stringify({
        ...slim,
        dashboardEnabled,
        uid: user.id,
        exp: Date.now() + ROLLE_CACHE_TTL_MS,
      }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: Math.ceil(ROLLE_CACHE_TTL_MS / 1000),
      });
    }
  }

  // Kein Profil in benutzer_rollen → kein Zugang
  if (!rolle && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (rolle) {
    // Buchhaltung darf /buchhaltung, /einstellungen, /cardscan und API-Routes sehen
    if (rolle === "buchhaltung" && !pathname.startsWith("/buchhaltung") && !pathname.startsWith("/einstellungen") && !pathname.startsWith("/cardscan") && !pathname.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/buchhaltung";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
