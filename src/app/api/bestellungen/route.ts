import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ERRORS } from "@/lib/errors";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// GET /api/bestellungen – Liste (gefiltert durch RLS nach Rolle)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Pagination aus Query-Params
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Count + Daten parallel (RLS filtert automatisch nach Rolle)
    const [{ count }, { data, error }] = await Promise.all([
      supabase.from("bestellungen").select("*", { count: "exact", head: true }),
      supabase
        .from("bestellungen")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to),
    ]);

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch {
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
