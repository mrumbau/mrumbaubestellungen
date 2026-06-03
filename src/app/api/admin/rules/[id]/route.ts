/**
 * /api/admin/rules/[id]
 *  - PATCH: Update existing rule
 *  - DELETE: Delete rule
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTypedServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONDITION_TYPE_ENUM = z.enum([
  "haendler_domain",
  "haendler_domain_contains",
  "absender_pattern",
  "subject_keyword",
  "haendler_id",
  // 03.06.2026 (Pool 2.0 Sprint 3) — neue Condition-Types
  "betrag_min",
  "betrag_max",
  "projekt_keyword",
]);

const ConditionLeafSchema = z.object({
  type: CONDITION_TYPE_ENUM,
  value: z.string().min(1).max(500),
});

const ConditionUnionSchema = z.union([
  ConditionLeafSchema,
  z.object({
    conditions: z.array(ConditionLeafSchema).min(1).max(10),
    combiner: z.enum(["AND", "OR"]).optional(),
  }),
]);

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
  condition: ConditionUnionSchema.optional(),
  combiner: z.enum(["AND", "OR"]).optional(),
  target_kuerzel: z.string().min(1).max(10).optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function ensureAdmin() {
  const profil = await getBenutzerProfil();
  if (!profil) return { profil: null, error: NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 }) };
  if (profil.rolle !== "admin") return { profil, error: NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 }) };
  return { profil, error: null as null };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Ungültige Rule-ID" }, { status: 400 });
    }

    const guard = await ensureAdmin();
    if (guard.error) return guard.error;

    const body = await request.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body invalid", issues: parsed.error.issues }, { status: 400 });
    }

    const supabase = await createTypedServerSupabaseClient();
    const { data, error } = await supabase
      .from("besteller_rules")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logError("/api/admin/rules PATCH", "Update-Fehler", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    logError("/api/admin/rules PATCH", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Ungültige Rule-ID" }, { status: 400 });
    }

    const guard = await ensureAdmin();
    if (guard.error) return guard.error;

    const supabase = await createTypedServerSupabaseClient();
    const { error } = await supabase
      .from("besteller_rules")
      .delete()
      .eq("id", id);

    if (error) {
      logError("/api/admin/rules DELETE", "Delete-Fehler", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/admin/rules DELETE", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
