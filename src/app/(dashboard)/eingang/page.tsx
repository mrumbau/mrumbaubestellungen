import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { RECHNUNGSORDNER } from "@/lib/eingang";
import {
  EingangClient,
  KONTROLLE_KEYS,
  type EingangZeile,
  type KontrolleKey,
} from "./eingang-client";

export const dynamic = "force-dynamic";

/**
 * Wie viele Zeilen maximal an den Client gehen. Die Kopfzahlen kommen aus
 * eigenen Count-Abfragen und nicht aus dieser Liste — sonst waere die
 * Kontrolle ab dem Limit still falsch, und das ist genau der Fehler, den
 * diese Seite aufdecken soll.
 */
const ZEILEN_LIMIT = 1000;

/**
 * Eingang (03.10.2026, vorher "Rechnungseingang" unter System).
 *
 * Fachliche Frage: "Ist alles verbucht, was im Rechnungsordner lag — und hat
 * jemand gesehen, was nicht verbucht wurde?"
 *
 * Umbau 1: Nichts verschwindet mehr. Jede Mail hat einen Zustand, und was an
 * keiner Bestellung landet, bleibt offen, bis ein Mensch es gesichtet hat.
 * Der Zaehler in der Navigation zeigt genau diese offenen Mails.
 */
export default async function EingangPage({
  searchParams,
}: {
  searchParams: Promise<{ ordner?: string }>;
}) {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  const params = await searchParams;
  const ordner = params.ordner?.trim() || RECHNUNGSORDNER;

  const supabase = await createServerSupabaseClient();

  const zeilenQuery = supabase
    .from("v_rechnungseingang")
    .select(
      "id, eingang, ordner, absender, betreff, status, ki_typ, erwarteter_typ, ordner_passt_nicht, hat_anhang, fehler, bestellung_id, bestellnummer, haendler_name, betrag, besteller_kuerzel, bestellung_status, kontrolle, gesichtet_am, gesichtet_von, offen",
    )
    .eq("ordner", ordner)
    .order("eingang", { ascending: false })
    .limit(ZEILEN_LIMIT);

  const countQueries = KONTROLLE_KEYS.map((k) =>
    supabase
      .from("v_rechnungseingang")
      .select("id", { count: "exact", head: true })
      .eq("ordner", ordner)
      .eq("kontrolle", k),
  );
  const offenQuery = supabase
    .from("v_rechnungseingang")
    .select("id", { count: "exact", head: true })
    .eq("ordner", ordner)
    .eq("offen", true);

  const ordnerQuery = supabase
    .from("mail_sync_folders")
    .select("folder_name")
    .order("folder_name");

  const [zeilenRes, ordnerRes, offenRes, ...countRes] = await Promise.all([
    zeilenQuery,
    ordnerQuery,
    offenQuery,
    ...countQueries,
  ]);

  const counts = {} as Record<KontrolleKey, number>;
  KONTROLLE_KEYS.forEach((k, i) => {
    counts[k] = countRes[i]?.count ?? 0;
  });

  const ordnerListe = Array.from(
    new Set([
      RECHNUNGSORDNER,
      ...((ordnerRes.data ?? []) as Array<{ folder_name: string }>).map((f) => f.folder_name),
    ]),
  );

  return (
    <EingangClient
      ordner={ordner}
      ordnerListe={ordnerListe}
      zeilen={(zeilenRes.data ?? []) as unknown as EingangZeile[]}
      counts={counts}
      offenCount={offenRes.count ?? 0}
      zeilenLimit={ZEILEN_LIMIT}
      ladeFehler={zeilenRes.error?.message ?? null}
      istRechnungsordner={ordner === RECHNUNGSORDNER}
    />
  );
}
