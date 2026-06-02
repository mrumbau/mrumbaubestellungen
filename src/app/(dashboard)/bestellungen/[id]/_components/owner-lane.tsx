"use client";

/**
 * OwnerLane — Pool-Phase-2-Surface im DetailHeader.
 *
 * Drei States (Drei-Sprachen-Disziplin, siehe DESIGN.md):
 *   1. **POOL**  — besteller_kuerzel=UNBEKANNT, Material, nicht freigegeben.
 *      Leerer Avatar + Eyebrow "Vorschlag" + Vorschlag-Pill + Magnetic-CTA
 *      "Übernehmen". Wenn die Pipeline einen Vorschlag-Kürzel mitgibt, wird er
 *      als ghost-Pill mit dotted-underline gerendert (NIE als Status-Pill —
 *      sonst kollidiert er mit dem 6-State-Workflow).
 *   2. **CLAIMED** — eindeutig zugewiesen, nicht freigegeben. Avatar + "Über-
 *      nommen von X" + zwei sekundäre Aktionen (Zurück in Pool, Reassign).
 *   3. **FREIGEGEBEN** — Lane kollabiert komplett. Der Owner steht in der
 *      StatusCell, kein eigener Lane-Bedarf.
 *
 * SU/Abo nutzen die bestehende "Geteilt"-Logik in der Meta-Line der Detail-
 * Header — keine OwnerLane, weil alle Besteller gleichberechtigt freigeben
 * dürfen. SU/Abo-Sichtbarkeit ist nicht das Pool-Problem.
 *
 * Conflict-Handling: pool_claim_bestellung-RPC ist idempotent + race-safe.
 * Bei was_already_claimed=true zeigen wir einen Warning-Toast mit dem aktuellen
 * Owner und triggern router.refresh() — der Server-Component lädt die neue
 * Realität nach.
 *
 * 02.06.2026 (Pool Phase 2).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { useToast } from "@/components/ui/toast";

export interface OwnerLaneProps {
  bestellungId: string;
  besteller_kuerzel: string;
  besteller_name: string;
  bestellungsart: string | null | undefined;
  status: string;
  vorschlag_kuerzel: string | null;
  vorschlag_konfidenz: number | null;
  /** Aktueller User. */
  profil: { kuerzel: string; rolle: string; name: string };
}

export function OwnerLane(props: OwnerLaneProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const art = props.bestellungsart || "material";
  const isMaterial = art === "material";
  const isFreigegeben = props.status === "freigegeben";
  const isUnbekannt = props.besteller_kuerzel === "UNBEKANNT" || !props.besteller_kuerzel;
  const isOwner = props.besteller_kuerzel === props.profil.kuerzel;
  const isAdmin = props.profil.rolle === "admin";

  // SU/Abo nutzen weiterhin die "Geteilt"-Anzeige in der Meta-Line — keine Lane.
  if (!isMaterial) return null;
  // Freigegeben: kein Owner-Workflow mehr nötig.
  if (isFreigegeben) return null;

  async function callPoolAction(
    endpoint: "pool-claim" | "pool-return",
    setBusy: (b: boolean) => void,
    body?: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bestellungen/${props.bestellungId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error("Aktion fehlgeschlagen", {
          description: typeof json?.error === "string" ? json.error : undefined,
        });
        return;
      }

      // RPC-Antwort: { success: true } oder { success: false, error, message, was_already_claimed?, current_owner? }
      if (json?.success === true) {
        if (endpoint === "pool-claim") {
          toast.success("Übernommen", { description: "Die Bestellung gehört jetzt dir." });
        } else {
          toast.success("Zurück in den Pool", {
            description: "Andere Besteller können sie jetzt übernehmen.",
          });
        }
      } else if (json?.was_already_claimed) {
        toast.warning(`Wurde gerade von ${json.current_owner ?? "jemand anderem"} übernommen`, {
          description: "Die Liste wird aktualisiert.",
        });
      } else if (typeof json?.message === "string") {
        toast.warning(json.message);
      } else if (typeof json?.error === "string") {
        toast.warning(json.error);
      }

      startTransition(() => router.refresh());
    } catch {
      toast.error("Verbindung fehlgeschlagen", {
        description: "Bitte prüfe deine Internetverbindung und versuche es erneut.",
      });
    } finally {
      setBusy(false);
    }
  }

  // POOL-State
  if (isUnbekannt) {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-2.5 rounded-md bg-canvas border border-dashed border-line-strong">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <BestellerCell
            besteller_kuerzel={props.besteller_kuerzel}
            besteller_name={props.besteller_name}
            bestellungsart={props.bestellungsart}
            vorschlag_kuerzel={props.vorschlag_kuerzel}
            vorschlag_konfidenz={props.vorschlag_konfidenz}
            variant="with-name"
          />
          {props.vorschlag_kuerzel && props.vorschlag_kuerzel !== "UNBEKANNT" && (
            <span className="hidden sm:inline text-[12px] text-foreground-subtle">
              Pipeline schlägt {props.vorschlag_kuerzel} vor
              {typeof props.vorschlag_konfidenz === "number" && (
                <span className="ml-1 font-mono-amount">
                  · {Math.round(props.vorschlag_konfidenz * 100)} %
                </span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => callPoolAction("pool-claim", setIsClaiming)}
          disabled={isClaiming || pending}
          className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[14px] min-h-[44px] sm:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-label="Bestellung übernehmen"
        >
          {isClaiming ? (
            <svg
              className="animate-spin w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeOpacity="0.25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          Übernehmen
        </button>
      </div>
    );
  }

  // CLAIMED-State: nur eigener Owner oder Admin sieht Sekundär-Aktionen
  if (isOwner || isAdmin) {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-2.5 rounded-md bg-canvas">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <BestellerCell
            besteller_kuerzel={props.besteller_kuerzel}
            besteller_name={props.besteller_name}
            bestellungsart={props.bestellungsart}
            variant="with-name"
          />
          <span className="hidden sm:inline text-[12px] text-foreground-subtle">
            {isOwner ? "Übernommen — du bist dran" : "Zugeordnet"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => callPoolAction("pool-return", setIsReturning)}
          disabled={isReturning || pending}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-line-strong bg-surface text-foreground-muted hover:bg-hover hover:text-foreground text-[13px] min-h-[44px] sm:min-h-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-label="Bestellung zurück in den Pool"
        >
          {isReturning ? (
            <svg
              className="animate-spin w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14L4 9m0 0l5-5M4 9h11a5 5 0 010 10h-4" />
            </svg>
          )}
          Zurück in Pool
        </button>
      </div>
    );
  }

  // Sonderfall: Bestellung gehört jemand anderem, kein Eingriff möglich
  return null;
}
