import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/webhook", "/api/cron", "/api/extension", "/api/health"];

// F2.18: Defense-in-Depth — diese Prefix-public Routen MÜSSEN selbst
// authentifizieren (Bearer/Body-Secret/EXTENSION_SECRET). Wenn eine Route
// versehentlich ohne Auth-Check erstellt wird, fängt dieser Check sie ab:
// `Authorization: Bearer ...` oder `secret`-Body-Field MUSS vorhanden sein.
// Verhindert dass z.B. /api/webhook/debug versehentlich offen ist.
const AUTH_HEADER_REQUIRED_PREFIXES = ["/api/webhook", "/api/cron", "/api/extension"];

// Ausnahmen vom F2.18-Block: Routen die NICHT mit Header/Body-Secret authen
// können, weil ein externer Service ohne Vorab-Wissen sie callt.
// - graph-notification: Microsoft schickt den Validation-Handshake OHNE
//   Auth-Header (Subscription existiert ja noch nicht). Die Route hat eigene
//   Auth via `clientState`-DB-Lookup für echte Notifications — siehe
//   graph-notification/route.ts:128.
const AUTH_HEADER_REQUIRED_EXCEPTIONS = ["/api/webhook/graph-notification"];

// Exakte Pfade die ohne Auth erreichbar sind (Tool-Auswahl)
const PUBLIC_EXACT = ["/"];

// Rolle wird für 5 Minuten im Cookie gecacht → spart 1 DB-Query pro Navigation
const ROLLE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROLLE_COOKIE_NAME = "mr_rolle_cache";

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

  // Rolle: erst aus Cookie-Cache lesen, nur bei Cache-Miss aus DB
  let rolle = "";
  const rolleCookie = request.cookies.get(ROLLE_COOKIE_NAME)?.value;

  const ERLAUBTE_ROLLEN = ["admin", "besteller", "buchhaltung"];
  if (rolleCookie) {
    try {
      const cached = JSON.parse(rolleCookie);
      // Cache gültig wenn: gleicher User + nicht abgelaufen + gültige Rolle
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
    // Cache-Miss: aus DB laden
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    rolle = profil?.rolle || "";

    // In Cookie cachen (httpOnly, nicht von JS auslesbar, nicht spoofbar für Auth)
    // Die Rolle im Cookie wird NUR für Middleware-Routing verwendet,
    // API-Routes laden die Rolle immer frisch aus der DB
    response.cookies.set(ROLLE_COOKIE_NAME, JSON.stringify({
      rolle,
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
