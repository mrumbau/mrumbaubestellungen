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

  const status = supabaseStatus === "ok" ? "ok" : "error";

  return NextResponse.json(
    { status, timestamp: new Date().toISOString(), supabase: supabaseStatus },
    { status: status === "ok" ? 200 : 503 }
  );
}
