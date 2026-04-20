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
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <SubNav items={items} ariaLabel="Einstellungen-Bereiche" className="mb-6" />
      {children}
    </div>
  );
}
