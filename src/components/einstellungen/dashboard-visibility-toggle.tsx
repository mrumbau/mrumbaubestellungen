"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/**
 * Settings-Toggle für Dashboard ein/aus.
 * 22.05.2026 — User-Wunsch: MT/CR brauchen Dashboard nicht (Workflow läuft
 * über /bestellungen + /todo). Default-OFF wird in lib/auth.computeDashboardEnabled
 * gesetzt. Hier kann jeder User es manuell umschalten.
 *
 * Nach erfolgreichem Toggle: API invalidiert das Profil-Cookie → wir machen
 * router.refresh() damit die Server-Components das neue Profil laden und die
 * Sidebar den Dashboard-Eintrag ein-/ausblendet.
 */
export function DashboardVisibilityToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleToggle(next: boolean) {
    if (loading) return;
    setLoading(true);
    // Optimistic toggle
    setEnabled(next);
    try {
      const res = await fetch("/api/dashboard/visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        // Rollback
        setEnabled(!next);
        toast.error("Speichern fehlgeschlagen");
        return;
      }
      toast.success(next ? "Dashboard aktiviert" : "Dashboard deaktiviert");
      // Server-Component + Sidebar müssen das frische Profil laden
      router.refresh();
    } catch {
      setEnabled(!next);
      toast.error("Netzwerkfehler beim Speichern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="md" className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-headline text-[14px] tracking-tight text-foreground">Dashboard</span>
        <p className="text-[12px] text-foreground-muted leading-relaxed">
          Zeigt KPIs, Volumen-Übersicht und Mahnungen. Wenn deaktiviert: Sidebar-Eintrag
          ausgeblendet, Login leitet direkt auf Bestellungen. Aufgaben-Widgets (Neue
          Händler, Nicht zugeordnet, …) bleiben unabhängig davon auf <strong>/todo</strong>{" "}
          erreichbar.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={loading}
        onClick={() => handleToggle(!enabled)}
        className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] ${
          enabled ? "bg-brand" : "bg-line-strong"
        } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </Card>
  );
}
