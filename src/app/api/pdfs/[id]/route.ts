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

    // Dokument-Metadaten laden – unterstützt Dokument-ID direkt ODER Bestellungs-ID + typ
    const typ = _request.nextUrl.searchParams.get("typ");
    let dokument: { storage_pfad: string; bestellung_id: string } | null = null;

    if (typ) {
      // Lookup per Bestellungs-ID + Dokumenttyp (für Tabellen-Vorschau)
      // Erst prüfen ob Bestellung per RLS zugänglich ist
      const { data: bestellung } = await supabaseAuth
        .from("bestellungen")
        .select("id")
        .eq("id", id)
        .single();

      if (!bestellung) {
        return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
      }

      const { data: dok } = await supabaseAuth
        .from("dokumente")
        .select("storage_pfad, bestellung_id")
        .eq("bestellung_id", id)
        .eq("typ", typ)
        .not("storage_pfad", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      dokument = dok;
    } else {
      // Direkter Lookup per Dokument-ID (bestehender Flow)
      const { data: dok } = await supabaseAuth
        .from("dokumente")
        .select("storage_pfad, bestellung_id")
        .eq("id", id)
        .single();

      dokument = dok;
    }

    if (!dokument?.storage_pfad) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    if (!typ) {
      // Verify bestellung access via RLS (nur bei Dokument-ID Lookup nötig)
      const { data: bestellung } = await supabaseAuth
        .from("bestellungen")
        .select("id")
        .eq("id", dokument.bestellung_id)
        .single();

      if (!bestellung) {
        return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
      }
    }

    const supabase = createServiceClient();
    const mode = _request.nextUrl.searchParams.get("mode");

    // mode=url → Signed URL zurückgeben (schnell, kein Proxy)
    if (mode === "url") {
      const { data: signedData, error: signError } = await supabase.storage
        .from("dokumente")
        .createSignedUrl(dokument.storage_pfad, 300); // 5 Minuten gültig

      if (signError || !signedData?.signedUrl) {
        return NextResponse.json({ error: "Signed URL konnte nicht erstellt werden" }, { status: 500 });
      }

      return NextResponse.json({ url: signedData.signedUrl }, {
        headers: { "Cache-Control": "private, max-age=240" }, // 4 Min cachen (URL gilt 5 Min)
      });
    }

    // Fallback: Datei direkt streamen (für iframe-Einbettung in Detailansicht)
    const { data, error } = await supabase.storage
      .from("dokumente")
      .download(dokument.storage_pfad);

    if (error || !data) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }

    const ext = dokument.storage_pfad.split(".").pop()?.toLowerCase() || "";
    const MIME_MAP: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      tiff: "image/tiff",
      bmp: "image/bmp",
    };
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const rawFilename = dokument.storage_pfad.split("/").pop() || "dokument";
    const safeFilename = sanitizeFilename(rawFilename);

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=300",
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
