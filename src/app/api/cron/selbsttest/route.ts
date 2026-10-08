import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";
import { sendeMahnungEmail } from "@/lib/email";
import {
  bewerteSeite,
  fasseZusammen,
  SELBSTTEST_EMAIL,
  SELBSTTEST_KUERZEL,
  SELBSTTEST_SEITEN,
  type SeitenErgebnis,
} from "@/lib/selbsttest";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const ROUTE = "cron/selbsttest";
const SEITEN_TIMEOUT_MS = 25_000;

/**
 * Taeglicher Selbsttest (pg_cron, 06:10): meldet sich als eigenes
 * Pruefkonto an und laedt jede Hauptseite wie ein echter Nutzer.
 *
 * Das Pruefkonto braucht kein gespeichertes Passwort: vor jedem Lauf wird
 * ein zufaelliges gesetzt, damit angemeldet, und das war's. Beim ersten
 * Lauf legt die Route das Konto an (Rolle admin, nimmt keine Bestellungen).
 *
 * Ergebnis landet in webhook_logs (typ "selbsttest") und erscheint unter
 * Einstellungen → System. Bei Fehlern geht eine Mail an alle Admins.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return safeCompare(bearer, cronSecret);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  const basis = process.env.INTERNAL_APP_URL ?? new URL(request.url).origin;
  const sb = createServiceClient();

  try {
    const cookie = await meldePruefkontoAn(sb);
    const ergebnisse: SeitenErgebnis[] = [];
    for (const pfad of SELBSTTEST_SEITEN) {
      ergebnisse.push(await ladeSeite(basis, pfad, cookie));
    }

    const zusammenfassung = fasseZusammen(ergebnisse);
    await sb.from("webhook_logs").insert({
      typ: "selbsttest",
      status: zusammenfassung.ok ? "ok" : "fehler",
      fehler_text: zusammenfassung.text,
    });
    logInfo(ROUTE, zusammenfassung.ok ? "Selbsttest in Ordnung" : "Selbsttest mit Fehlern", {
      ok: zusammenfassung.ok,
      seiten: ergebnisse.length,
    });

    if (!zusammenfassung.ok) await benachrichtigeAdmins(sb, zusammenfassung.text);

    return NextResponse.json({ ok: zusammenfassung.ok, ergebnisse });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    logError(ROUTE, "Selbsttest konnte nicht laufen", err);
    await sb.from("webhook_logs").insert({
      typ: "selbsttest",
      status: "fehler",
      fehler_text: `Selbsttest konnte nicht laufen: ${msg}`,
    });
    await benachrichtigeAdmins(sb, `Der Selbsttest konnte nicht laufen:\n${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Legt das Pruefkonto bei Bedarf an, setzt ein frisches Passwort, meldet
 * sich an und gibt den Cookie-Header zurueck, den die Seiten erwarten.
 */
async function meldePruefkontoAn(sb: ReturnType<typeof createServiceClient>): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const passwort = randomBytes(24).toString("base64url");

  const { data: liste, error: listeFehler } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (listeFehler) throw new Error(`Nutzerliste: ${listeFehler.message}`);
  let userId = liste.users.find((u) => u.email === SELBSTTEST_EMAIL)?.id;

  if (userId) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: passwort });
    if (error) throw new Error(`Passwort setzen: ${error.message}`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: SELBSTTEST_EMAIL,
      password: passwort,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Pruefkonto anlegen: ${error?.message ?? "kein Nutzer"}`);
    userId = data.user.id;
  }

  const { data: rolle } = await sb
    .from("benutzer_rollen")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!rolle) {
    const { error } = await sb.from("benutzer_rollen").insert({
      user_id: userId,
      email: SELBSTTEST_EMAIL,
      kuerzel: SELBSTTEST_KUERZEL,
      name: "Selbsttest (automatisch)",
      rolle: "admin",
      nimmt_neue_bestellungen: false,
    });
    if (error) throw new Error(`Rolle anlegen: ${error.message}`);
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: loginFehler } = await anon.auth.signInWithPassword({
    email: SELBSTTEST_EMAIL,
    password: passwort,
  });
  if (loginFehler || !login.session) throw new Error(`Anmeldung: ${loginFehler?.message ?? "keine Sitzung"}`);

  // Dieselbe Cookie-Form, die der Browser bekommt — dann laufen Middleware
  // und Server-Seiten exakt wie fuer einen echten Nutzer.
  const jar = new Map<string, string>();
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  await ssr.auth.setSession({
    access_token: login.session.access_token,
    refresh_token: login.session.refresh_token,
  });
  if (jar.size === 0) throw new Error("Sitzung ergab keine Cookies");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function ladeSeite(basis: string, pfad: string, cookie: string): Promise<SeitenErgebnis> {
  const start = Date.now();
  try {
    const res = await fetch(basis + pfad, {
      headers: { cookie, "user-agent": "Bestellwesen-Selbsttest" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(SEITEN_TIMEOUT_MS),
    });
    const html = res.status === 200 ? await res.text() : "";
    return bewerteSeite({
      pfad,
      status: res.status,
      html,
      dauerMs: Date.now() - start,
      location: res.headers.get("location"),
    });
  } catch (err) {
    const grund = err instanceof Error ? err.message : "Netzwerkfehler";
    return { pfad, ok: false, status: 0, dauerMs: Date.now() - start, grund };
  }
}

async function benachrichtigeAdmins(sb: ReturnType<typeof createServiceClient>, text: string) {
  const { data: admins } = await sb
    .from("benutzer_rollen")
    .select("email, name")
    .eq("rolle", "admin")
    .neq("email", SELBSTTEST_EMAIL);
  for (const admin of admins ?? []) {
    await sendeMahnungEmail({
      empfaengerEmail: admin.email,
      empfaengerName: admin.name,
      betreff: "Bestellwesen: Selbsttest meldet Fehler",
      text: `Der taegliche Selbsttest von cloud.mrumbau.de hat Fehler gefunden:\n\n${text}\n\nDetails unter Einstellungen → System.`,
    });
  }
}
