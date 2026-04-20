"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { IconUsers } from "@/components/ui/icons";

export type Benutzer = {
  id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: string;
};

const ROLLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  buchhaltung: "Buchhaltung",
  besteller: "Besteller",
};

export function BenutzerClient({ benutzer }: { benutzer: Benutzer[] }) {
  const admins = benutzer.filter((b) => b.rolle === "admin");
  const buchhaltung = benutzer.filter((b) => b.rolle === "buchhaltung");
  const besteller = benutzer.filter((b) => b.rolle === "besteller");
  const sonstige = benutzer.filter(
    (b) => !["admin", "buchhaltung", "besteller"].includes(b.rolle),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Einstellungen", href: "/einstellungen" },
          { label: "System", href: "/einstellungen/system" },
          { label: "Benutzer" },
        ]}
        title="Benutzer & Rollen"
        description="Übersicht aller registrierten Benutzer mit ihrer Rollenzuweisung."
        meta={
          <>
            <span className="text-[12px] text-foreground-subtle font-mono-amount">
              {benutzer.length} Benutzer
            </span>
            <span className="text-[12px] text-foreground-subtle">·</span>
            <span className="text-[12px] text-foreground-subtle">
              {admins.length} Admin · {buchhaltung.length} Buchhaltung · {besteller.length} Besteller
            </span>
          </>
        }
      />

      <Alert tone="info" title="Nur lesender Zugriff">
        Benutzer anlegen, deaktivieren und Rollen ändern erfolgt derzeit direkt in Supabase Auth.
        Eine echte Verwaltungsoberfläche (Einladung, Rollen-Switch, Deaktivierung) ist für eine
        spätere Phase geplant.
      </Alert>

      {benutzer.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-5 w-5" />}
          title="Keine Benutzer gefunden"
          description="Benutzer werden über Supabase Auth angelegt und in die Tabelle benutzer_rollen gespiegelt."
        />
      ) : (
        <>
          {admins.length > 0 && (
            <Gruppe title="Administratoren" rolle="admin" benutzer={admins} />
          )}
          {buchhaltung.length > 0 && (
            <Gruppe title="Buchhaltung" rolle="buchhaltung" benutzer={buchhaltung} />
          )}
          {besteller.length > 0 && (
            <Gruppe title="Besteller" rolle="besteller" benutzer={besteller} />
          )}
          {sonstige.length > 0 && (
            <Gruppe title="Sonstige" rolle="unbekannt" benutzer={sonstige} />
          )}
        </>
      )}
    </div>
  );
}

function Gruppe({
  title,
  rolle,
  benutzer,
}: {
  title: string;
  rolle: string;
  benutzer: Benutzer[];
}) {
  return (
    <SectionCard
      title={`${title} (${benutzer.length})`}
      padding="none"
      headerBorder
    >
      <ul className="divide-y divide-line-subtle">
        {benutzer.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white font-semibold text-[11px] font-mono-amount"
              >
                {u.kuerzel}
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{u.name}</p>
                <p className="text-[11.5px] text-foreground-subtle truncate font-mono-amount">
                  {u.email}
                </p>
              </div>
            </div>
            <RolleBadge rolle={u.rolle} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RolleBadge({ rolle }: { rolle: string }) {
  const label = ROLLE_LABEL[rolle] ?? rolle;
  if (rolle === "admin") {
    return (
      <Badge tone="brand" size="md">
        {label}
      </Badge>
    );
  }
  if (rolle === "buchhaltung") {
    return (
      <Badge tone="success" size="md">
        {label}
      </Badge>
    );
  }
  if (rolle === "besteller") {
    return (
      <Badge tone="info" size="md">
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone="muted" size="md">
      {label}
    </Badge>
  );
}
