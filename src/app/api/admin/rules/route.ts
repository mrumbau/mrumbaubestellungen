/**
 * /api/admin/rules — POST = Create new rule
 *
 * Welle 4 O8 (06.05.2026): Admin-API für besteller_rules-Tabelle.
 * RLS-policies erlauben INSERT für admin-Rolle. Routes nutzen
 * createServerSupabaseClient (auth-Kontext, RLS gilt).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTypedServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { pruefeZiel } from "@/lib/besteller-rules-ziel";

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

// Backward-compatible: legacy single-condition ODER new multi-condition {conditions:[],combiner}
const ConditionUnionSchema = z.union([
  ConditionLeafSchema,
  z.object({
    conditions: z.array(ConditionLeafSchema).min(1).max(10),
    combiner: z.enum(["AND", "OR"]).optional(),
  }),
]);

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(9999).default(100),
  enabled: z.boolean().default(true),
  condition: ConditionUnionSchema,
  combiner: z.enum(["AND", "OR"]).optional(),
  target_kuerzel: z.string().min(1).max(10),
  confidence: z.number().min(0).max(1).default(0.85),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const profil = await getBenutzerProfil();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }
    if (profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body invalid", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const supabase = await createTypedServerSupabaseClient();

    // 30.09.2026 — Regelziel gegen die Stammdaten pruefen. Ein Tippfehler im
    // Kuerzel oder ein Kollege, der keine neuen Bestellungen mehr annimmt,
    // haette sonst eine Regel ergeben, die still nie greift.
    const zielFehler = await pruefeZiel(supabase, parsed.data.target_kuerzel);
    if (zielFehler) {
      return NextResponse.json({ error: zielFehler }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("besteller_rules")
      .insert({
        name: parsed.data.name,
        priority: parsed.data.priority,
        enabled: parsed.data.enabled,
        condition: parsed.data.condition,
        // 30.09.2026 — combiner wurde validiert, aber nicht gespeichert:
        // eine als ODER angelegte Regel lief in der Datenbank als UND und
        // griff damit nur, wenn ALLE Bedingungen zutrafen.
        ...(parsed.data.combiner ? { combiner: parsed.data.combiner } : {}),
        target_kuerzel: parsed.data.target_kuerzel,
        confidence: parsed.data.confidence,
        notes: parsed.data.notes ?? null,
        created_by: profil.kuerzel,
      })
      .select()
      .single();

    if (error) {
      logError("/api/admin/rules POST", "Insert-Fehler", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    logError("/api/admin/rules POST", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
