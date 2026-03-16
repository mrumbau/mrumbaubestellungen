import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/health – Health-Check Endpoint
export async function GET() {
  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    supabase: "unknown",
    openai: "unknown",
  };

  // Supabase prüfen
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("benutzer_rollen").select("id").limit(1);
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  // OpenAI Key prüfen (nur ob vorhanden, kein API-Call)
  checks.openai = process.env.OPENAI_API_KEY ? "ok" : "missing";

  const allOk = checks.supabase === "ok" && checks.openai === "ok";
  checks.status = allOk ? "ok" : "degraded";

  return NextResponse.json(checks, { status: allOk ? 200 : 503 });
}
