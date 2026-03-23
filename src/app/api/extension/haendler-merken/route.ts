import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isValidDomain } from "@/lib/validation";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// POST /api/extension/haendler-merken – Nur Händler-Domain + URL-Pattern lernen, KEINE Bestellung anlegen
export async function POST(request: NextRequest) {
  try {
    const rlKey = getRateLimitKey(request, "haendler-merken");
    const rl = checkRateLimit(rlKey, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { haendler_domain, seiten_url, secret } = body;

    if (!safeCompare(secret, process.env.EXTENSION_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!haendler_domain || !isValidDomain(haendler_domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // URL-Pattern aus der Seiten-URL ableiten
    let pattern: string | null = null;
    if (seiten_url) {
      try {
        const urlPath = new URL(seiten_url).pathname;
        pattern = urlPath
          .replace(/\/\d{3,}(?=[\/\?]|$)/g, "")
          .replace(/\/[a-f0-9-]{20,}(?=[\/\?]|$)/g, "")
          .replace(/\/+$/, "")
          || "/";
        if (pattern.length < 4) pattern = null;
      } catch {
        // URL-Parsing fehlgeschlagen
      }
    }

    // Prüfen ob Händler bereits existiert
    const { data: existing } = await supabase
      .from("haendler")
      .select("id, url_muster")
      .eq("domain", haendler_domain)
      .limit(1);

    if (existing && existing.length > 0) {
      // Händler existiert → ggf. Pattern hinzufügen
      if (pattern) {
        const muster: string[] = existing[0].url_muster || [];
        if (muster.length < 50 && pattern.length <= 200 && !muster.includes(pattern)) {
          await supabase
            .from("haendler")
            .update({ url_muster: [...muster, pattern] })
            .eq("id", existing[0].id);
        }
      }
      return NextResponse.json({ success: true, neu: false, domain: haendler_domain });
    }

    // Neuen Händler anlegen
    await supabase.from("haendler").insert({
      name: haendler_domain,
      domain: haendler_domain,
      email_absender: [],
      url_muster: pattern ? [pattern] : [],
    });

    return NextResponse.json({ success: true, neu: true, domain: haendler_domain });
  } catch (err) {
    logError("/api/extension/haendler-merken", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
