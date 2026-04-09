import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/webhook", "/api/cron", "/api/extension", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Öffentliche Pfade durchlassen
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
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
    return NextResponse.redirect(url);
  }

  // Rollenprüfung: immer aus DB laden (Cookie-Cache war spoofbar)
  const { data: profil } = await supabase
    .from("benutzer_rollen")
    .select("rolle")
    .eq("user_id", user.id)
    .single();

  const rolle = profil?.rolle || "";

  if (rolle) {
    // Buchhaltung darf nur /buchhaltung, /einstellungen und API-Routes sehen
    // Alle anderen Routen (/dashboard, /bestellungen, /projekte, /kunden, /archiv) → nur admin + besteller
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
