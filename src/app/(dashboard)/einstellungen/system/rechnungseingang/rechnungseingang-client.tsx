"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { IconSearch } from "@/components/ui/icons";

/**
 * Die vier Kontroll-Zustaende aus `v_rechnungseingang`.
 * Reihenfolge = Anzeigereihenfolge der Filter-Pillen.
 */
export const KONTROLLE_KEYS = [
  "ohne_bestellung",
  "aussortiert",
  "fehlgeschlagen",
  "verbucht",
] as const;

export type KontrolleKey = (typeof KONTROLLE_KEYS)[number];

export type RechnungseingangZeile = {
  id: string;
  eingang: string | null;
  ordner: string;
  absender: string | null;
  betreff: string | null;
  status: string | null;
  ki_typ: string | null;
  erwarteter_typ: string | null;
  ordner_passt_nicht: boolean;
  hat_anhang: boolean;
  fehler: string | null;
  bestellung_id: string | null;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  besteller_kuerzel: string | null;
  bestellung_status: string | null;
  kontrolle: KontrolleKey;
};

type Tone = "success" | "warning" | "error" | "muted" | "info";

const KONTROLLE_META: Record<
  KontrolleKey,
  { label: string; tone: Tone; erklaerung: string }
> = {
  ohne_bestellung: {
    label: "Ohne Bestellung",
    tone: "warning",
    erklaerung:
      "Verarbeitet, aber an keiner Bestellung gelandet. Hier fehlt am ehesten etwas.",
  },
  aussortiert: {
    label: "Aussortiert",
    tone: "error",
    erklaerung:
      "Von der Vorprüfung als irrelevant eingestuft und nie weiterverarbeitet. Im Rechnungsordner ist das immer verdächtig.",
  },
  fehlgeschlagen: {
    label: "Fehlgeschlagen",
    tone: "error",
    erklaerung: "Die Verarbeitung ist mit einem Fehler abgebrochen.",
  },
  verbucht: {
    label: "Verbucht",
    tone: "success",
    erklaerung: "Einer Bestellung zugeordnet — hier ist alles in Ordnung.",
  },
};

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatBetrag(betrag: number | null): string {
  if (betrag === null || betrag === undefined) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag);
}

/**
 * Rechnungseingang — beantwortet "ist alles verbucht, was im Ordner lag?".
 *
 * Die Vorauswahl steht bewusst auf "Ohne Bestellung": das Verbuchte muss
 * niemand durchsehen, die Lücken schon.
 */
