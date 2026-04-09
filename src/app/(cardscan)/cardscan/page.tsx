import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardButton } from "@/components/cardscan/ClipboardButton";
import { ErrorBadgeLink } from "@/components/cardscan/ErrorBadgeLink";

export const dynamic = "force-dynamic";

const INPUT_MODES = [
  {
    href: "/cardscan/paste",
    label: "Text einfügen",
    sub: "E-Mail-Signatur · Impressum · Freitext",
    num: "01",
    active: true,
  },
  {
    href: "/cardscan/capture",
    label: "Kamera",
    sub: "Visitenkarte live scannen",
    num: "02",
    active: true,
  },
  {
    href: "/cardscan/upload",
    label: "Datei hochladen",
    sub: "Foto · PDF · DOCX · vCard",
    num: "03",
    active: true,
  },
  {
    href: "/cardscan/url",
    label: "URL eingeben",
    sub: "Firmenwebseite · Impressum",
    num: "04",
    active: true,
  },
];

export default async function CardScanPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login?redirect=/cardscan");

  return (
    <div className="max-w-xl mx-auto">
      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded border border-emerald-600/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-600/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.15em] uppercase font-mono-amount">
            Neuer Kontakt
          </span>
        </div>
        <h1 className="font-headline text-3xl text-[var(--text-primary)] tracking-tight leading-tight">
          Eingabe<span className="text-[var(--text-tertiary)]">methode</span>
        </h1>
      </div>

      {/* Input modes – industrieller Stil */}
      <div className="space-y-2">
        {INPUT_MODES.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="group relative block card p-0 overflow-hidden"
          >
            {/* Hover-Akzent links */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

            <div className="flex items-center gap-4 px-5 py-4">
              {/* Nummer */}
              <span className="font-mono-amount text-[11px] text-[var(--text-tertiary)] w-6 shrink-0">
                {mode.num}
              </span>

              {/* Separator */}
              <div className="w-px h-8 bg-[var(--border-subtle)]" />

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-emerald-700 transition-colors">
                  {mode.label}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  {mode.sub}
                </p>
              </div>

              {/* Arrow */}
              <svg
                className="w-4 h-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        ))}

        {/* Clipboard */}
        <ClipboardButton />
      </div>

      {/* Separator */}
      <div className="industrial-line my-6" />

      {/* Footer links */}
      <ErrorBadgeLink />
    </div>
  );
}
