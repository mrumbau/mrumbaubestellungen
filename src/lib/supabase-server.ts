import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

// 18.05.2026 (A1.8) — createServerSupabaseClient ist jetzt selbst typed mit
// generated Database-Schema. Vorher: Generic-Variant `createTypedServerSupabaseClient`
// existierte als Opt-in, aber nur 4 von 61 Routes hatten sie adoptiert → DB-
// Schema-Änderungen blieben in 57 Routes unentdeckt bis Runtime. Jetzt: alle
// neuen Routes bekommen Type-Sicherheit ohne weitere Aktion.
//
// createTypedServerSupabaseClient bleibt als Alias für Backward-Compat (4
// existing Call-Sites müssen nicht angefasst werden), kann später entfernt
// werden wenn alle Stellen den kürzeren Namen nutzen.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component kann keine Cookies setzen – ignorieren
          }
        },
      },
    }
  );
}

/**
 * @deprecated 18.05.2026 — createServerSupabaseClient ist seit A1.8 selbst
 * typed. Diese Function bleibt als Alias damit existierende 4 Call-Sites nicht
 * angefasst werden müssen. Bei Refactor: einfach durch createServerSupabaseClient ersetzen.
 */
export const createTypedServerSupabaseClient = createServerSupabaseClient;
