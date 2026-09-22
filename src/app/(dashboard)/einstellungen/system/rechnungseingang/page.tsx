import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  RechnungseingangClient,
  KONTROLLE_KEYS,
  type RechnungseingangZeile,
  type KontrolleKey,
} from "./rechnungseingang-client";

export const dynamic = "force-dynamic";

/** Der Ordner, um den es fachlich geht — Default beim Aufruf ohne Parameter. */
const DEFAULT_ORDNER = "In Sachen Rechnungen";

/**
 * Wie viele Zeilen maximal an den Client gehen. Der Rechnungsordner liegt bei
 * gut 600 Mails, der Posteingang bei ueber 3000. Die Kopfzahlen kommen
 * deshalb aus eigenen Count-Abfragen und nicht aus dieser Liste — sonst waere
 * die Kontrolle ab dem Limit still falsch, und das ist genau der Fehler, den
 * diese Seite aufdecken soll.
 */
const ZEILEN_LIMIT = 1000;

/**
 * Rechnungseingang — Kontrollansicht (21.09.2026).
 *
 * Fachliche Frage: "Ist alles verbucht, was im Rechnungsordner lag?"
 *
 * Anlass: Von 615 Mails im Ordner "In Sachen Rechnungen" waren nur 286 einer
 * Bestellung zugeordnet. 220 wurden als irrelevant aussortiert, 102 liefen
 * durch ohne an einer Bestellung zu landen. Mehr als die Haelfte des
 * Rechnungseingangs war damit nirgends sichtbar — es gab keine Moeglichkeit
 * zu pruefen, ob eine Rechnung fehlt.
 *
 * Abgrenzung zu den bestehenden Seiten:
 *   - /einstellungen/system/logs  — technisches Rohprotokoll, 100 Zeilen,
 *     ohne Ordnerbezug und ohne Verknuepfung zur Bestellung.
 *   - /einstellungen/verworfene   — nur manuell verworfene Mails, nicht die
 *     automatisch aussortierten.
 */
export default async function RechnungseingangPage({
  searchParams,
}: {
  searchParams: Promise<{ ordner?: string }>;
}) {
  // Rollen-Gate liegt im /einstellungen/system/layout.tsx
  const params = await searchParams;
  const ordner = params.ordner?.trim() || DEFAULT_ORDNER;

  const supabase = await createServerSupabaseClient();

  const zeilenQuery = supabase
    .from("v_rechnungseingang")
    .select(
      "id, eingang, ordner, absender, betreff, status, ki_typ, erwarteter_typ, ordner_passt_nicht, hat_anhang, fehler, bestellung_id, bestellnummer, haendler_name, betrag, besteller_kuerzel, bestellung_status, kontrolle",
    )
    .eq("ordner", ordner)
    .order("eingang", { ascending: false })
    .limit(ZEILEN_LIMIT);

  // Kopfzahlen je Kontroll-Zustand als eigene Count-Abfragen, damit sie auch
  // oberhalb des Zeilen-Limits stimmen.
  const countQueries = KONTROLLE_KEYS.map((k) =>
    supabase
      .from("v_rechnungseingang")
      .select("id", { count: "exact", head: true })
      .eq("ordner", ordner)
      .eq("kontrolle", k),
  );

  // Ordner-Auswahl: die konfigurierten Sync-Ordner, damit man auch
  // Lieferscheine und Posteingang gegenpruefen kann.
  const ordnerQuery = supabase
    .from("mail_sync_folders")
    .select("folder_name")
    .order("folder_name");

  const [zeilenRes, ordnerRes, ...countRes] = await Promise.all([
    zeilenQuery,
    ordnerQuery,
    ...countQueries,
  ]);

  const counts = {} as Record<KontrolleKey, number>;
  KONTROLLE_KEYS.forEach((k, i) => {
    counts[k] = countRes[i]?.count ?? 0;
  });

  const ordnerListe = Array.from(
    new Set([
      DEFAULT_ORDNER,
      ...((ordnerRes.data ?? []) as Array<{ folder_name: string }>).map((f) => f.folder_name),
    ]),
  );

  const zeilen = (zeilenRes.data ?? []) as unknown as RechnungseingangZeile[];

  return (
    <RechnungseingangClient
      ordner={ordner}
      ordnerListe={ordnerListe}
      zeilen={zeilen}
      counts={counts}
      zeilenLimit={ZEILEN_LIMIT}
      ladeFehler={zeilenRes.error?.message ?? null}
    />
  );
}
