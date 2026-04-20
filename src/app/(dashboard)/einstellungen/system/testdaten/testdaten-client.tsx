"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { IconPlus, IconTrash } from "@/components/ui/icons";

export function TestdatenClient({
  initialHatTestdaten,
}: {
  initialHatTestdaten: boolean;
}) {
  const { toast } = useToast();
  const [hatTestdaten, setHatTestdaten] = useState(initialHatTestdaten);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<"create" | "delete" | null>(null);

  async function run(action: "create" | "delete") {
    setConfirm(null);
    setLoading(true);
    try {
      const res = await fetch("/api/testdaten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setHatTestdaten(action === "create");
      toast.success(
        action === "create" ? "Testdaten angelegt" : "Testdaten gelöscht",
        { description: data.message },
      );
    } catch (err) {
      toast.error("Testdaten-Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Testdaten" },
        ]}
        title="Testdaten"
        description="Befülle das System mit Beispieldaten zum Testen aller Features — oder lösche sie komplett."
      />

      <SectionCard tone="accent" title="Verwendung">
        <div className="space-y-3">
          <Alert tone="warning">
            Testdaten erhalten das Präfix{" "}
            <span className="font-mono-amount font-semibold">TEST-</span>. Sie können jederzeit
            komplett entfernt werden und sind in der Produktion nicht sichtbar.
          </Alert>

          <ul className="space-y-1.5 text-[13px] text-foreground-muted list-disc pl-5">
            <li>Material- &amp; Subunternehmer-Bestellungen in allen Status-Varianten</li>
            <li>Versandstatus mit Tracking-Links</li>
            <li>Projekte, Kunden und unzugeordnete Einträge</li>
            <li>Abgleich-Beispiele inkl. Abweichungen</li>
          </ul>

          <div className="flex gap-2 pt-2">
            {!hatTestdaten ? (
              <Button
                onClick={() => setConfirm("create")}
                loading={loading}
                iconLeft={<IconPlus />}
              >
                Testdaten anlegen
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setConfirm("delete")}
                loading={loading}
                iconLeft={<IconTrash />}
              >
                Alle Testdaten löschen
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "create" ? "Testdaten anlegen?" : "Testdaten löschen?"}
        message={
          confirm === "create"
            ? "Es werden mehrere Bestellungen, Projekte und Kunden mit TEST-Präfix angelegt. Kein Risiko für Produktivdaten."
            : "Alle Einträge mit TEST-Präfix werden unwiderruflich gelöscht."
        }
        confirmLabel={confirm === "create" ? "Anlegen" : "Löschen"}
        variant={confirm === "create" ? "default" : "danger"}
        loading={loading}
        onConfirm={() => confirm && run(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
