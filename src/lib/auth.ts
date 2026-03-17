import { cache } from "react";
import { createServerSupabaseClient } from "./supabase-server";

export type Rolle = "besteller" | "buchhaltung" | "admin";

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
