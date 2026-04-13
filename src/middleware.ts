import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/webhook", "/api/cron", "/api/extension", "/api/health"];

// Exakte Pfade die ohne Auth erreichbar sind (Tool-Auswahl)
const PUBLIC_EXACT = ["/"];

// Rolle wird für 5 Minuten im Cookie gecacht → spart 1 DB-Query pro Navigation
const ROLLE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROLLE_COOKIE_NAME = "mr_rolle_cache";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  if (rolleCookie) {
    try {
      const cached = JSON.parse(rolleCookie);
      // Cache gültig wenn: gleicher User + nicht abgelaufen
      if (cached.uid === user.id && cached.exp > Date.now()) {
        rolle = cached.rolle || "";
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
    // Buchhaltung darf nur /buchhaltung, /einstellungen und API-Routes sehen
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
