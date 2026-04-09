import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link, ViewTransitions } from "next-view-transitions";
import { Logo } from "@/components/logo";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CardScan – MR Umbau",
  description: "Kontaktdaten erfassen & ins CRM übernehmen",
  manifest: "/cardscan-manifest.json",
  icons: {
    icon: "/icons/cardscan-192.svg",
    apple: "/icons/cardscan-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CardScan",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#141414",
};

export default async function CardScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();

  if (!profil) {
    redirect("/login?redirect=/cardscan");
  }

  return (
    <ViewTransitions>
      <div className="min-h-screen bg-[var(--bg-main)] flex flex-col">
        {/* Service Worker */}
        <script src="/cardscan-register-sw.js" defer />

        {/* Header */}
        <header className="sticky top-0 z-30 bg-[var(--bg-sidebar)] border-b border-white/[0.06] safe-area-top">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <a
              href="/"
              className="flex items-center gap-2.5 text-white/50 hover:text-white/80 transition-colors focus-ring rounded"
              aria-label="Zurück zur Startseite"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <Logo size={20} color="#ffffff" className="opacity-40" />
            </a>

            <div className="flex items-center gap-2">
              <span className="font-headline text-[13px] text-white/90 tracking-tight">Card</span>
              <span className="font-headline text-[13px] text-emerald-500/70 tracking-tight">Scan</span>
            </div>

            <div className="w-7 h-7 rounded-md bg-white/[0.07] flex items-center justify-center text-[10px] font-bold text-white/70 border border-white/[0.06]">
              {profil.kuerzel}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-8">{children}</main>

        {/* Footer */}
        <div className="px-4 pb-4">
          <div className="max-w-2xl mx-auto">
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-subtle)] to-transparent" />
            <p className="text-center text-[9px] text-[var(--text-tertiary)] tracking-[0.15em] uppercase font-mono-amount mt-3 opacity-50">
              cloud.mrumbau.de
            </p>
          </div>
        </div>
      </div>
    </ViewTransitions>
  );
}
