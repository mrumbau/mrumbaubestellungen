"use client";

/**
 * OwnerLane — Pool-Phase-2/3-Surface im DetailHeader.
 *
 * Drei States (Drei-Sprachen-Disziplin, siehe DESIGN.md):
 *   1. **POOL**  — besteller_kuerzel=UNBEKANNT, Material, nicht freigegeben.
 *      Leerer Avatar + Eyebrow "Vorschlag" + Vorschlag-Pill + Magnetic-CTA
 *      "Übernehmen". Wenn die Pipeline einen Vorschlag-Kürzel mitgibt, wird er
 *      als ghost-Pill mit dotted-underline gerendert (NIE als Status-Pill —
 *      sonst kollidiert er mit dem 6-State-Workflow).
 *   2. **CLAIMED** — eindeutig zugewiesen, nicht freigegeben. Avatar + "Über-
 *      nommen von X" + zwei sekundäre Aktionen (Zurück in Pool, Übertragen).
 *   3. **FREIGEGEBEN** — Lane kollabiert komplett. Der Owner steht in der
 *      StatusCell, kein eigener Lane-Bedarf.
 *
 * SU/Abo nutzen die bestehende "Geteilt"-Logik in der Meta-Line der Detail-
 * Header — keine OwnerLane.
 *
 * Optimistic-UI (02.06.2026 Pool Phase 3):
 *   - `optimisticOwner` wird sofort beim Klick gesetzt, damit der State auf
 *     CLAIMED springt ohne auf das router.refresh()-Round-Trip zu warten.
 *   - Bei Server-Error rollback via Setzen auf null (Server-Werte gewinnen
 *     nach refresh ohnehin).
 *
 * Conflict-Handling: pool_claim_bestellung-RPC ist idempotent + race-safe.
 * Bei was_already_claimed=true zeigen wir einen Warning-Toast mit dem aktuellen
 * Owner und triggern router.refresh() — der Server-Component lädt die neue
 * Realität nach.
 *
 * 02.06.2026 (Pool Phase 2 + 3).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export interface BestellerOption {
  kuerzel: string;
  name: string;
}

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
  /**
   * Mögliche Reassign-Ziele (alle aktiven Besteller + Admins, ohne den
   * aktuellen Owner — die Filterung passiert hier im UI nicht im Server,
   * damit der Liste-Endpoint nur einmal pro Page geladen wird).
   */
  besteller_options?: BestellerOption[];
}

