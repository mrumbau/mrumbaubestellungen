import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();

  if (!profil) {
    redirect("/login");
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
        <Sidebar profil={profil} />
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-4 pt-16 md:p-8 md:pt-8 focus:outline-none">{children}</main>
      </div>
    </ToastProvider>
  );
}
