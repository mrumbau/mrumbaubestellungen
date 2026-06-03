"use client";

import { useMemo, useState } from "react";
import type { BenutzerProfil } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/hooks/use-is-desktop";
import { useBestelldetail } from "./use-bestelldetail";
import { DocumentPanel } from "./document-panel";
import { SidebarMetadata } from "./sidebar-metadata";
import { KiVorschlagBanner } from "./ki-vorschlag-banner";
import { AiToolsPanel } from "./ai-tools-panel";
import { Timeline } from "./timeline";
import { CommentsThread } from "./comments-thread";
import { ApprovalPanel } from "./approval-panel";
import type {
  Abgleich,
  AuditEvent,
  Bestellung,
  Dokument,
  Freigabe,
  Kommentar,
  ProjektOption,
  SubunternehmerInfo,
  WidgetId,
} from "./types";
import { DOKUMENT_CONFIG } from "@/lib/bestellung-utils";

/**
 * BestelldetailShell — thin orchestrator replacing the 1.729-LOC monolith.
 *
 * Responsibilities:
 *   1. Own `openWidgetId` (sidebar accordion controller) + `activeTab` (doc tab)
 *   2. Own `mobileSection` (mobile 3-tab layout switch)
 *   3. Route handlers from `useBestelldetail()` hook into sub-components
 *   4. Render layout (desktop 2-col, mobile tab-based) + confirm dialogs +
 *      global action-error banner + mobile Freigabe bottom bar
 *
 * Zero business logic lives here — all API calls are in the hook, all UI in
 * the 8 sub-components. This file reads top-to-bottom as a tree of composition.
 */