export function OwnerLane(props: OwnerLaneProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  // Optimistic-State: sobald der User klickt, simulieren wir die Antwort der
  // Pipeline lokal — der Server gewinnt nach dem router.refresh() ohnehin.
  const [optimisticKuerzel, setOptimisticKuerzel] = useState<string | null>(null);
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  // Modal/Dialog-Sichtbarkeit
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassignKommentar, setReassignKommentar] = useState<string>("");
  // Owner-Change-Realtime: merkt sich das zuletzt gesehene Kürzel um Wechsel
  // durch andere User zu detektieren. Initial gleich dem Server-Zustand,
  // damit der erste Mount nicht als "Wechsel" zählt.
  const lastSeenOwnerRef = useRef(props.besteller_kuerzel);

  // 02.06.2026 (Pool Phase 3) — Owner-Change-Subscription. Abonniert events-
  // INSERT für diese Bestellung; bei pool_claim/reassign/return durch einen
  // ANDEREN Actor (nicht ich) zeigen wir einen kontextualisierten Toast.
  // Existing useBestellungRealtime (in use-bestelldetail.ts) übernimmt den
  // tatsächlichen router.refresh — wir setzen nur das Toast-Signal.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`pool-owner-changes-${props.bestellungId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `entity_id=eq.${props.bestellungId}`,
        },
        (payload) => {
          const evt = payload.new as {
            event_type?: string;
            actor?: string | null;
            payload?: Record<string, unknown> | null;
          };
          if (!evt?.event_type) return;
          if (!["pool_claim", "pool_reassign", "pool_return"].includes(evt.event_type)) return;
          // Eigener Trigger → keine Notification (eigenes Optimistic + Toast
          // hat schon gefeuert).
          if (evt.actor === props.profil.kuerzel) return;
          if (evt.event_type === "pool_claim") {
            toast.warning(`Wurde gerade von ${evt.actor ?? "jemand anderem"} übernommen`, {
              description: "Die Ansicht aktualisiert sich automatisch.",
            });
          } else if (evt.event_type === "pool_reassign") {
            const to = String(evt.payload?.to_kuerzel ?? "jemand anderem");
            toast.info(`Übertragen an ${to}`, {
              description: `Durch ${evt.actor ?? "Admin"}.`,
            });
          } else if (evt.event_type === "pool_return") {
            toast.info("Zurück in den Pool gelegt", {
              description: `Durch ${evt.actor ?? "Admin"}.`,
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [props.bestellungId, props.profil.kuerzel, toast]);

  // Lokales Tracking für Owner-Change ohne Event-Subscription (z.B. wenn
  // jemand direkt UPDATE setzt ohne Event-Trigger). Bei Owner-Wechsel reset
  // optimistic state damit Server-Wert sichtbar wird.
  useEffect(() => {
    if (props.besteller_kuerzel !== lastSeenOwnerRef.current) {
      lastSeenOwnerRef.current = props.besteller_kuerzel;
      // Optimistic-State reset wenn Server uns überholt hat
      setOptimisticKuerzel(null);
      setOptimisticName(null);
    }
  }, [props.besteller_kuerzel]);

  // Effektive (= ggf. optimistisch überschriebene) Owner-Werte.
  const effectiveKuerzel = optimisticKuerzel ?? props.besteller_kuerzel;
  const effectiveName = optimisticName ?? props.besteller_name;

  const art = props.bestellungsart || "material";
  const isMaterial = art === "material";
  const isFreigegeben = props.status === "freigegeben";
  const isUnbekannt = effectiveKuerzel === "UNBEKANNT" || !effectiveKuerzel;
  const isOwner = effectiveKuerzel === props.profil.kuerzel;
  const isAdmin = props.profil.rolle === "admin";

  // SU/Abo nutzen weiterhin die "Geteilt"-Anzeige in der Meta-Line — keine Lane.
  if (!isMaterial) return null;
  // Freigegeben: kein Owner-Workflow mehr nötig.
  if (isFreigegeben) return null;

  async function postPoolAction(
    endpoint: "pool-claim" | "pool-return" | "pool-reassign",
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const res = await fetch(`/api/bestellungen/${props.bestellungId}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json };
  }

  function rollbackOptimistic() {
    setOptimisticKuerzel(null);
    setOptimisticName(null);
  }

  async function handleClaim() {
    setIsClaiming(true);
    // Optimistic — wir nehmen sofort an, dass es klappt.
    setOptimisticKuerzel(props.profil.kuerzel);
    setOptimisticName(props.profil.name);
    try {
      const { ok, json } = await postPoolAction("pool-claim");
      if (!ok) {
        rollbackOptimistic();
        toast.error("Aktion fehlgeschlagen", {
          description: typeof json?.error === "string" ? json.error : undefined,
        });
        return;
      }
      if (json?.success === true) {
        toast.success("Übernommen", { description: "Die Bestellung gehört jetzt dir." });
      } else if (json?.was_already_claimed) {
        rollbackOptimistic();
        toast.warning(`Wurde gerade von ${json.current_owner ?? "jemand anderem"} übernommen`, {
          description: "Die Liste wird aktualisiert.",
        });
      } else if (typeof json?.message === "string") {
        rollbackOptimistic();
        toast.warning(json.message);
      } else if (typeof json?.error === "string") {
        rollbackOptimistic();
        toast.warning(json.error);
      }
      startTransition(() => router.refresh());
    } catch {
      rollbackOptimistic();
      toast.error("Verbindung fehlgeschlagen", {
        description: "Bitte prüfe deine Internetverbindung und versuche es erneut.",
      });
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleReturn() {
    setIsReturning(true);
    setOptimisticKuerzel("UNBEKANNT");
    setOptimisticName("UNBEKANNT");
    try {
      const { ok, json } = await postPoolAction("pool-return");
      if (!ok || json?.success !== true) {
        rollbackOptimistic();
        const msg =
          typeof json?.message === "string"
            ? json.message
            : typeof json?.error === "string"
              ? json.error
              : "Zurücklegen fehlgeschlagen.";
        toast.warning(msg);
        return;
      }
      toast.success("Zurück in den Pool", {
        description: "Andere Besteller können sie jetzt übernehmen.",
      });
      setReturnDialogOpen(false);
      startTransition(() => router.refresh());
    } catch {
      rollbackOptimistic();
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setIsReturning(false);
    }
  }

  async function handleReassign() {
    if (!reassignTarget) return;
    setIsReassigning(true);
    const targetOpt = (props.besteller_options ?? []).find((o) => o.kuerzel === reassignTarget);
    setOptimisticKuerzel(reassignTarget);
    setOptimisticName(targetOpt?.name ?? reassignTarget);
    try {
      const { ok, json } = await postPoolAction("pool-reassign", {
        neuer_kuerzel: reassignTarget,
        kommentar: reassignKommentar || undefined,
      });
      if (!ok || json?.success !== true) {
        rollbackOptimistic();
        const msg =
          typeof json?.message === "string"
            ? json.message
            : typeof json?.error === "string"
              ? json.error
              : "Übertragen fehlgeschlagen.";
        toast.warning(msg);
        return;
      }
      toast.success("Übertragen", {
        description: `Die Bestellung gehört jetzt ${targetOpt?.name ?? reassignTarget}.`,
      });
      setReassignDialogOpen(false);
      setReassignTarget("");
      setReassignKommentar("");
      startTransition(() => router.refresh());
    } catch {
      rollbackOptimistic();
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setIsReassigning(false);
    }
  }

  // Reassign-Ziele filtern (current owner ausblenden)
  const reassignTargets = (props.besteller_options ?? []).filter(
    (o) => o.kuerzel !== effectiveKuerzel,
  );

  // POOL-State
  if (isUnbekannt) {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-2.5 rounded-md bg-canvas border border-dashed border-line-strong">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <BestellerCell
            besteller_kuerzel={effectiveKuerzel}
            besteller_name={effectiveName}
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
          onClick={handleClaim}
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
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          Übernehmen
        </button>
      </div>
    );
  }

  // CLAIMED-State: nur eigener Owner oder Admin sieht Sekundär-Aktionen
  if (isOwner || isAdmin) {
    const hasReassignTargets = reassignTargets.length > 0;
    return (
      <>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-2.5 rounded-md bg-canvas">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <BestellerCell
              besteller_kuerzel={effectiveKuerzel}
              besteller_name={effectiveName}
              bestellungsart={props.bestellungsart}
              variant="with-name"
            />
            <span className="hidden sm:inline text-[12px] text-foreground-subtle">
              {isOwner ? "Übernommen — du bist dran" : "Zugeordnet"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {hasReassignTargets && (
              <button
                type="button"
                onClick={() => setReassignDialogOpen(true)}
                disabled={isReassigning || isReturning || pending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-line-strong bg-surface text-foreground-muted hover:bg-hover hover:text-foreground text-[13px] min-h-[44px] sm:min-h-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                aria-label="An anderen Besteller übertragen"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                  />
                </svg>
                Übertragen
              </button>
            )}
            <button
              type="button"
              onClick={() => setReturnDialogOpen(true)}
              disabled={isReturning || isReassigning || pending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-line-strong bg-surface text-foreground-muted hover:bg-hover hover:text-foreground text-[13px] min-h-[44px] sm:min-h-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              aria-label="Bestellung zurück in den Pool"
            >
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
              Zurück in Pool
            </button>
          </div>
        </div>

        {/* Return-Confirm: destruktiv, weil andere Besteller sie dann übernehmen können */}
        <ConfirmDialog
          open={returnDialogOpen}
          title="Zurück in den Pool legen?"
          message="Andere Besteller sehen sie wieder als nicht zugeordnet und können sie übernehmen. Bisherige Dokumente und Kommentare bleiben erhalten."
          confirmLabel="Zurücklegen"
          cancelLabel="Abbrechen"
          variant="danger"
          loading={isReturning}
          onConfirm={handleReturn}
          onCancel={() => setReturnDialogOpen(false)}
        />

        {/* Reassign-Modal: User-Liste + optionaler Kommentar */}
        <Modal
          open={reassignDialogOpen}
          onClose={() => {
            if (!isReassigning) setReassignDialogOpen(false);
          }}
          size="sm"
          title="An anderen Besteller übertragen"
          footer={
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setReassignDialogOpen(false)}
                disabled={isReassigning}
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleReassign}
                disabled={!reassignTarget || isReassigning}
                loading={isReassigning}
                autoFocus
              >
                Übertragen
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="pool-reassign-target"
                className="block text-[12px] font-semibold text-foreground-muted mb-1.5"
              >
                Empfänger
              </label>
              <select
                id="pool-reassign-target"
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                disabled={isReassigning}
                className="w-full px-3 py-2 rounded-md border border-line-strong bg-input text-[14px] text-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                <option value="">— Besteller wählen —</option>
                {reassignTargets.map((o) => (
                  <option key={o.kuerzel} value={o.kuerzel}>
                    {o.name} ({o.kuerzel})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="pool-reassign-kommentar"
                className="block text-[12px] font-semibold text-foreground-muted mb-1.5"
              >
                Hinweis (optional)
              </label>
              <textarea
                id="pool-reassign-kommentar"
                value={reassignKommentar}
                onChange={(e) => setReassignKommentar(e.target.value.slice(0, 500))}
                disabled={isReassigning}
                rows={3}
                placeholder="z. B. Bitte du, ich bin im Urlaub."
                className="w-full px-3 py-2 rounded-md border border-line-strong bg-input text-[14px] text-foreground resize-none focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              />
              <p className="mt-1 text-[10px] text-foreground-subtle">
                Wird im Audit-Trail als Begründung gespeichert. Max. 500 Zeichen.
              </p>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  // Sonderfall: Bestellung gehört jemand anderem, kein Eingriff möglich
  return null;
}
