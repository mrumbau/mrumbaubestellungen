import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// 06.05.2026 — Opt-in-typed-Variants verfügbar via createTypedServiceClient
// und createTypedBrowserSupabaseClient. Default-Funktionen bleiben untyped
// für Backward-Compat (ca. 60 Aufrufer). Migrations-Strategie: pro Hot-Path-File
// auf typed-Variant umstellen wenn diese gerade refactored wird.

// Browser Client (für Client Components) — untyped
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Service Role Client (für API Routes – umgeht RLS) — untyped
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Typed Variants — für Hot-Paths die gen-types nutzen wollen.
// Compile-Time-Validation für .from/.insert/.update/.rpc/.eq.
export function createTypedBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createTypedServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
