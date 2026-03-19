import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID, sanitizeFilename } from "@/lib/validation";
import { ERRORS } from "@/lib/errors";
import JSZip from "jszip";

// GET /api/pdfs/zip?bestellung_id=... – Alle Dokumente als ZIP
export async function GET(request: NextRequest) {
  try {
    const bestellungId = request.nextUrl.searchParams.get("bestellung_id");

    if (!bestellungId || !isValidUUID(bestellungId)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabaseAuth = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Bestellung laden (RLS filtert nach Rolle)
    const { data: bestellung } = await supabaseAuth
      .from("bestellungen")
      .select("bestellnummer, haendler_name")
      .eq("id", bestellungId)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Dokumente laden (RLS filtert)
    const { data: dokumente } = await supabaseAuth
      .from("dokumente")
      .select("id, typ, storage_pfad")
      .eq("bestellung_id", bestellungId);

    const mitPfad = (dokumente || []).filter((d) => d.storage_pfad);

    if (mitPfad.length === 0) {
      return NextResponse.json({ error: "Keine Dokumente vorhanden" }, { status: 404 });
    }

    // Dateien aus Storage laden
    const supabase = createServiceClient();
    const zip = new JSZip();

    await Promise.all(
      mitPfad.map(async (dok) => {
        const { data } = await supabase.storage
          .from("dokumente")
          .download(dok.storage_pfad!);

        if (!data) return;

        const ext = dok.storage_pfad!.endsWith(".pdf") ? ".pdf" : ".jpg";
        const filename = sanitizeFilename(`${dok.typ}${ext}`);
        zip.file(filename, data);
      })
    );

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    const zipName = sanitizeFilename(
      `${bestellung.bestellnummer || "Bestellung"}_${bestellung.haendler_name || "Dokumente"}.zip`
    );

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
