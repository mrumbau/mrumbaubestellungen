import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import {
  IconSettings,
  IconActivity,
  IconUsers,
  IconTool,
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
      label: "Testdaten",
      href: "/einstellungen/system/testdaten",
      icon: <IconTool />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SubNav items={items} ariaLabel="System-Sektionen" />
      {children}
    </div>
  );
}
