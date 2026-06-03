"use client";

/**
 * OwnerStatement — Editorial-Statement-Block für die Detail-Akte (UX-R3).
 *
 * Refactor der alten OwnerLane (Pool Phase 2/3) auf die Drei-Sprachen-
 * Disziplin v2 mit Visual-Weight-Stufen. Drei Render-Pfade:
 *
 *   1. **Pool / Vorschlag** — UNBEKANNT-State. Editorial Hero-Block mit
 *      Brand-Statement-Text "Diese Bestellung wartet im Pool." + Pipeline-
 *      Vorschlag als Eyebrow-ghost + Magnetic-CTA "Übernehmen" als primärer
 *      Akt der Übernahme.
 *   2. **Owned** — claimed-State. Avatar + "{Name} hat diese Bestellung
 *      übernommen." + zwei Ghost-Actions (Übertragen, Zurück in Pool).
 *      Keine Magnetic — der Statement ist informativ, nicht aufrufend.
 *   3. **Auto-Claim 24h-Grace** — sichtbar nur in den ersten 24h nach
 *      Pipeline-Auto-Claim. Hint "Auto-übernommen via {Methode} · {Konfidenz}"
 *      + Quick-Korrektur-Link "Falsch — zurück in Pool" (ohne Kommentar-Modal).
 *
 * SU/Abo / Freigegeben / Gutschrift → rendert null. Diese Cases haben keinen
 * Owner-Workflow (siehe alte OwnerLane-Doku — Logic 1:1 übernommen).
 *
 * Optimistic-UI + Conflict-Resolution + Realtime-Toast-Subscription für
 * fremde Owner-Changes bleibt unverändert aus der alten OwnerLane.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useBestellungPresence } from "@/lib/hooks/use-bestellung-presence";
import { PresenceBanner } from "./presence-banner";

export interface BestellerOption {
  kuerzel: string;
  name: string;
}

export interface OwnerStatementProps {
  bestellungId: string;
  besteller_kuerzel: string;
  besteller_name: string;
  bestellungsart: string | null | undefined;
  status: string;
  vorschlag_kuerzel: string | null;
  vorschlag_konfidenz: number | null;
  zuordnung_methode?: string | null;
  updated_at?: string | null;
  istGutschrift?: boolean | null;
  profil: { kuerzel: string; rolle: string; name: string };
  besteller_options?: BestellerOption[];
}

export function OwnerStatement(props: OwnerStatementProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [optimisticKuerzel, setOptimisticKuerzel] = useState<string | null>(null);
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassignKommentar, setReassignKommentar] = useState<string>("");
  const lastSeenOwnerRef = useRef(props.besteller_kuerzel);

  const presenceViewers = useBestellungPresence({
    bestellungId: props.bestellungId,
    selfKuerzel: props.profil.kuerzel,
    selfName: props.profil.name,
  });

  // Owner-Change-Subscription (übernommen aus alter OwnerLane)
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

  useEffect(() => {
    if (props.besteller_kuerzel !== lastSeenOwnerRef.current) {
      lastSeenOwnerRef.current = props.besteller_kuerzel;
      setOptimisticKuerzel(null);
      setOptimisticName(null);
    }
  }, [props.besteller_kuerzel]);

  const effectiveKuerzel = optimisticKuerzel ?? props.besteller_kuerzel;
  const effectiveName = optimisticName ?? props.besteller_name;

  const art = props.bestellungsart || "material";
  const isMaterial = art === "material";
  const isFreigegeben = props.status === "freigegeben";
  const isUnbekannt = effectiveKuerzel === "UNBEKANNT" || !effectiveKuerzel;
  const isOwner = effectiveKuerzel === props.profil.kuerzel;
  const isAdmin = props.profil.rolle === "admin";

  if (!isMaterial) return null;
  if (isFreigegeben) return null;
  if (props.istGutschrift) return null;

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

  const reassignTargets = (props.besteller_options ?? []).filter(
    (o) => o.kuerzel !== effectiveKuerzel,
  );

  // ─── POOL / Vorschlag (Magnetic-CTA) ──────────────────────────────────
  if (isUnbekannt) {
    return (
      <div className="mt-5 relative rounded-md border border-dashed border-line-strong bg-canvas">
        <div className="industrial-line absolute inset-x-0 top-0" aria-hidden="true" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
          <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
            <BestellerCell
              besteller_kuerzel={effectiveKuerzel}
              besteller_name={effectiveName}
              bestellungsart={props.bestellungsart}
              vorschlag_kuerzel={props.vorschlag_kuerzel}
              vorschlag_konfidenz={props.vorschlag_konfidenz}
              variant="with-name"
            />
            <div className="text-meta text-foreground-muted">
              <span className="font-medium text-foreground">Im Pool</span>
              {props.vorschlag_kuerzel &&
                props.vorschlag_kuerzel !== "UNBEKANNT" && (
                  <>
                    <span className="mx-1.5 text-foreground-faint">·</span>
                    <span>
                      Pipeline schlägt {props.vorschlag_kuerzel} vor
                      {typeof props.vorschlag_konfidenz === "number" && (
                        <span className="ml-1 font-mono-amount">
                          ({Math.round(props.vorschlag_konfidenz * 100)} %)
                        </span>
                      )}
                    </span>
                  </>
                )}
            </div>
            <PresenceBanner viewers={presenceViewers} />
          </div>
          <button
            type="button"
            onClick={handleClaim}
            disabled={isClaiming || pending}
            className={cn(
              "btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md",
              "text-body-sm min-h-[44px] sm:min-h-0",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            )}
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
      </div>
    );
  }

  // ─── Auto-Claim Detection ─────────────────────────────────────────────
  const isAutoClaim =
    typeof props.zuordnung_methode === "string" &&
    props.zuordnung_methode.startsWith("auto_high_confidence:");
  const originalMethode = isAutoClaim
    ? (props.zuordnung_methode as string).slice("auto_high_confidence:".length)
    : null;
  const updatedAtTs = props.updated_at ? new Date(props.updated_at).getTime() : 0;
  const graceActive =
    isAutoClaim && updatedAtTs > 0 && Date.now() - updatedAtTs < 24 * 60 * 60 * 1000;

  async function handleAutoClaimCorrect() {
    setIsReturning(true);
    setOptimisticKuerzel("UNBEKANNT");
    setOptimisticName("UNBEKANNT");
    try {
      const { ok, json } = await postPoolAction("pool-return");
      if (!ok || json?.success !== true) {
        rollbackOptimistic();
        toast.warning(
          typeof json?.message === "string" ? json.message : "Korrektur fehlgeschlagen.",
        );
        return;
      }
      toast.success("Auto-Übernahme korrigiert", {
        description: "Zurück in den Pool, andere können sie übernehmen.",
      });
      startTransition(() => router.refresh());
    } catch {
      rollbackOptimistic();
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setIsReturning(false);
    }
  }

  // ─── Owned (claimed) ──────────────────────────────────────────────────
  if (isOwner || isAdmin) {
    const hasReassignTargets = reassignTargets.length > 0;
    return (
      <>
        {/* Auto-Claim-Grace-Banner (Stufe 3, subtle): 24h-Korrekturfenster
            mit Quick-Action ohne Kommentar-Modal. */}
        {graceActive && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-md border border-line-strong bg-canvas text-meta">
            <span className="text-foreground-muted">
              <span className="font-medium text-foreground">Auto-übernommen</span>
              {originalMethode && (
                <>
                  {" "}
                  <span className="text-foreground-subtle">via {originalMethode}</span>
                </>
              )}
              {typeof props.vorschlag_konfidenz === "number" && (
                <span className="ml-1 font-mono-amount text-foreground-subtle">
                  · {Math.round(props.vorschlag_konfidenz * 100)} %
                </span>
              )}
              <span className="ml-2 text-foreground-faint">
                — 24h-Korrekturfenster aktiv
              </span>
            </span>
            <button
              type="button"
              onClick={handleAutoClaimCorrect}
              disabled={isReturning || pending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-surface hover:bg-input transition-colors text-foreground disabled:opacity-50"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M4 8h8M8 4l-4 4 4 4" />
              </svg>
              Falsch — zurück in Pool
            </button>
          </div>
        )}

        {/* Owned-Statement: editorial Block mit Avatar + Statement-Text +
            zwei Ghost-Actions. Keine Magnetic — der Statement ist
            informativ, nicht aufrufend. */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md bg-canvas">
          <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
            <BestellerCell
              besteller_kuerzel={effectiveKuerzel}
              besteller_name={effectiveName}
              bestellungsart={props.bestellungsart}
              isAutoClaimed={isAutoClaim}
              variant="with-name"
            />
            <span className="text-meta text-foreground-muted">
              {isAutoClaim
                ? "Auto-übernommen"
                : isOwner
                  ? "hat diese Bestellung übernommen."
                  : "ist zugeordnet."}
            </span>
            <PresenceBanner viewers={presenceViewers} />
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {hasReassignTargets && (
              <button
                type="button"
                onClick={() => setReassignDialogOpen(true)}
                disabled={isReassigning || isReturning || pending}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md",
                  "border border-line bg-transparent text-foreground-muted",
                  "hover:bg-input hover:text-foreground hover:border-line-strong",
                  "text-meta min-h-[44px] sm:min-h-0 transition-colors",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                )}
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
              className={cn(
                "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md",
                "border border-line bg-transparent text-foreground-muted",
                "hover:bg-input hover:text-foreground hover:border-line-strong",
                "text-meta min-h-[44px] sm:min-h-0 transition-colors",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
              )}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 14L4 9m0 0l5-5M4 9h11a5 5 0 010 10h-4"
                />
              </svg>
              Zurück in Pool
            </button>
          </div>
        </div>

        <Modal
          open={returnDialogOpen}
          onClose={() => {
            if (!isReturning) setReturnDialogOpen(false);
          }}
          size="sm"
          title="Zurück in den Pool legen?"
          variant="destructive"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setReturnDialogOpen(false)}
                disabled={isReturning}
              >
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={handleReturn}
                loading={isReturning}
              >
                Zurücklegen
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-foreground-muted">
            Andere Besteller sehen sie wieder als nicht zugeordnet und können sie übernehmen. Bisherige Dokumente und Kommentare bleiben erhalten.
          </p>
        </Modal>

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
                className="block text-meta font-semibold text-foreground-muted mb-1.5"
              >
                Empfänger
              </label>
              <select
                id="pool-reassign-target"
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                disabled={isReassigning}
                className="w-full px-3 py-2 rounded-md border border-line-strong bg-input text-body-sm text-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
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
                className="block text-meta font-semibold text-foreground-muted mb-1.5"
              >
                Hinweis (optional)
              </label>
              <textarea
                id="pool-reassign-kommentar"
                value={reassignKommentar}
                onChange={(e) =>
                  setReassignKommentar(e.target.value.slice(0, 500))
                }
                disabled={isReassigning}
                rows={3}
                placeholder="z. B. Bitte du, ich bin im Urlaub."
                className="w-full px-3 py-2 rounded-md border border-line-strong bg-input text-body-sm text-foreground resize-none focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              />
              <p className="mt-1 text-eyebrow text-foreground-subtle">
                Wird im Audit-Trail als Begründung gespeichert. Max. 500 Zeichen.
              </p>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return null;
}
