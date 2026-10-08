import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";

// 30.09.2026 — Rollen liegen jetzt in lib/rollen.ts, damit Client-Code sie
// nutzen kann, ohne dieses Server-only-Modul zu ziehen.
export type { Rolle } from "./rollen";
import { ROLLEN, istVerwaltung, type Rolle } from "./rollen";

export interface BenutzerProfil {
  id: string;
  user_id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: Rolle;
  /**
   * 22.05.2026 — Dashboard sichtbar in Sidebar + erreichbar via /dashboard?
   * Default false für MT/CR (User-Wunsch — Workflow ist eh /bestellungen-zentriert),
   * true für alle anderen. User kann in /einstellungen überschreiben.
   * Wird in Middleware aus dashboard_config.dashboard_enabled gelesen.
   */
  dashboardEnabled: boolean;
}

const PROFIL_COOKIE_NAME = "mr_profil_cache";
const ERLAUBTE_ROLLEN: readonly string[] = ROLLEN;

/** Kürzel die per Default kein Dashboard sehen wollen (siehe BenutzerProfil.dashboardEnabled). */
const DASHBOARD_DISABLED_BY_DEFAULT: readonly string[] = ["MT", "CR"];

/**
 * Effektiver Dashboard-Visibility-Flag.
 * Wenn der User in `dashboard_config.dashboard_enabled` einen expliziten Wert
 * gesetzt hat: der gewinnt. Sonst: Default-Heuristik (MT/CR off, Rest on).
 */
export function computeDashboardEnabled(
  kuerzel: string,
  dashboardConfig: { dashboard_enabled?: boolean } | null | undefined,
): boolean {
  if (typeof dashboardConfig?.dashboard_enabled === "boolean") {
    return dashboardConfig.dashboard_enabled;
  }
  return !DASHBOARD_DISABLED_BY_DEFAULT.includes(kuerzel);
}

interface ProfilCacheCookie {
  id?: string;
  user_id?: string;
  email?: string;
  name?: string;
  kuerzel?: string;
  rolle?: string;
  uid?: string;
  exp?: number;
  dashboardEnabled?: boolean;
}

/**
 * 21.05.2026 (Perf) — Cookie-First-Path für Profil.
 * Middleware (src/middleware.ts) schreibt das volle Profil ins httpOnly-Cookie
 * mit 5-Min-TTL. Layout liest hier den Cookie direkt — spart pro Page-
 * Navigation einen auth.getUser()-Roundtrip (~150ms) + einen benutzer_rollen-
 * SELECT (~80ms). Bei Cookie-Miss oder Stale fällt auf den vollen DB-Pfad
 * zurück. cache() dedupliziert weiterhin innerhalb des SAME Request.
 */
export const getBenutzerProfil = cache(async (): Promise<BenutzerProfil | null> => {
  // Fast-Path: Cookie-Cache (von Middleware geschrieben)
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(PROFIL_COOKIE_NAME)?.value;
    if (raw) {
      const cached = JSON.parse(raw) as ProfilCacheCookie;
      if (
        cached &&
        typeof cached.exp === "number" && cached.exp > Date.now() &&
        typeof cached.uid === "string" &&
        typeof cached.id === "string" &&
        typeof cached.user_id === "string" &&
        typeof cached.email === "string" &&
        typeof cached.name === "string" &&
        typeof cached.kuerzel === "string" &&
        typeof cached.rolle === "string" &&
        ERLAUBTE_ROLLEN.includes(cached.rolle)
      ) {
        return {
          id: cached.id,
          user_id: cached.user_id,
          email: cached.email,
          name: cached.name,
          kuerzel: cached.kuerzel,
          rolle: cached.rolle as Rolle,
          dashboardEnabled:
            typeof cached.dashboardEnabled === "boolean"
              ? cached.dashboardEnabled
              : computeDashboardEnabled(cached.kuerzel, null),
        };
      }
    }
  } catch {
    // Cookie kaputt oder cookies()-API nicht verfügbar → DB-Fallback
  }

  // Slow-Path: voller DB-Lookup (Cookie-Miss, abgelaufen, oder Profil-Aktualisierung)
  const supabase = await createServerSupabaseClient();
  // Lokale Signaturpruefung statt Netzaufruf, siehe middleware.ts.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("benutzer_rollen")
    .select("id, user_id, email, name, kuerzel, rolle, dashboard_config")
    .eq("user_id", userId)
    .single();

  if (!data || !data.user_id) return null;

  const dashboardConfig =
    (data.dashboard_config as { dashboard_enabled?: boolean } | null) ?? null;

  return {
    id: data.id,
    user_id: data.user_id,
    email: data.email,
    name: data.name,
    kuerzel: data.kuerzel,
    rolle: data.rolle as Rolle,
    dashboardEnabled: computeDashboardEnabled(data.kuerzel, dashboardConfig),
  };
});

// Prüft ob das Profil eine der erlaubten Rollen hat.
// 18.05.2026 (A1.8) — Signatur auf {rolle: string} gelockert, weil generated
// DB-Types `rolle: string` liefern (DB-Spalte hat CHECK-Constraint, kein Enum).
// Funktional unverändert: rollen.includes() prüft Set-Membership zur Laufzeit.
/**
 * Rollen-Pruefung fuer API-Routen.
 *
 * 30.09.2026 — Wer "admin" verlangt, meint an rund hundert Stellen im Code
 * "jemand, der verwalten darf". Die Geschaeftsfuehrung faellt deshalb hier
 * mit hinein, statt in jeder einzelnen Route nachgetragen zu werden — das
 * waere nicht mehr zu ueberpruefen gewesen.
 *
 * Die zwei Stellen, an denen wirklich nur ein Admin gemeint ist (Testdaten,
 * DSGVO-Loeschung), fragen mit istNurAdmin() aus lib/rollen.ts und gehen
 * bewusst nicht ueber diesen Helfer.
 */
export function requireRoles(profil: { rolle: string } | null, ...rollen: Rolle[]): boolean {
  if (!profil) return false;
  const erlaubt = rollen as readonly string[];
  if (erlaubt.includes(profil.rolle)) return true;
  return erlaubt.includes("admin") && istVerwaltung(profil.rolle);
}
