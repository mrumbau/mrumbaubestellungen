/**
 * Auth-Wrapper für API-Routes.
 *
 * Konsolidiert das gemeinsame Pattern (Profil holen → 401 wenn anonym → 403
 * wenn Rolle nicht erlaubt) in einen Helper. Reduziert Boilerplate +
 * Inkonsistenz zwischen den ~30 Routen die heute Auth ad-hoc implementieren.
 *
 * Verwendung:
 *   export async function POST(request: NextRequest) {
 *     const auth = await requireAuth(["admin", "besteller"]);
 *     if (auth.response) return auth.response;
 *     const { profil } = auth;
 *     // ... profil ist typed BenutzerProfil
 *   }
 *
 * Ohne Rolen-Filter (nur authentifiziert):
 *   const auth = await requireAuth();
 *   if (auth.response) return auth.response;
 *   const { profil } = auth;
 */

import { NextResponse } from "next/server";
import { getBenutzerProfil, type BenutzerProfil, type Rolle } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";

export type AuthResult =
  | { profil: BenutzerProfil; response?: never }
  | { profil?: never; response: NextResponse };

export async function requireAuth(rolen?: Rolle[]): Promise<AuthResult> {
  const profil = await getBenutzerProfil();
  if (!profil) {
    return {
      response: NextResponse.json(
        { error: ERRORS.NICHT_AUTHENTIFIZIERT },
        { status: 401 },
      ),
    };
  }
  if (rolen && rolen.length > 0 && !rolen.includes(profil.rolle)) {
    return {
      response: NextResponse.json(
        { error: ERRORS.KEINE_BERECHTIGUNG },
        { status: 403 },
      ),
    };
  }
  return { profil };
}
