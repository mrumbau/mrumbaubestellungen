import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();

  if (!profil) {
    redirect("/login");
  }

  // 02.06.2026 (Pool Phase 2) — Pool-Counter im Layout vorladen damit jede
  // Page ihn ohne extra Roundtrip kennt. head:true → kein Body, nur count.
  // RLS scoped die Sicht (Buchhaltung sieht 0; Besteller/Admin sehen alle
  // UNBEKANNT-Material). Single-Query, ~5-15ms. Layout-Caching durch
  // `export const dynamic = "force-dynamic"` der Pages bleibt unangetastet.
  let poolCount = 0;
  if (profil.rolle === "admin" || profil.rolle === "besteller") {
    const supabase = await createServerSupabaseClient();
    const { count } = await supabase
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("archiviert_am", null)
      .eq("besteller_kuerzel", "UNBEKANNT")
      .eq("bestellungsart", "material");
    poolCount = count ?? 0;
  }

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:bg-surface focus:text-foreground focus:shadow-[var(--shadow-elevated)] focus:rounded focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        Zum Hauptinhalt springen
      </a>
      {/* min-h-dvh + sticky Sidebar: Outer-Page-Scroll bleibt erhalten (für
          Pages mit `h-full`-Wrapper wie Bestelldetail), Sidebar bleibt aber
          sichtbar weil sie sticky am Top hängt. Saubereres Pattern als
          h-dvh+overflow-hidden, das Detail-Layouts mit eigener Scroll-Logic
          zerschießt. */}
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar profil={profil} poolCount={poolCount} />
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-4 pt-16 md:p-8 md:pt-8 focus:outline-none">{children}</main>
      </div>
    </ToastProvider>
  );
}
