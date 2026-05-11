/**
 * OrdersTab — Tabellen-Liste mit Monats-Gruppen für Material/SU.
 * Aus archiv-client.tsx extrahiert (11.05.2026).
 */

import { useMemo } from "react";
import { formatBetrag } from "@/lib/formatters";
import { DOKUMENT_CONFIG } from "@/lib/bestellung-utils";
import { groupByMonth } from "@/lib/archiv-utils";
import { ArchivEmptyState } from "./archiv-empty-state";
import { OrderRow } from "./order-row";
import type { Dokument, PaidBestellung } from "./types";

export interface OrdersTabProps {
  orders: PaidBestellung[];
  dokumenteMap: Record<string, Dokument[]>;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  type: "material" | "subunternehmer";
  limitReached: boolean;
  istAdmin: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  toggleSelect?: (id: string) => void;
  toggleGroupItems?: (ids: string[]) => void;
}

export function OrdersTab({
  orders,
  dokumenteMap,
  expandedIds,
  toggleExpand,
  type,
  limitReached,
  istAdmin,
  selectionMode = false,
  selectedIds = new Set(),
  toggleSelect,
  toggleGroupItems,
}: OrdersTabProps) {
  const monthGroups = useMemo(() => groupByMonth(orders, "bezahlt_am"), [orders]);
  const dokConfig = DOKUMENT_CONFIG[type];

  if (orders.length === 0) return <ArchivEmptyState type={type} />;

  return (
    <div className="space-y-6">
      {monthGroups.map((group) => (
        <div key={group.key}>
          {/* Month header — clean separator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-headline text-sm text-foreground-muted">{group.label}</h3>
              <span className="text-[10px] text-foreground-faint">{group.items.length} Einträge</span>
            </div>
            <span className="font-mono-amount text-sm font-semibold text-foreground">
              {formatBetrag(group.subtotal)}
            </span>
          </div>

          {/* Table — consistent with Buchhaltung */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-input border-b border-line">
                  {selectionMode && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Alle Einträge dieser Gruppe auswählen"
                        checked={
                          group.items.length > 0 &&
                          group.items.every((o) => selectedIds.has(o.id))
                        }
                        onChange={() => {
                          // F3.12: Single setState statt O(n) Render-Storm
                          toggleGroupItems?.(group.items.map((o) => o.id));
                        }}
                        className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
                    Bestellnr.
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
                    {type === "subunternehmer" ? "Firma" : "Händler"}
                  </th>
                  {istAdmin && (
                    <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden lg:table-cell">
                      Besteller
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden md:table-cell">
                    Projekt
                  </th>
                  {dokConfig.map((dok) => (
                    <th
                      key={dok.flag}
                      className="px-3 py-3 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden sm:table-cell"
                    >
                      {dok.kurzLabel}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
                    Betrag
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
                    Bezahlt am
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((order, i) => {
                  const isExpanded = expandedIds.has(order.id);
                  const docs = dokumenteMap[order.id] || [];
                  return (
                    <OrderRow
                      key={order.id}
                      order={order}
                      docs={docs}
                      dokConfig={dokConfig}
                      isExpanded={isExpanded}
                      toggleExpand={toggleExpand}
                      type={type}
                      istAdmin={istAdmin}
                      isOdd={i % 2 === 1}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(order.id)}
                      toggleSelect={toggleSelect}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Limit hint */}
      {limitReached && (
        <p className="text-foreground-subtle text-sm text-center py-4">
          Maximal 100 Einträge geladen. Ältere Einträge über die Suche finden.
        </p>
      )}

      {/* Sum footer */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-subtle">{orders.length} archiviert</span>
        <span className="font-mono-amount font-semibold text-foreground">
          Summe:{" "}
          {formatBetrag(orders.reduce((sum, o) => sum + (Number(o.betrag) || 0), 0))}
        </span>
      </div>
    </div>
  );
}
