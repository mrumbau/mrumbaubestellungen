import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/health – Health-Check Endpoint
export async function GET() {
  let supabaseStatus = "unknown";

  // Supabase prüfen
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("benutzer_rollen").select("id").limit(1);
    supabaseStatus = error ? "error" : "ok";
  } catch {
    supabaseStatus = "error";
  }

  // Prüfe ob Keys konfiguriert sind (Werte werden NICHT exponiert)
  const openaiStatus = process.env.OPENAI_API_KEY ? "ok" : "missing";
  const makeWebhookStatus = process.env.MAKE_WEBHOOK_SECRET ? "configured" : "missing";

  const status = supabaseStatus === "ok" ? "ok" : "error";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      supabase: supabaseStatus,
      openai: openaiStatus,
      make_webhook: makeWebhookStatus,
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
