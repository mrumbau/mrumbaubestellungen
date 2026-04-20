import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PasswortAendern } from "@/components/passwort-aendern";
import {
  IconBuilding,
  IconTool,
  IconFolderOpen,
  IconRepeat,
  IconShield,
  IconSettings,
  IconArrowRight,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

const ROLLEN_LABEL: Record<string, string> = {
  admin: "Administrator",
  besteller: "Besteller",
  buchhaltung: "Buchhaltung",
};

export default async function EinstellungenIndexPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const istAdmin = profil.rolle === "admin";
  const istBuchhaltung = profil.rolle === "buchhaltung";

  // Counts für fachliche Stammdaten: Admin + Besteller brauchen sie.
  // Benutzer-Count ist System-Info und bleibt Admin-exklusiv.
  let counts: Record<string, number> = {};
  if (!istBuchhaltung) {
    const supabase = await createServerSupabaseClient();
    const [h, su, p, a, bl, u] = await Promise.all([
      supabase.from("haendler").select("id", { count: "exact", head: true }),
      supabase.from("subunternehmer").select("id", { count: "exact", head: true }),
      supabase.from("projekte").select("id", { count: "exact", head: true }),
      supabase.from("abo_anbieter").select("id", { count: "exact", head: true }),
      supabase.from("email_blacklist").select("muster", { count: "exact", head: true }),
      istAdmin
        ? supabase.from("benutzer_rollen").select("id", { count: "exact", head: true })
        : Promise.resolve({ count: 0 }),
    ]);
    counts = {
      haendler: h.count ?? 0,
      subunternehmer: su.count ?? 0,
      projekte: p.count ?? 0,
      abo: a.count ?? 0,
      blacklist: bl.count ?? 0,
      benutzer: u.count ?? 0,
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Einstellungen"
        title={`Hallo, ${profil.name.split(" ")[0]}`}
        description={
          istBuchhaltung
            ? "Hier änderst du dein Passwort. Bestellwesen-Daten sind für deine Rolle ausgeblendet."
            : "Verwalte Stammdaten, System-Status und dein Konto. Die Menü-Punkte oben führen zu den einzelnen Bereichen."
        }
        meta={
          <>
            <Badge tone="neutral" size="md">
              {profil.kuerzel}
            </Badge>
            <span className="text-[12px] text-foreground-subtle">
              {ROLLEN_LABEL[profil.rolle] ?? profil.rolle}
            </span>
            <span className="text-[12px] text-foreground-subtle">·</span>
            <span className="text-[12px] text-foreground-subtle">{profil.email}</span>
          </>
        }
      />

      {!istBuchhaltung && (
        <section aria-labelledby="bereiche-heading" className="flex flex-col gap-3">
          <h2
            id="bereiche-heading"
            className="font-headline text-[13px] uppercase tracking-[0.14em] text-foreground-subtle"
          >
            Bereiche
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <NavCard
              href="/einstellungen/haendler"
              icon={<IconBuilding />}
              title="Händler"
              count={counts.haendler}
              description="Webshop-Muster, E-Mail-Absender, Statistiken"
            />
            <NavCard
              href="/einstellungen/subunternehmer"
              icon={<IconTool />}
              title="Subunternehmer"
              count={counts.subunternehmer}
              description="Gewerke, Ansprechpartner, Stammdaten"
            />
            <NavCard
              href="/einstellungen/projekte"
              icon={<IconFolderOpen />}
              title="Projekte"
              count={counts.projekte}
              description="Farbe, Budget, Adresse, Status"
            />
            <NavCard
              href="/einstellungen/abo-anbieter"
              icon={<IconRepeat />}
              title="Abo-Anbieter"
              count={counts.abo}
              description="Wiederkehrende Verträge, Fristen, Toleranz"
            />
            <NavCard
              href="/einstellungen/blacklist"
              icon={<IconShield />}
              title="E-Mail Blacklist"
              count={counts.blacklist}
              description="Ignorierte Absender und Domains"
            />
            {istAdmin && (
              <NavCard
                href="/einstellungen/system"
                icon={<IconSettings />}
                title="System"
                subtitle={`${counts.benutzer} Benutzer`}
                description="Health, KI-Erkennung, Webhooks, Extension, Testdaten"
              />
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="konto-heading" className="max-w-md">
        <h2
          id="konto-heading"
          className="font-headline text-[13px] uppercase tracking-[0.14em] text-foreground-subtle mb-3"
        >
          Konto
        </h2>
        <PasswortAendern />
      </section>
    </div>
  );
}

function NavCard({
  href,
  icon,
  title,
  count,
  subtitle,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count?: number;
  subtitle?: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group focus-visible:outline-none rounded-lg focus-visible:shadow-[var(--shadow-focus-ring)]"
    >
      <Card
        interactive
        padding="md"
        className="h-full flex flex-col justify-between group-hover:border-line-strong"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-canvas border border-line-subtle text-foreground-muted group-hover:text-brand group-hover:border-line-strong transition-colors [&_svg]:h-4 [&_svg]:w-4">
              {icon}
            </span>
            <div className="flex flex-col">
              <span className="font-headline text-[14px] tracking-tight text-foreground">
                {title}
              </span>
              {(count !== undefined || subtitle) && (
                <span className="text-[11.5px] text-foreground-subtle font-mono-amount">
                  {count !== undefined ? `${count} Einträge` : subtitle}
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 text-foreground-subtle group-hover:text-brand transition-colors opacity-0 group-hover:opacity-100 translate-x-[-4px] group-hover:translate-x-0 duration-150">
            <IconArrowRight className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-foreground-muted">
          {description}
        </p>
      </Card>
    </Link>
  );
}
