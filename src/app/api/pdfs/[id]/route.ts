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

    // 07.05.2026 — Stream-Pipe-Through statt Blob-Buffering.
    // Vorher: supabase.storage.download() lud das gesamte PDF in Memory bevor
    // wir streamten → ~300-500ms Latenz selbst bei kleinen PDFs.
    // Jetzt: Signed-URL erstellen + raw fetch() + body als ReadableStream
    // direkt durchreichen. Browser kann progressive PDF-Rendering machen
    // während der Stream noch läuft. Range-Requests werden vom Upstream
    // (Supabase-CDN) durchgereicht → Browser kann nur die ersten Seiten
    // laden bei großen PDFs.
    const { data: signedData, error: signError } = await supabase.storage
      .from("dokumente")
      .createSignedUrl(dokument.storage_pfad, 60);

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }

    // Range-Header durchreichen für progressive Loading
    const rangeHeader = _request.headers.get("range");
    const upstreamHeaders: HeadersInit = {};
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    const upstreamRes = await fetch(signedData.signedUrl, { headers: upstreamHeaders });

    if (!upstreamRes.ok || !upstreamRes.body) {
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

    // Wichtige Upstream-Header durchreichen für Range/Streaming
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Cache-Control": "private, max-age=300",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Accept-Ranges": "bytes",
    };
    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status, // 200 oder 206 (Partial Content) durchreichen
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
