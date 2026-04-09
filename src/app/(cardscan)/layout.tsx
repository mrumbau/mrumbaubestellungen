import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CardScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();

  if (!profil) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex flex-col">
      {/* Minimaler Top-Bar ohne Sidebar */}
      <header className="sticky top-0 z-30 bg-[var(--bg-sidebar)] text-[var(--text-inverse)] px-4 py-3 flex items-center justify-between safe-area-top">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          <span className="text-sm">Zurück</span>
        </Link>
        <span className="font-headline text-sm tracking-tight">CardScan</span>
        <div className="w-8 h-8 rounded-lg bg-[var(--mr-red)] flex items-center justify-center text-[11px] font-bold text-white">
          {profil.kuerzel}
        </div>
      </header>

      {/* Content – mobile-optimiert */}
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
