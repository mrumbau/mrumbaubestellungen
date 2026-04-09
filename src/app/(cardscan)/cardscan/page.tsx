import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ErrorBadgeLink } from "@/components/cardscan/ErrorBadgeLink";

export const dynamic = "force-dynamic";

export default async function CardScanPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login?redirect=/cardscan");

  const firstName = profil.name.split(" ")[0];

  return (
    <div className="max-w-lg mx-auto flex flex-col animate-fade-in min-h-[calc(100dvh-120px)]">
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <div className="pt-4 pb-6">
        <h1 className="font-headline text-[22px] text-[var(--text-primary)] tracking-tight">
          Hi {firstName}
        </h1>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Neuen Kontakt erfassen
        </p>
      </div>

      {/* ─── Primärer CTA: Scannen ────────────────────────────────── */}
      <Link
        href="/cardscan/capture"
        className="group block rounded-2xl overflow-hidden active:scale-[0.98] transition-transform duration-150"
      >
        <div className="bg-[var(--bg-sidebar)] px-5 py-5 flex items-center gap-4 relative">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-[15px]">Visitenkarte scannen</p>
            <p className="text-white/35 text-xs mt-0.5">Kamera oder Foto aus Galerie</p>
          </div>
          <svg className="w-4 h-4 text-white/20 shrink-0 group-hover:text-white/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent" />
        </div>
      </Link>

      {/* ─── Sekundäre Methoden ───────────────────────────────────── */}
      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] font-medium mt-6 mb-2.5 px-0.5">
        Weitere Methoden
      </p>

      <div className="space-y-2">
        {[
          {
            href: "/cardscan/paste",
            label: "Text einfügen",
            sub: "E-Mail-Signatur, Impressum, Freitext",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
          },
          {
            href: "/cardscan/upload",
            label: "Datei hochladen",
            sub: "Foto, PDF, DOCX, vCard",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />,
          },
          {
            href: "/cardscan/url",
            label: "URL analysieren",
            sub: "Firmenwebseite, Impressum",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-6.364-6.364L4.5 8.738" />,
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group card flex items-center gap-3.5 px-4 py-3.5 active:scale-[0.98] transition-transform duration-150 min-h-[56px]"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-input)] flex items-center justify-center shrink-0 group-hover:bg-emerald-50 transition-colors">
              <svg className="w-[18px] h-[18px] text-[var(--text-tertiary)] group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {item.icon}
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{item.sub}</p>
            </div>
            <svg className="w-4 h-4 text-[var(--text-tertiary)] opacity-30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        ))}
      </div>

      {/* ─── Spacer + Footer ──────────────────────────────────────── */}
      <div className="flex-1" />
      <div className="pt-6 pb-2">
        <ErrorBadgeLink />
      </div>
    </div>
  );
}
