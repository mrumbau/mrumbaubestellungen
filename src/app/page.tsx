import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Eingeloggt → Tool-Auswahl mit direkten Links
  // Nicht eingeloggt → Tool-Auswahl mit Login-Redirect
  const isLoggedIn = !!user;

  const bestellwesenHref = isLoggedIn ? "/dashboard" : "/login?redirect=/dashboard";
  const cardscanHref = isLoggedIn ? "/cardscan" : "/login?redirect=/cardscan";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main)]">
      {/* Hero Header */}
      <div className="bg-mr-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute inset-0 bg-diagonal-lines" />

        <div className="relative z-10 px-6 py-12 md:py-20 text-center">
          <div className="flex justify-center mb-6">
            <Logo size={48} color="#ffffff" />
          </div>
          <h1 className="font-headline text-3xl md:text-4xl text-white tracking-tight">
            MR Umbau <span className="text-white/40">GmbH</span>
          </h1>
          <p className="text-white/50 text-sm mt-3 max-w-sm mx-auto">
            Wähle dein Werkzeug
          </p>
        </div>

        {/* Übergang zum Content */}
        <div className="h-6 bg-gradient-to-b from-transparent to-[var(--bg-main)]" />
      </div>

      {/* Tool-Auswahl */}
      <div className="flex-1 px-4 md:px-8 -mt-3 pb-12">
        <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Bestellmanagement */}
          <Link
            href={bestellwesenHref}
            className="group card card-hover p-6 md:p-8 flex flex-col items-start gap-5 relative overflow-hidden"
          >
            {/* Hintergrund-Akzent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--mr-red)]/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

            <div className="w-14 h-14 rounded-2xl bg-[var(--mr-red)]/[0.08] flex items-center justify-center relative">
              <svg className="w-7 h-7 text-[var(--mr-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="font-headline text-xl text-[var(--text-primary)] tracking-tight">
                Bestellmanagement
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                Bestellungen verwalten, Dokumente abgleichen, Rechnungen freigeben.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mt-auto pt-2">
              <div className="flex -space-x-1">
                {["B", "L", "R"].map((letter) => (
                  <div
                    key={letter}
                    className="w-5 h-5 rounded border border-[var(--border-default)] bg-[var(--bg-input)] flex items-center justify-center text-[8px] font-bold text-[var(--text-tertiary)]"
                  >
                    {letter}
                  </div>
                ))}
              </div>
              <span>Bestätigung · Lieferschein · Rechnung</span>
            </div>

            {/* Pfeil */}
            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-10 h-10 rounded-full bg-[var(--bg-input)] flex items-center justify-center group-hover:bg-[var(--mr-red)] group-hover:text-white transition-colors">
              <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>

          {/* CardScan */}
          <Link
            href={cardscanHref}
            className="group card card-hover p-6 md:p-8 flex flex-col items-start gap-5 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

            <div className="w-14 h-14 rounded-2xl bg-emerald-600/[0.08] flex items-center justify-center relative">
              <svg className="w-7 h-7 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="font-headline text-xl text-[var(--text-primary)] tracking-tight">
                CardScan
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                Kontaktdaten scannen und direkt ins CRM übertragen.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mt-auto pt-2">
              <div className="flex -space-x-1">
                {["Foto", "Text", "URL"].map((label) => (
                  <div
                    key={label}
                    className="h-5 px-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-input)] flex items-center justify-center text-[8px] font-bold text-[var(--text-tertiary)]"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <span>Kamera · Upload · Clipboard</span>
            </div>

            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-10 h-10 rounded-full bg-[var(--bg-input)] flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 text-center">
        <div className="industrial-line mb-4" />
        <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.15em] uppercase font-mono-amount">
          cloud.mrumbau.de
        </span>
      </div>
    </div>
  );
}
