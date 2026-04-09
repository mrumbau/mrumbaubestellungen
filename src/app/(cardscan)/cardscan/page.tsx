import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "next-view-transitions";
import { ErrorBadgeLink } from "@/components/cardscan/ErrorBadgeLink";

export const dynamic = "force-dynamic";

export default async function CardScanPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login?redirect=/cardscan");

  return (
    <div className="max-w-xl mx-auto pt-1">
      {/* ─── Primärer CTA ─────────────────────────────────────────── */}
      <Link
        href="/cardscan/capture"
        className="group block rounded-2xl overflow-hidden mb-5 active:scale-[0.98] transition-transform"
      >
        <div className="bg-[var(--bg-sidebar)] relative px-6 py-7 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-white font-headline text-[17px] tracking-tight">Scannen</p>
            <p className="text-white/40 text-[13px] mt-0.5">Kamera öffnen · Kontakt erfassen</p>
          </div>
          <svg className="w-5 h-5 text-white/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        </div>
      </Link>

      {/* ─── 4er Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-8">
        <Link href="/cardscan/paste" className="group card py-5 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform">
          <svg className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Text</span>
        </Link>
        <Link href="/cardscan/upload" className="group card py-5 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform">
          <svg className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Datei</span>
        </Link>
        <Link href="/cardscan/url" className="group card py-5 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform">
          <svg className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-6.364-6.364L4.5 8.738" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">URL</span>
        </Link>
        <Link href="/cardscan/paste" className="group card py-5 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform">
          <svg className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Clipboard</span>
        </Link>
      </div>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <ErrorBadgeLink />
    </div>
  );
}
