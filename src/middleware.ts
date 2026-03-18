import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/webhook"];

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

  // Rollenprüfung: erst aus Cookie lesen, nur bei Fehlen aus DB laden
  let rolle = request.cookies.get("x-user-rolle")?.value || "";

  if (!rolle) {
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    rolle = profil?.rolle || "";

    // Rolle für 5 Minuten im Cookie cachen (nicht httpOnly — nur für Middleware-Routing)
    if (rolle) {
      response.cookies.set("x-user-rolle", rolle, {
        path: "/",
        maxAge: 300,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  if (rolle) {
    // Buchhaltung darf nur /buchhaltung und /einstellungen sehen
    if (rolle === "buchhaltung" && !pathname.startsWith("/buchhaltung") && !pathname.startsWith("/einstellungen")) {
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
