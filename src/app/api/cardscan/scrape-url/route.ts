// CardScan API – POST /api/cardscan/scrape-url
// TODO: Phase 5 – URL-Scraping mit SSRF-Schutz

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Noch nicht implementiert (Phase 5)" },
    { status: 501 }
  );
}
