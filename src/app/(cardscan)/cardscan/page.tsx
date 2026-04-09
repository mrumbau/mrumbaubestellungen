import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardButton } from "@/components/cardscan/ClipboardButton";
import { ErrorBadgeLink } from "@/components/cardscan/ErrorBadgeLink";

export const dynamic = "force-dynamic";

export default async function CardScanPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login?redirect=/cardscan");

  return (
    <div className="max-w-xl mx-auto">
      {/* Begrüßung – persönlich, kurz */}
      <p className="text-sm text-[var(--text-tertiary)] mb-6">
        Hallo {profil.name.split(" ")[0]}
      </p>

      {/* ─── Primärer CTA: Kamera ─────────────────────────────────── */}
      <Link
        href="/cardscan/capture"
        className="group relative block rounded-2xl overflow-hidden mb-4"
      >
        <div className="bg-[#141414] px-6 py-8 md:py-10 flex items-center gap-5">
          {/* Kamera-Icon – groß, nicht generisch */}
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/30 transition-all">
            <svg className="w-8 h-8 md:w-10 md:h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-headline text-lg md:text-xl tracking-tight">
              Visitenkarte scannen
            </p>
            <p className="text-white/40 text-sm mt-1">
              Kamera öffnen und Kontakt erfassen
            </p>
          </div>
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center shrink-0 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/5 transition-all">
            <svg className="w-5 h-5 text-white/30 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
        {/* Subtile Scan-Linie */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      </Link>

      {/* ─── Sekundäre Modi: Kompakte Zeile ──────────────────────── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Link
          href="/cardscan/paste"
          className="group card p-4 flex flex-col items-center gap-2 text-center hover:shadow-[var(--shadow-hover)] transition-shadow"
        >
          <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Text</span>
        </Link>
        <Link
          href="/cardscan/upload"
          className="group card p-4 flex flex-col items-center gap-2 text-center hover:shadow-[var(--shadow-hover)] transition-shadow"
        >
          <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Datei</span>
        </Link>
        <Link
          href="/cardscan/url"
          className="group card p-4 flex flex-col items-center gap-2 text-center hover:shadow-[var(--shadow-hover)] transition-shadow"
        >
          <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">URL</span>
        </Link>
      </div>

      {/* Clipboard – unauffällig, aber da */}
      <ClipboardButton />

      <div className="industrial-line my-5" />

      <ErrorBadgeLink />
    </div>
  );
}
