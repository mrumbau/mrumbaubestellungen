import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID, sanitizeFilename } from "@/lib/validation";
import { ERRORS } from "@/lib/errors";

// GET /api/pdfs/[id] – PDF/Bild aus Supabase Storage abrufen
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabaseAuth = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Dokument-Metadaten laden (RLS filtert)
    const { data: dokument } = await supabaseAuth
      .from("dokumente")
      .select("storage_pfad, bestellung_id")
      .eq("id", id)
      .single();

    if (!dokument?.storage_pfad) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Verify bestellung access via RLS
    const { data: bestellung } = await supabaseAuth
      .from("bestellungen")
      .select("id")
      .eq("id", dokument.bestellung_id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Datei aus Storage laden (Service Client für Zugriff)
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from("dokumente")
      .download(dokument.storage_pfad);

    if (error || !data) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }

    const contentType = dokument.storage_pfad.endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

    const rawFilename = dokument.storage_pfad.split("/").pop() || "dokument";
    const safeFilename = sanitizeFilename(rawFilename);

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch {
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