export function RechnungseingangClient({
  ordner,
  ordnerListe,
  zeilen,
  counts,
  zeilenLimit,
  ladeFehler,
}: {
  ordner: string;
  ordnerListe: string[];
  zeilen: RechnungseingangZeile[];
  counts: Record<KontrolleKey, number>;
  zeilenLimit: number;
  ladeFehler: string | null;
}) {
  const [aktiv, setAktiv] = useState<KontrolleKey | "alle">("ohne_bestellung");
  const [suche, setSuche] = useState("");

  const gesamt = KONTROLLE_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const offen =
    (counts.ohne_bestellung ?? 0) + (counts.aussortiert ?? 0) + (counts.fehlgeschlagen ?? 0);
  const quote = gesamt > 0 ? Math.round(((counts.verbucht ?? 0) / gesamt) * 100) : 0;

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return zeilen.filter((z) => {
      if (aktiv !== "alle" && z.kontrolle !== aktiv) return false;
      if (!q) return true;
      return [z.absender, z.betreff, z.bestellnummer, z.haendler_name]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [zeilen, aktiv, suche]);

  const limitErreicht = zeilen.length >= zeilenLimit;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Kontrolle"
        title="Rechnungseingang"
        description={
          <>
            Jede Mail aus den überwachten Ordnern — mit der Antwort, ob sie an einer
            Bestellung gelandet ist. Damit nichts unbemerkt verschwindet.
          </>
        }
      />

      {ladeFehler && (
        <div className="rounded-md border border-error-border bg-error-bg px-4 py-3 text-body-sm text-error">
          Die Liste konnte nicht geladen werden: {ladeFehler}
        </div>
      )}

      {/* Ordnerwahl */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-meta uppercase tracking-[0.14em] text-foreground-muted">
          Ordner
        </span>
        {ordnerListe.map((o) => (
          <Link
            key={o}
            href={`/einstellungen/system/rechnungseingang?ordner=${encodeURIComponent(o)}`}
            className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
              o === ordner
                ? "bg-brand text-white"
                : "border border-line text-foreground-muted hover:text-foreground"
            }`}
          >
            {o}
          </Link>
        ))}
      </div>

      {/* Kopfzahlen */}
      <SectionCard
        title={`${gesamt} Mails in „${ordner}"`}
        description={
          offen === 0
            ? "Alles verbucht."
            : `${offen} davon sind an keiner Bestellung gelandet — Verbuchungsquote ${quote} %.`
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAktiv("alle")}
            className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
              aktiv === "alle"
                ? "bg-foreground text-canvas"
                : "border border-line text-foreground-muted hover:text-foreground"
            }`}
          >
            Alle {gesamt}
          </button>
          {KONTROLLE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAktiv(k)}
              title={KONTROLLE_META[k].erklaerung}
              className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                aktiv === k
                  ? "bg-foreground text-canvas"
                  : "border border-line text-foreground-muted hover:text-foreground"
              }`}
            >
              {KONTROLLE_META[k].label} {counts[k] ?? 0}
            </button>
          ))}
        </div>

        {aktiv !== "alle" && (
          <p className="mt-3 text-body-sm text-foreground-muted">
            {KONTROLLE_META[aktiv].erklaerung}
          </p>
        )}
      </SectionCard>

      {/* Liste */}
      <SectionCard
        title="Einzelne Mails"
        action={
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Absender, Betreff, Nummer…"
            iconLeft={<IconSearch />}
            aria-label="Liste durchsuchen"
          />
        }
      >
        {limitErreicht && (
          <div className="mb-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-meta text-warning">
            Es werden die neuesten {zeilenLimit} Mails angezeigt. Die Zahlen oben
            zählen den gesamten Ordner.
          </div>
        )}

        {gefiltert.length === 0 ? (
          <EmptyState
            tone={aktiv === "verbucht" || gesamt === 0 ? "info" : "success"}
            title={suche ? "Nichts gefunden" : "Keine Einträge"}
            description={
              suche
                ? "Zu dieser Suche gibt es in der aktuellen Auswahl keine Mail."
                : "In dieser Auswahl liegt nichts an."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-line text-meta uppercase tracking-[0.1em] text-foreground-muted">
                  <th className="py-2 pr-3 font-medium">Eingang</th>
                  <th className="py-2 pr-3 font-medium">Absender</th>
                  <th className="py-2 pr-3 font-medium">Betreff</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Bestellung</th>
                  <th className="py-2 pr-3 font-medium text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((z) => (
                  <tr key={z.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap font-mono-amount text-foreground-muted">
                      {formatDatum(z.eingang)}
                    </td>
                    <td className="py-2 pr-3 max-w-[200px] truncate" title={z.absender ?? ""}>
                      {z.absender ?? "—"}
                    </td>
                    <td className="py-2 pr-3 max-w-[320px]">
                      <span className="block truncate" title={z.betreff ?? ""}>
                        {z.betreff ?? "—"}
                      </span>
                      {z.fehler && (
                        <span className="mt-0.5 block truncate text-meta text-error" title={z.fehler}>
                          {z.fehler}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={KONTROLLE_META[z.kontrolle].tone} size="sm">
                          {KONTROLLE_META[z.kontrolle].label}
                        </Badge>
                        {z.ordner_passt_nicht && (
                          <Badge
                            tone="warning"
                            size="sm"
                            title={`Erwartet: ${z.erwarteter_typ ?? "?"} — erkannt: ${z.ki_typ ?? "?"}`}
                          >
                            Ordner passt nicht
                          </Badge>
                        )}
                        {!z.hat_anhang && (
                          <Badge tone="muted" size="sm">
                            ohne Anhang
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {z.bestellung_id ? (
                        <Link
                          href={`/bestellungen/${z.bestellung_id}`}
                          className="text-brand hover:underline"
                        >
                          {z.bestellnummer || z.haendler_name || "Bestellung"}
                        </Link>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-right font-mono-amount">
                      {formatBetrag(z.betrag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
