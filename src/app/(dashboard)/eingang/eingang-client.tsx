"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { IconSearch } from "@/components/ui/icons";
import { KONTROLLE_KEYS, type KontrolleKey } from "@/lib/eingang";


export type EingangZeile = {
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
  /** 03.10.2026 — wann und von wem gesichtet; null = noch von niemandem. */
  gesichtet_am: string | null;
  gesichtet_von: string | null;
  /** keine Bestellung UND nicht gesichtet — braucht einen Blick. */
  offen: boolean;
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

type Auswahl = KontrolleKey | "alle" | "offen";

/**
 * Eingang — beantwortet "ist alles verbucht, was im Ordner lag, und hat
 * jemand gesehen, was nicht verbucht wurde?".
 *
 * 03.10.2026 (Umbau 1): Die Vorauswahl steht auf "Offen" — keine Bestellung
 * und noch von niemandem gesichtet. Das Verbuchte muss niemand durchsehen,
 * das Gesichtete auch nicht; die Lücken schon. Sichten ist ein Haken, kein
 * Loeschen: die Mail bleibt in der Liste, nur nicht mehr als offen.
 */
export function EingangClient({
  ordner,
  ordnerListe,
  zeilen,
  counts,
  offenCount,
  zeilenLimit,
  ladeFehler,
  istRechnungsordner,
}: {
  ordner: string;
  ordnerListe: string[];
  zeilen: EingangZeile[];
  counts: Record<KontrolleKey, number>;
  /** Offene Mails im ganzen Ordner (eigene Count-Abfrage, nicht aus der Liste). */
  offenCount: number;
  zeilenLimit: number;
  ladeFehler: string | null;
  /** Nur im Rechnungsordner gilt die Sichtungspflicht; andere Ordner sind Rauschen. */
  istRechnungsordner: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [aktiv, setAktiv] = useState<Auswahl>("offen");
  const [suche, setSuche] = useState("");
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);

  const gesamt = KONTROLLE_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const quote = gesamt > 0 ? Math.round(((counts.verbucht ?? 0) / gesamt) * 100) : 0;

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return zeilen.filter((z) => {
      if (aktiv === "offen" && !z.offen) return false;
      if (aktiv !== "alle" && aktiv !== "offen" && z.kontrolle !== aktiv) return false;
      if (!q) return true;
      return [z.absender, z.betreff, z.bestellnummer, z.haendler_name]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [zeilen, aktiv, suche]);

  const limitErreicht = zeilen.length >= zeilenLimit;
  const offeneSichtbar = gefiltert.filter((z) => z.offen);

  function toggle(id: string) {
    setAusgewaehlt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sichten(ids: string[], gesichtet: boolean) {
    if (ids.length === 0) return;
    setLaeuft(true);
    try {
      const res = await fetch("/api/eingang/sichten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, gesichtet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Sichten fehlgeschlagen", { description: data.error || "Bitte erneut versuchen." });
        return;
      }
      toast.success(
        gesichtet
          ? `${data.gesichtet} ${data.gesichtet === 1 ? "Mail" : "Mails"} gesichtet`
          : "Sichtung zurückgenommen",
      );
      setAusgewaehlt(new Set());
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Eingang"
        title="Eingang"
        description={
          <>
            Jede Mail aus dem Rechnungsordner — mit der Antwort, ob sie an einer
            Bestellung gelandet ist. Was nicht verbucht ist, bleibt offen, bis jemand
            es gesichtet hat. Damit nichts unbemerkt verschwindet.
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
            href={`/eingang?ordner=${encodeURIComponent(o)}`}
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
          offenCount === 0
            ? `Nichts offen — alles verbucht oder gesichtet. Verbuchungsquote ${quote} %.`
            : `${offenCount} ${offenCount === 1 ? "Mail wartet" : "Mails warten"} darauf, dass jemand sie ansieht — Verbuchungsquote ${quote} %.`
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAktiv("offen")}
            className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
              aktiv === "offen"
                ? "bg-brand text-white"
                : "border border-brand text-brand hover:bg-brand/10"
            }`}
          >
            Offen {offenCount}
          </button>
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

        {aktiv === "offen" && (
          <p className="mt-3 text-body-sm text-foreground-muted">
            {istRechnungsordner
              ? "An keiner Bestellung gelandet und noch von niemandem gesichtet. Was hier steht, hat noch keiner gesehen — bitte ansehen und abhaken."
              : "An keiner Bestellung gelandet und noch nicht gesichtet. In diesem Ordner ist das meist Rauschen; die Pflicht gilt nur im Rechnungsordner."}
          </p>
        )}
        {aktiv !== "alle" && aktiv !== "offen" && (
          <p className="mt-3 text-body-sm text-foreground-muted">
            {KONTROLLE_META[aktiv].erklaerung}
          </p>
        )}
      </SectionCard>

      {/* Liste */}
      <SectionCard
        title="Einzelne Mails"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {offeneSichtbar.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={laeuft}
                  onClick={() =>
                    setAusgewaehlt(
                      ausgewaehlt.size === offeneSichtbar.length
                        ? new Set()
                        : new Set(offeneSichtbar.map((z) => z.id)),
                    )
                  }
                >
                  {ausgewaehlt.size === offeneSichtbar.length ? "Auswahl aufheben" : `Alle ${offeneSichtbar.length} auswählen`}
                </Button>
                <Button
                  size="sm"
                  disabled={laeuft || ausgewaehlt.size === 0}
                  onClick={() => sichten(Array.from(ausgewaehlt), true)}
                >
                  {ausgewaehlt.size > 0 ? `${ausgewaehlt.size} als gesichtet abhaken` : "Als gesichtet abhaken"}
                </Button>
              </>
            )}
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Absender, Betreff, Nummer…"
              iconLeft={<IconSearch />}
              aria-label="Liste durchsuchen"
            />
          </div>
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
            title={suche ? "Nichts gefunden" : aktiv === "offen" ? "Nichts offen" : "Keine Einträge"}
            description={
              suche
                ? "Zu dieser Suche gibt es in der aktuellen Auswahl keine Mail."
                : aktiv === "offen"
                  ? "Jede Mail in diesem Ordner ist verbucht oder wurde gesichtet."
                  : "In dieser Auswahl liegt nichts an."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-line text-meta uppercase tracking-[0.1em] text-foreground-muted">
                  <th className="py-2 pr-2 w-6" aria-label="Auswahl" />
                  <th className="py-2 pr-3 font-medium">Eingang</th>
                  <th className="py-2 pr-3 font-medium">Absender</th>
                  <th className="py-2 pr-3 font-medium">Betreff</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Bestellung</th>
                  <th className="py-2 pr-3 font-medium text-right">Betrag</th>
                  <th className="py-2 pr-3 font-medium">Gesichtet</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((z) => (
                  <tr
                    key={z.id}
                    className={`border-b border-line/60 align-top ${z.offen ? "" : "text-foreground-muted"}`}
                  >
                    <td className="py-2 pr-2">
                      {z.offen && (
                        <input
                          type="checkbox"
                          checked={ausgewaehlt.has(z.id)}
                          onChange={() => toggle(z.id)}
                          aria-label={`Mail auswählen: ${z.betreff ?? z.absender ?? ""}`}
                          className="h-4 w-4 accent-brand"
                        />
                      )}
                    </td>
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
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {z.bestellung_id ? (
                        <span className="text-foreground-muted">—</span>
                      ) : z.gesichtet_am ? (
                        <button
                          type="button"
                          disabled={laeuft}
                          onClick={() => sichten([z.id], false)}
                          title="Sichtung zurücknehmen"
                          className="text-meta text-foreground-muted hover:text-foreground"
                        >
                          {z.gesichtet_von ?? "?"} · {formatDatum(z.gesichtet_am)}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={laeuft}
                          onClick={() => sichten([z.id], true)}
                          className="text-meta text-brand hover:underline"
                        >
                          abhaken
                        </button>
                      )}
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