export function BestelldetailShell({
  bestellung,
  dokumente,
  abgleich,
  kommentare,
  freigabe,
  events,
  profil,
  projekte,
  subunternehmer,
}: {
  bestellung: Bestellung;
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  kommentare: Kommentar[];
  freigabe: Freigabe | null;
  events?: AuditEvent[];
  profil: BenutzerProfil;
  projekte: ProjektOption[];
  subunternehmer?: SubunternehmerInfo;
}) {
  const bd = useBestelldetail({
    bestellungId: bestellung.id,
    initialBestellungsart: bestellung.bestellungsart,
    initialProjektId: bestellung.projekt_id,
    initialFreigabe: freigabe,
    bestellerName: profil.name,
    bestellerKuerzel: profil.kuerzel,
  });

  const dokTabs = DOKUMENT_CONFIG[bestellung.bestellungsart || "material"];
  // 02.06.2026 (UX-Polish) — Smart-Default: erste Tab mit vorhandenem Dokument
  // statt fester "bestellbestaetigung". User sieht beim Öffnen sofort das
  // Wichtigste (z.B. Rechnung bei Gutschrift), nicht einen leeren Tab.
  // Fallback: ersten Tab aus der Config falls noch nichts da.
  const smartInitialTab = useMemo(() => {
    const firstWithDok = dokTabs.find((tab) =>
      dokumente.some((d) => d.typ === tab.typ),
    );
    return firstWithDok?.typ ?? dokTabs[0]?.typ ?? "bestellbestaetigung";
  }, [dokTabs, dokumente]);
  const [activeTab, setActiveTab] = useState<string>(smartInitialTab);
  const [mobileSection, setMobileSection] = useState<"dokumente" | "details" | "aktionen">(
    "dokumente",
  );

  // 22.05.2026 (Perf Stufe 2.7) — Tailwind hidden/md:hidden mountete vorher
  // BEIDE Layout-Subtrees (Desktop + Mobile) gleichzeitig. Folge: DocumentPanel
  // 2× im DOM → 2× iframe-Mount → 2× PDF-Roundtrip pro Detail-Open. Der naive
  // loading="lazy"-Versuch (siehe document-panel.tsx) verhinderte den Doppel-
  // Fetch nicht zuverlässig (Chrome lädt lazy iframes in display:none-Parents
  // bei initialer Navigation trotzdem). Jetzt: useIsDesktop entscheidet,
  // welcher Subtree überhaupt gemountet wird → echter Single-Mount.
  const isDesktop = useIsDesktop();

  // Shared accordion-open-state — opening one widget closes the others.
  // Domain-Doku: erlaubte WidgetIds in `types.ts` (`WidgetId`-Union),
  // aber das State-Typing bleibt `string` damit CollapsibleWidget-Variance passt.
  const [openWidgetId, setOpenWidgetId] = useState<string | null>(null);
  const toggleWidget = (id: string) =>
    setOpenWidgetId((prev) => (prev === id ? null : id));

  const hatRechnung = bestellung.hat_rechnung;
  const istSuOderAbo =
    bestellung.bestellungsart === "subunternehmer" ||
    bestellung.bestellungsart === "abo";
  const kannFreigeben =
    !freigabe &&
    bestellung.status !== "freigegeben" &&
    (profil.rolle === "admin" ||
      profil.kuerzel === bestellung.besteller_kuerzel ||
      istSuOderAbo);

  return (
    <>
      {bd.actionError && (
        <Alert tone="error" className="mb-3" onDismiss={() => bd.setActionError(null)}>
          {bd.actionError}
        </Alert>
      )}

      {/* Mobile section tabs — nur auf Mobile sichtbar (md:hidden) */}
      {!isDesktop && (
        <MobileSectionTabs active={mobileSection} onChange={setMobileSection} />
      )}

      {/* Desktop layout — 2-column split. Conditional-render: kein Doppel-Mount mit Mobile. */}
      {isDesktop && (
      <div className="flex flex-row gap-5 flex-1 min-h-0">
        <DocumentPanel
          bestellung={bestellung}
          dokumente={dokumente}
          scanLoading={bd.scanLoading}
          scanError={bd.scanError}
          fileSizeError={bd.fileSizeError}
          onClearScanError={() => {
            bd.setScanError(null);
            bd.setFileSizeError(null);
          }}
          fileInputRef={bd.fileInputRef}
          cameraInputRef={bd.cameraInputRef}
          onFileSelected={bd.handleScan}
          onZipDownload={bd.handleZipDownload}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="w-80 flex flex-col gap-4 overflow-auto">
          <ApprovalPanel
            bestellung={bestellung}
            freigabe={bd.optimisticFreigabe ?? freigabe}
            profil={profil}
            kannFreigeben={kannFreigeben}
            hatRechnung={hatRechnung}
            loading={bd.loading}
            verwerfenLoading={bd.verwerfenLoading}
            freigabeError={bd.freigabeError}
            onOpenFreigabeDialog={() => bd.setShowFreigabeDialog(true)}
            onOpenVerwerfenDialog={() => bd.setShowVerwerfenDialog(true)}
            onMahnungQuittieren={bd.handleMahnungQuittieren}
          />

          <SidebarMetadata
            bestellung={bestellung}
            projekte={projekte}
            profil={profil}
            subunternehmer={subunternehmer}
            aktuelleArt={bd.aktuelleArt}
            bestellungsartLoading={bd.bestellungsartLoading}
            projektLoading={bd.projektLoading}
            projektStats={bd.projektStats}
            onBestellungsartChange={bd.handleBestellungsartChange}
            onProjektZuordnen={bd.handleProjektZuordnen}
          />

          <KiVorschlagBanner
            bestellung={bestellung}
            projekte={projekte}
            loading={bd.vorschlagLoading}
            onVorschlagAktion={bd.handleVorschlagAktion}
          />

          <Timeline
            dokumente={dokumente}
            abgleich={abgleich}
            freigabe={freigabe}
            kommentare={kommentare}
            events={events}
            widgetId="timeline"
            openWidgetId={openWidgetId}
            onToggleWidget={toggleWidget}
          />

          <AiToolsPanel
            abgleich={abgleich}
            bestellung={bestellung}
            openWidgetId={openWidgetId}
            onToggleWidget={toggleWidget}
            kiZusammenfassung={bd.kiZusammenfassung}
            kiLoading={bd.kiLoading}
            onKiZusammenfassung={bd.handleKiZusammenfassung}
            duplikatResult={bd.duplikatResult}
            duplikatLoading={bd.duplikatLoading}
            onDuplikatCheck={bd.handleDuplikatCheck}
            katResult={bd.katResult}
            katLoading={bd.katLoading}
            onKategorisierung={bd.handleKategorisierung}
          />

          <CommentsThread
            kommentare={kommentare}
            loading={bd.loading}
            onSubmit={bd.handleKommentar}
            widgetId="kommentare"
            openWidgetId={openWidgetId}
            onToggleWidget={toggleWidget}
          />
        </div>
      </div>
      )}

      {/* Mobile layout — conditional gegen Doppel-Mount mit Desktop. */}
      {!isDesktop && (
      <div className="flex flex-col flex-1 min-h-0">
        {mobileSection === "dokumente" && (
          <DocumentPanel
            bestellung={bestellung}
            dokumente={dokumente}
            scanLoading={bd.scanLoading}
            scanError={bd.scanError}
            fileSizeError={bd.fileSizeError}
            onClearScanError={() => {
              bd.setScanError(null);
              bd.setFileSizeError(null);
            }}
            fileInputRef={bd.fileInputRef}
            cameraInputRef={bd.cameraInputRef}
            onFileSelected={bd.handleScan}
            onZipDownload={bd.handleZipDownload}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
        {mobileSection === "details" && (
          <div className="flex flex-col gap-4 overflow-auto pb-20">
            <KiVorschlagBanner
              bestellung={bestellung}
              projekte={projekte}
              loading={bd.vorschlagLoading}
              onVorschlagAktion={bd.handleVorschlagAktion}
              compact
            />
            <SidebarMetadata
              bestellung={bestellung}
              projekte={projekte}
              profil={profil}
              subunternehmer={subunternehmer}
              aktuelleArt={bd.aktuelleArt}
              bestellungsartLoading={bd.bestellungsartLoading}
              projektLoading={bd.projektLoading}
              projektStats={bd.projektStats}
              onBestellungsartChange={bd.handleBestellungsartChange}
              onProjektZuordnen={bd.handleProjektZuordnen}
            />
            <AiToolsPanel
              abgleich={abgleich}
              bestellung={bestellung}
              openWidgetId={openWidgetId}
              onToggleWidget={toggleWidget}
              kiZusammenfassung={bd.kiZusammenfassung}
              kiLoading={bd.kiLoading}
              onKiZusammenfassung={bd.handleKiZusammenfassung}
              duplikatResult={bd.duplikatResult}
              duplikatLoading={bd.duplikatLoading}
              onDuplikatCheck={bd.handleDuplikatCheck}
              katResult={bd.katResult}
              katLoading={bd.katLoading}
              onKategorisierung={bd.handleKategorisierung}
            />
            <Timeline
              dokumente={dokumente}
              abgleich={abgleich}
              freigabe={freigabe}
              kommentare={kommentare}
              events={events}
              widgetId="m-timeline"
              openWidgetId={openWidgetId}
              onToggleWidget={toggleWidget}
            />
            {kommentare.length > 0 && (
              <CommentsThread
                kommentare={kommentare}
                loading={bd.loading}
                onSubmit={bd.handleKommentar}
                widgetId="m-kommentare"
                openWidgetId={openWidgetId}
                onToggleWidget={toggleWidget}
              />
            )}
          </div>
        )}
        {mobileSection === "aktionen" && (
          <div className="flex flex-col gap-4 overflow-auto pb-20">
            <ApprovalPanel
              bestellung={bestellung}
              freigabe={bd.optimisticFreigabe ?? freigabe}
              profil={profil}
              kannFreigeben={kannFreigeben}
              hatRechnung={hatRechnung}
              loading={bd.loading}
              verwerfenLoading={bd.verwerfenLoading}
              freigabeError={bd.freigabeError}
              onOpenFreigabeDialog={() => bd.setShowFreigabeDialog(true)}
              onOpenVerwerfenDialog={() => bd.setShowVerwerfenDialog(true)}
              onMahnungQuittieren={bd.handleMahnungQuittieren}
              variant="mobile"
            />
            <CommentsThread
              kommentare={kommentare}
              loading={bd.loading}
              onSubmit={bd.handleKommentar}
              widgetId="m-kommentare"
              mode="always-open"
            />
          </div>
        )}
      </div>
      )}

      {/* Mobile fixed bottom bar — nur auf Mobile */}
      {!isDesktop && (
        <ApprovalPanel
          bestellung={bestellung}
          freigabe={bd.optimisticFreigabe ?? freigabe}
          profil={profil}
          kannFreigeben={kannFreigeben}
          hatRechnung={hatRechnung}
          loading={bd.loading}
          verwerfenLoading={bd.verwerfenLoading}
          freigabeError={bd.freigabeError}
          onOpenFreigabeDialog={() => bd.setShowFreigabeDialog(true)}
          onOpenVerwerfenDialog={() => bd.setShowVerwerfenDialog(true)}
          onMahnungQuittieren={bd.handleMahnungQuittieren}
          variant="mobile-bar"
        />
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={bd.showFreigabeDialog}
        title="Rechnung freigeben"
        message="Soll diese Rechnung wirklich freigegeben werden? Sie wird danach für die Buchhaltung sichtbar."
        confirmLabel="Freigeben"
        loading={bd.loading}
        onConfirm={bd.handleFreigabe}
        onCancel={() => bd.setShowFreigabeDialog(false)}
      />
      <ConfirmDialog
        open={bd.showVerwerfenDialog}
        title="Bestellung verwerfen?"
        message="Die Bestellung wird komplett aus dem System entfernt — mit allen Belegen, Mahnungen und Kommentaren. Das kann nicht rückgängig gemacht werden."
        confirmLabel="Verwerfen"
        variant="danger"
        loading={bd.verwerfenLoading}
        onConfirm={bd.handleVerwerfen}
        onCancel={() => bd.setShowVerwerfenDialog(false)}
      />
    </>
  );
}

function MobileSectionTabs({
  active,
  onChange,
}: {
  active: "dokumente" | "details" | "aktionen";
  onChange: (t: "dokumente" | "details" | "aktionen") => void;
}) {
  const tabs: { key: "dokumente" | "details" | "aktionen"; label: string }[] = [
    { key: "dokumente", label: "Dokumente" },
    { key: "details", label: "Details" },
    { key: "aktionen", label: "Aktionen" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Ansicht umschalten"
      className="md:hidden flex border-b border-line mb-4 -mx-4 px-4"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            // 12.05.2026 (UI-Audit F1.12): min-h-[44px] für WCAG-Touch-Target.
            "flex-1 flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] text-[12px] font-medium relative transition-colors",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
            active === tab.key ? "text-brand" : "text-foreground-muted",
          )}
        >
          {tab.label}
          {active === tab.key && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand"
            />
          )}
        </button>
      ))}
    </div>
  );
}
