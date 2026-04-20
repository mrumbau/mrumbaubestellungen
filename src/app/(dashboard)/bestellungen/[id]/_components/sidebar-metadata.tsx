"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { BESTELLUNGSART_LABELS, type Bestellungsart } from "@/lib/bestellung-utils";
import { IconX, IconSearch, IconTool, IconArrowRight } from "@/components/ui/icons";
import { VersandIcon } from "./dokument-icons";
import type { Bestellung, ProjektOption, ProjektStats, SubunternehmerInfo } from "./types";
import type { BenutzerProfil } from "@/lib/auth";

/**
 * Sidebar-Metadata — the top half of the right column on desktop.
 *
 * Groups three small cards:
 *  - Bestellungsart (editable select for owner + admin)
 *  - Projekt-Zuordnung with inline Combobox + budget progress bar
 *  - Subunternehmer-Info (only when art="subunternehmer")
 *  - Versand-Info (only for material orders with versandbestätigung)
 *
 * The project combobox keeps using a lightweight text-input + scrollable list
 * pattern; DataTable/Combobox primitives come in P3.
 */
export function SidebarMetadata({
  bestellung,
  projekte,
  profil,
  subunternehmer,
  aktuelleArt,
  bestellungsartLoading,
  projektLoading,
  projektStats,
  onBestellungsartChange,
  onProjektZuordnen,
}: {
  bestellung: Bestellung;
  projekte: ProjektOption[];
  profil: BenutzerProfil;
  subunternehmer?: SubunternehmerInfo;
  aktuelleArt: Bestellungsart;
  bestellungsartLoading: boolean;
  projektLoading: boolean;
  projektStats: ProjektStats | null;
  onBestellungsartChange: (neu: Bestellungsart) => void;
  onProjektZuordnen: (projektId: string | null) => void;
}) {
  const [showProjektSelect, setShowProjektSelect] = useState(false);
  const [projektSuche, setProjektSuche] = useState("");
  const canEdit =
    profil.rolle === "admin" || profil.kuerzel === bestellung.besteller_kuerzel;

  const filteredProjekte = useMemo(() => {
    if (!projektSuche.trim()) return projekte;
    const q = projektSuche.toLowerCase();
    return projekte.filter((p) => p.name.toLowerCase().includes(q));
  }, [projekte, projektSuche]);

  const aktuellesProjekt = bestellung.projekt_id
    ? projekte.find((p) => p.id === bestellung.projekt_id)
    : undefined;

  return (
    <>
      {/* Bestellungsart + Projekt combined card */}
      <Card padding="md" className="space-y-3">
        {/* Bestellungsart */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
            Art
          </span>
          {canEdit ? (
            <Select
              value={aktuelleArt}
              onChange={(e) =>
                onBestellungsartChange(e.target.value as Bestellungsart)
              }
              disabled={bestellungsartLoading}
              selectSize="sm"
              className="w-auto"
            >
              <option value="material">Material</option>
              <option value="subunternehmer">Subunternehmer</option>
              <option value="abo">Abo / Vertrag</option>
            </Select>
          ) : (
            <Badge tone={aktuelleArt === "subunternehmer" ? "info" : "neutral"} size="md">
              {BESTELLUNGSART_LABELS[aktuelleArt]}
            </Badge>
          )}
        </div>
        {bestellungsartLoading && (
          <div className="flex items-center gap-1.5 text-[10px] text-foreground-subtle">
            <Spinner size={10} tone="muted" />
            Status wird neu berechnet…
          </div>
        )}

        <div className="h-px bg-line-subtle" />

        {/* Projekt */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
            Projekt
          </span>
          {bestellung.projekt_name ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: aktuellesProjekt?.farbe || "var(--mr-red)" }}
                />
                {bestellung.projekt_name}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onProjektZuordnen(null)}
                  disabled={projektLoading}
                  aria-label="Projekt-Zuordnung entfernen"
                  className={cn(
                    "p-0.5 text-foreground-subtle hover:text-error transition-colors rounded",
                    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                  )}
                >
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : showProjektSelect ? (
            <div className="flex-1 ml-3">
              <Input
                value={projektSuche}
                onChange={(e) => setProjektSuche(e.target.value)}
                placeholder="Projekt suchen…"
                autoFocus
                inputSize="sm"
                iconLeft={<IconSearch />}
              />
              <div className="max-h-32 overflow-auto space-y-0.5 mt-1">
                {filteredProjekte.length === 0 ? (
                  <p className="text-[10px] text-foreground-subtle py-1 text-center">
                    Nicht gefunden
                  </p>
                ) : (
                  filteredProjekte.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onProjektZuordnen(p.id);
                        setShowProjektSelect(false);
                        setProjektSuche("");
                      }}
                      disabled={projektLoading}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-left rounded",
                        "hover:bg-surface-hover transition-colors disabled:opacity-50",
                        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: p.farbe }}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProjektSelect(false);
                  setProjektSuche("");
                }}
                className="text-[10px] text-foreground-subtle hover:text-foreground-muted mt-1 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => setShowProjektSelect(true)}
              className={cn(
                "text-[11px] font-semibold text-brand hover:text-brand-light transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1",
              )}
            >
              Zuordnen
            </button>
          ) : (
            <span className="text-[11px] text-foreground-subtle">–</span>
          )}
        </div>

        {/* Budget-Progress */}
        {bestellung.projekt_name &&
          projektStats?.budget != null &&
          projektStats.budget_auslastung_prozent != null && (
            <BudgetBar
              ausgaben={projektStats.gesamt_ausgaben}
              budget={projektStats.budget}
              prozent={projektStats.budget_auslastung_prozent}
            />
          )}
      </Card>

      {/* Subunternehmer info */}
      {aktuelleArt === "subunternehmer" && subunternehmer && (
        <Card padding="md" className="border-l-[3px] border-l-info">
          <div className="flex items-center gap-2 mb-2">
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-info-bg text-info [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <IconTool />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-info">
              Subunternehmer
            </span>
          </div>
          <p className="text-[13px] font-medium text-foreground">{subunternehmer.firma}</p>
          {subunternehmer.gewerk && (
            <Badge tone="info" size="sm" className="mt-1">
              {subunternehmer.gewerk}
            </Badge>
          )}
          {subunternehmer.ansprechpartner && (
            <p className="text-[11px] text-foreground-muted mt-1.5">
              {subunternehmer.ansprechpartner}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {subunternehmer.telefon && (
              <p className="text-[11px] text-foreground-subtle font-mono-amount">
                {subunternehmer.telefon}
              </p>
            )}
            {subunternehmer.email && (
              <p className="text-[11px] text-foreground-subtle font-mono-amount">
                {subunternehmer.email}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Versand info */}
      {aktuelleArt === "material" && bestellung.hat_versandbestaetigung && (
        <Card padding="md" className="border-l-[3px] border-l-foreground-muted">
          <div className="flex items-center gap-2 mb-2">
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-canvas text-foreground-muted [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <VersandIcon />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              Versand
            </span>
          </div>
          {bestellung.versanddienstleister && (
            <p className="text-[13px] font-medium text-foreground">
              {bestellung.versanddienstleister}
            </p>
          )}
          {bestellung.tracking_nummer && (
            <p className="text-[12px] text-foreground-muted font-mono-amount mt-1">
              {bestellung.tracking_nummer}
            </p>
          )}
          {bestellung.tracking_url && (
            <a
              href={bestellung.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 text-[12px] text-brand hover:underline mt-2",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded",
              )}
            >
              Sendung verfolgen
              <IconArrowRight className="h-3 w-3" />
            </a>
          )}
          {bestellung.voraussichtliche_lieferung && (
            <p className="text-[10px] text-foreground-subtle mt-1.5">
              Voraussichtlich:{" "}
              {new Date(bestellung.voraussichtliche_lieferung).toLocaleDateString("de-DE")}
            </p>
          )}
        </Card>
      )}
    </>
  );
}

function BudgetBar({
  ausgaben,
  budget,
  prozent,
}: {
  ausgaben: number;
  budget: number;
  prozent: number;
}) {
  const barTone =
    prozent >= 90 ? "bg-error" : prozent >= 70 ? "bg-warning" : "bg-status-freigegeben";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-foreground-subtle">Budget</span>
        <span className="font-mono-amount font-medium text-foreground-muted">
          {ausgaben.toLocaleString("de-DE", { minimumFractionDigits: 2 })} /{" "}
          {budget.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
        </span>
      </div>
      <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barTone)}
          style={{ width: `${Math.min(prozent, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-foreground-subtle mt-0.5 font-mono-amount">
        {prozent.toFixed(0)}% ausgelastet
      </p>
    </div>
  );
}
