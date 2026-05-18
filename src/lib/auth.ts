import { cache } from "react";
import { createServerSupabaseClient } from "./supabase-server";

export type Rolle = "besteller" | "buchhaltung" | "admin";

// PASSWORD_MIN_LENGTH ist nach src/lib/auth-config.ts ausgelagert (Client-safe),
// weil dieses Modul via supabase-server.ts → next/headers Server-only ist.
// Re-Export für Server-Code-Komfort.
export { PASSWORD_MIN_LENGTH } from "./auth-config";

export interface BenutzerProfil {
  id: string;
  user_id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: Rolle;
}

// Holt das Benutzerprofil inkl. Rolle aus benutzer_rollen
// cache() dedupliziert innerhalb eines Server-Requests (Layout + Page = 1 Call statt 2)
export const getBenutzerProfil = cache(async (): Promise<BenutzerProfil | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("benutzer_rollen")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return data as BenutzerProfil | null;
});

// Prüft ob das Profil eine der erlaubten Rollen hat.
// 18.05.2026 (A1.8) — Signatur auf {rolle: string} gelockert, weil generated
// DB-Types `rolle: string` liefern (DB-Spalte hat CHECK-Constraint, kein Enum).
// Funktional unverändert: rollen.includes() prüft Set-Membership zur Laufzeit.
export function requireRoles(profil: { rolle: string } | null, ...rollen: Rolle[]): boolean {
  return !!profil && (rollen as readonly string[]).includes(profil.rolle);
}

// Redirect-Pfad basierend auf Rolle
export function getRedirectForRolle(rolle: Rolle): string {
  switch (rolle) {
    case "buchhaltung":
      return "/buchhaltung";
    case "admin":
      return "/dashboard";
    case "besteller":
    default:
      return "/bestellungen";
  }
}
