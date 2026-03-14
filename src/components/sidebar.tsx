"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BenutzerProfil } from "@/lib/auth";

const NAV_ITEMS = {
  admin: [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/bestellungen", label: "Bestellungen", icon: "📦" },
    { href: "/buchhaltung", label: "Buchhaltung", icon: "📄" },
    { href: "/einstellungen", label: "Einstellungen", icon: "⚙️" },
  ],
  besteller: [
    { href: "/bestellungen", label: "Bestellungen", icon: "📦" },
  ],
  buchhaltung: [
    { href: "/buchhaltung", label: "Buchhaltung", icon: "📄" },
  ],
};

export function Sidebar({ profil }: { profil: BenutzerProfil }) {
  const pathname = usePathname();
  const items = NAV_ITEMS[profil.rolle] || [];

  return (
    <aside className="w-64 bg-[#1E4D8C] text-white flex flex-col">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-lg font-bold">MR Umbau</h1>
        <p className="text-sm text-white/60">Bestellmanagement</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-white/20 text-white font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
            {profil.kuerzel}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profil.name}</p>
            <p className="text-xs text-white/50 capitalize">{profil.rolle}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
