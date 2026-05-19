/**
 * Test-Helpers für API-Route-Tests (A2.5).
 *
 * Konsolidiert wiederkehrende Mock-Boilerplate:
 *   - `makeRequest()` — NextRequest mit JSON-Body + CSRF-passendem Origin
 *   - `makeProfil()` — Test-User-Shapes
 *   - `makeSupabaseChain()` — Query-Chain-Mock für SELECT-Patterns
 *
 * Verwendung (jeder Test-File deklariert eigene vi.mocks am Top-Level wegen Hoisting):
 *
 *   import { describe, it, expect, vi, beforeEach } from "vitest";
 *   import { NextRequest } from "next/server";
 *   import { makeRequest, makeProfil, type Profil } from "@/test-helpers/api-route";
 *
 *   const mockGetProfil = vi.fn();
 *   const mockCheckCsrf = vi.fn(() => true);
 *   const mockCreateClient = vi.fn();
 *
 *   vi.mock("@/lib/auth", () => ({ getBenutzerProfil: () => mockGetProfil(), requireRoles: () => true }));
 *   vi.mock("@/lib/csrf", () => ({ checkCsrf: (r: NextRequest) => mockCheckCsrf(r) }));
 *   vi.mock("@/lib/supabase-server", () => ({ createServerSupabaseClient: () => mockCreateClient(), createTypedServerSupabaseClient: () => mockCreateClient() }));
 *   vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
 */
import { NextRequest } from "next/server";

export interface Profil {
  user_id: string;
  kuerzel: string;
  name: string;
  email: string;
  rolle: "admin" | "besteller" | "buchhaltung";
}

export function makeProfil(overrides: Partial<Profil> = {}): Profil {
  return {
    user_id: "test-user-id",
    kuerzel: "MT",
    name: "Marlon Tschon",
    email: "mt@mrumbau.de",
    rolle: "besteller",
    ...overrides,
  };
}

/** Standard-Profile für Tests — abgekürzt. */
export const TEST_PROFIL = {
  besteller_MT: makeProfil({ kuerzel: "MT", name: "Marlon Tschon", rolle: "besteller" }),
  besteller_CR: makeProfil({ kuerzel: "CR", name: "Carsten Reuter", rolle: "besteller" }),
  admin: makeProfil({ kuerzel: "MH", name: "Mohammed Hawrami", rolle: "admin", email: "it@mrumbau.de" }),
  buchhaltung: makeProfil({ kuerzel: "NJ", name: "Nada Jerinic", rolle: "buchhaltung", email: "bu@mrumbau.de" }),
};

/** NextRequest mit JSON-Body. CSRF-Origin-Header defaultet auf erlaubt (localhost:3000). */
export function makeRequest(
  body: Record<string, unknown> = {},
  init: {
    url?: string;
    method?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: init.origin ?? "http://localhost:3000",
    ...init.headers,
  };
  return new NextRequest(init.url ?? "http://localhost:3000/api/test", {
    method: init.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Typsicheres Wrap für Promise<{ id: string }> params (Next 16 App-Router). */
export function params<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}

// UUIDs für Test-Daten. WICHTIG: muss UUID-v4 sein (13. Char = "4", 17. Char ∈ {8,9,a,b}),
// sonst rejected Zod's .uuid()-Validator. isValidUUID akzeptiert auch andere Versionen,
// aber Zod ist strict — daher überall echte v4 nehmen.
export const TEST_UUID = {
  bestellung: "8fc74bd3-0f14-4f42-ba24-974c1747d45b",
  bestellung_2: "e5c830c6-161c-4f93-a23d-8733f29d8ee6",
  dokument: "9c79eb68-1085-4937-b630-7d0609fcce4a",
  fremd: "11111111-2222-4333-a444-555555555555",
};
