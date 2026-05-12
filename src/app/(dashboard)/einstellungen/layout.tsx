import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import {
  IconBuilding,
  IconTool,
  IconFolderOpen,
  IconRepeat,
  IconShield,
  IconSettings,
  IconKey,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function EinstellungenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const istAdmin = profil.rolle === "admin";
  const istBuchhaltung = profil.rolle === "buchhaltung";

  // Buchhaltung only sees /einstellungen (Passwort ändern) — no sub-nav needed.
  if (istBuchhaltung) {
    return <div className="max-w-5xl mx-auto">{children}</div>;
  }

  // Rollen-Logik: fachliche Stammdaten (Händler, SU, Projekte, Abo-Anbieter, Blacklist)
  // sind für Admin + Besteller sichtbar. System (Benutzer-Mgmt, Logs, Testdaten, Firma) nur Admin.
  const items: SubNavItem[] = [
    {
      label: "Übersicht",
      href: "/einstellungen",
      match: "exact",
      icon: <IconKey />,
    },
    {
      label: "Händler",
      href: "/einstellungen/haendler",
      icon: <IconBuilding />,
    },
    {
      label: "Subunternehmer",
      href: "/einstellungen/subunternehmer",
      icon: <IconTool />,
    },
    {
      label: "Projekte",
      href: "/einstellungen/projekte",
      icon: <IconFolderOpen />,
    },
    {
      label: "Abo-Anbieter",
      href: "/einstellungen/abo-anbieter",
      icon: <IconRepeat />,
    },
    {
      label: "Blacklist",
      href: "/einstellungen/blacklist",
      icon: <IconShield />,
    },
    {
      label: "System",
      href: "/einstellungen/system",
      icon: <IconSettings />,
      hidden: !istAdmin,
      badge: (
        <span
          aria-label="Admin-Bereich"
          title="Admin-Bereich — nur für it@mrumbau.de zugänglich"
          className="inline-flex items-center text-foreground-faint"
        >
          <svg
            className="w-3 h-3"
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
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <SubNav items={items} ariaLabel="Einstellungen-Bereiche" className="mb-6" />
      {children}
    </div>
  );
}
