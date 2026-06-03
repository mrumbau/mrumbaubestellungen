import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import {
  IconSettings,
  IconActivity,
  IconUsers,
  IconTool,
  IconMail,
  IconShield,
  IconKey,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/**
 * Nested layout for /einstellungen/system.
 *
 * Renders a secondary sub-nav below the main Einstellungen-SubNav. This keeps
 * each system sub-page focused on one concern (Overview / Logs / Benutzer /
 * Testdaten) instead of letting /system grow into a second monolith.
 *
 * Visual hierarchy:
 *   Main SubNav (Bereiche)   ← in /einstellungen/layout.tsx
 *   Secondary SubNav (System-Sektionen)  ← HERE
 *   PageHeader (per sub-route)
 */
export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/einstellungen");

  const items: SubNavItem[] = [
    {
      label: "Übersicht",
      href: "/einstellungen/system",
      match: "exact",
      icon: <IconSettings />,
    },
    {
      label: "E-Mail-Sync",
      href: "/einstellungen/system/email-sync",
      icon: <IconMail />,
    },
    {
      label: "Webhook-Logs",
      href: "/einstellungen/system/logs",
      icon: <IconActivity />,
    },
    {
      label: "Benutzer",
      href: "/einstellungen/system/benutzer",
      icon: <IconUsers />,
    },
    {
      label: "Auto-Zuordnung",
      href: "/einstellungen/system/rules",
      icon: <IconShield />,
    },
    {
      label: "Pool-Konfiguration",
      href: "/einstellungen/system/pool-config",
      icon: <IconShield />,
    },
    {
      label: "OpenAI-Kosten",
      href: "/einstellungen/system/openai-costs",
      icon: <IconKey />,
    },
    {
      label: "Pipeline-Qualität",
      href: "/einstellungen/system/pipeline-quality",
      icon: <IconActivity />,
    },
    {
      label: "Testdaten",
      href: "/einstellungen/system/testdaten",
      icon: <IconTool />,
    },
    {
      label: "Patterns",
      href: "/einstellungen/system/patterns",
      icon: <IconSettings />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div
        role="note"
        aria-label="Admin-Bereich"
        className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-md bg-canvas border border-line text-[12px] text-foreground-muted"
      >
        <svg
          className="w-3.5 h-3.5 text-foreground-subtle"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <span className="uppercase tracking-wider font-semibold text-[10px]">Admin-Bereich</span>
        <span className="text-foreground-faint">·</span>
        <span>Operationen hier wirken sich auf alle Benutzer aus.</span>
      </div>
      <SubNav items={items} ariaLabel="System-Sektionen" />
      {children}
    </div>
  );
}
