// CardScan API – GET /api/cardscan/errors
// TODO: Phase 8 – Offene Sync-Fehler für Dashboard

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "Noch nicht implementiert (Phase 8)" },
    { status: 501 }
  );
}
