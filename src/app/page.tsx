import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;
  const bestellwesenHref = isLoggedIn ? "/dashboard" : "/login?redirect=/dashboard";
  const cardscanHref = isLoggedIn ? "/cardscan" : "/login?redirect=/cardscan";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ─── Bestellmanagement Panel ─────────────────────────────────── */}
      <Link
        href={bestellwesenHref}
        className="group relative flex-1 flex flex-col justify-between p-8 md:p-12 lg:p-16 bg-mr-gradient overflow-hidden min-h-[50vh] lg:min-h-screen"
      >
        {/* Hover overlay – GPU-beschleunigt via opacity */}
        <div className="absolute inset-0 bg-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* Layered patterns */}
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute inset-0 bg-diagonal-lines" />
        <div className="absolute inset-0 bg-iso-grid" />

        {/* Geometric corner accent */}
        <div className="absolute top-0 right-0 w-80 h-80 opacity-[0.07]">
          <svg viewBox="0 0 320 320" fill="none">
            <line x1="80" y1="0" x2="320" y2="240" stroke="white" strokeWidth="0.75" />
            <line x1="120" y1="0" x2="320" y2="200" stroke="white" strokeWidth="0.75" />
            <line x1="160" y1="0" x2="320" y2="160" stroke="white" strokeWidth="0.75" />
            <line x1="200" y1="0" x2="320" y2="120" stroke="white" strokeWidth="0.75" />
            <line x1="240" y1="0" x2="320" y2="80" stroke="white" strokeWidth="0.75" />
            <rect x="280" y="0" width="40" height="3" fill="white" opacity="0.4" />
            <rect x="317" y="0" width="3" height="40" fill="white" opacity="0.4" />
          </svg>
        </div>

        {/* Bottom left corner */}
        <div className="absolute bottom-0 left-0 w-48 h-48 opacity-[0.05]">
          <svg viewBox="0 0 200 200" fill="none">
            <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="160" x2="160" y2="0" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="120" x2="120" y2="0" stroke="white" strokeWidth="0.75" />
            <rect x="0" y="197" width="30" height="3" fill="white" opacity="0.4" />
            <rect x="0" y="170" width="3" height="30" fill="white" opacity="0.4" />
          </svg>
        </div>

        {/* Horizontal accent lines */}
        <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <Logo size={44} color="#ffffff" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded border border-white/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <span className="text-[10px] text-white/30 tracking-[0.15em] uppercase font-mono-amount">Modul 01</span>
          </div>

          <h2 className="font-headline text-4xl lg:text-5xl text-white leading-[1.1] tracking-tight">
            Bestell<span className="text-white/40">management</span>
          </h2>

          <div className="w-12 h-[2px] bg-white/20 mt-5 mb-4" />

          <p className="text-white/30 text-sm leading-relaxed max-w-xs">
            Bestellungen verwalten, Dokumente abgleichen, Rechnungen freigeben.
          </p>

          {/* Feature list */}
          <div className="mt-6 space-y-2">
            {["Bestellbestätigung", "Lieferschein", "Rechnung"].map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-5 h-5 border border-white/15 rounded flex items-center justify-center">
                  <span className="font-mono-amount text-[9px] text-white/40">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <span className="text-white/35 text-xs tracking-wide">{label}</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
                <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with arrow */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-white/15 text-[10px] tracking-[0.15em] uppercase font-mono-amount">Öffnen</span>
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover:border-white/30 group-hover:bg-white/[0.06] transition-all">
            <svg className="w-4 h-4 text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
      </Link>

      {/* ─── CardScan Panel ──────────────────────────────────────────── */}
      <Link
        href={cardscanHref}
        className="group relative flex-1 flex flex-col justify-between p-8 md:p-12 lg:p-16 bg-[#141414] overflow-hidden min-h-[50vh] lg:min-h-screen"
      >
        {/* Dot grid pattern */}
        <div className="absolute inset-0 bg-dot-grid opacity-60" />

        {/* Geometric corner – gespiegelt */}
        <div className="absolute top-0 left-0 w-64 h-64 opacity-[0.06]">
          <svg viewBox="0 0 260 260" fill="none">
            <line x1="0" y1="60" x2="200" y2="260" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="100" x2="160" y2="260" stroke="white" strokeWidth="0.75" />
            <line x1="0" y1="140" x2="120" y2="260" stroke="white" strokeWidth="0.75" />
            <rect x="0" y="0" width="3" height="40" fill="white" opacity="0.4" />
            <rect x="0" y="0" width="40" height="3" fill="white" opacity="0.4" />
          </svg>
        </div>

        {/* Scan-lines effect */}
        <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/[0.08] to-transparent" />
        <div className="absolute top-[60%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/[0.05] to-transparent" />

        {/* Bottom right accent */}
        <div className="absolute bottom-0 right-0 w-48 h-48 opacity-[0.04]">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="200" cy="200" r="80" stroke="white" strokeWidth="0.5" />
            <circle cx="200" cy="200" r="120" stroke="white" strokeWidth="0.5" />
            <circle cx="200" cy="200" r="160" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Logo area */}
        <div className="relative z-10 flex items-center gap-3">
          <Logo size={32} color="#ffffff" />
          <div className="h-5 w-px bg-white/10" />
          <span className="text-[10px] text-white/20 tracking-[0.15em] uppercase font-mono-amount">Scan</span>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded border border-emerald-500/30 flex items-center justify-center">
              <svg className="w-3 h-3 text-emerald-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              </svg>
            </div>
            <span className="text-[10px] text-white/30 tracking-[0.15em] uppercase font-mono-amount">Modul 02</span>
          </div>

          <h2 className="font-headline text-4xl lg:text-5xl text-white leading-[1.1] tracking-tight">
            Card<span className="text-emerald-500/50">Scan</span>
          </h2>

          <div className="w-12 h-[2px] bg-emerald-500/20 mt-5 mb-4" />

          <p className="text-white/30 text-sm leading-relaxed max-w-xs">
            Kontaktdaten aus Visitenkarten, E-Mails, Webseiten erfassen und direkt ins CRM übertragen.
          </p>

          {/* Feature list */}
          <div className="mt-6 space-y-2">
            {["Foto & Kamera", "Text & Clipboard", "URL & Dateien", "Dual-CRM Write"].map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-5 h-5 border border-emerald-500/15 rounded flex items-center justify-center">
                  <span className="font-mono-amount text-[9px] text-emerald-500/40">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <span className="text-white/35 text-xs tracking-wide">{label}</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
                <svg className="w-3 h-3 text-emerald-500/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with arrow */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-white/15 text-[10px] tracking-[0.15em] uppercase font-mono-amount">Öffnen</span>
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.06] transition-all">
            <svg className="w-4 h-4 text-white/30 group-hover:text-emerald-400/70 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
      </Link>
    </div>
  );
}
