import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// GET /api/extension/haendler – Liefert alle Händler-Patterns für die Extension
// Die Extension cached diese Liste und nutzt sie für Stufe 1 (sofortige Erkennung)
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-extension-secret");
  if (!safeCompare(secret, process.env.EXTENSION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: haendler, error } = await supabase
    .from("haendler")
    .select("domain, url_muster")
    .not("url_muster", "eq", "{}");

  if (error) {
    logError("/api/extension/haendler", "Unerwarteter Fehler", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }

  // In das Format umwandeln das die Extension erwartet
  const patterns = (haendler || [])
    .filter((h) => h.url_muster && h.url_muster.length > 0)
    .map((h) => ({
      domain: h.domain,
      patterns: h.url_muster,
    }));

  return NextResponse.json(
    { haendler: patterns, updated_at: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600", // 1h Browser-Cache
      },
    }
  );
}
