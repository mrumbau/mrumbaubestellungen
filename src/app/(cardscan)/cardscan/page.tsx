import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const INPUT_MODES = [
  {
    href: "/cardscan/paste",
    label: "Text einfügen",
    description: "E-Mail-Signatur, Visitenkarten-Text, Impressum",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    active: true,
  },
  {
    href: "/cardscan/capture",
    label: "Kamera",
    description: "Visitenkarte live scannen",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    ),
    active: false,
  },
  {
    href: "/cardscan/upload",
    label: "Datei hochladen",
    description: "Foto, PDF, DOCX oder vCard (.vcf)",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    active: false,
  },
  {
    href: "/cardscan/url",
    label: "URL eingeben",
    description: "Firmenwebseite, LinkedIn, Impressum",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    active: false,
  },
];

export default async function CardScanPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-2">
        Neuer Kontakt
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Wähle eine Eingabemethode um Kontaktdaten zu erfassen.
      </p>

      <div className="space-y-3">
        {INPUT_MODES.map((mode) => {
          if (!mode.active) {
            return (
              <div
                key={mode.href}
                className="card p-4 flex items-center gap-4 opacity-40 cursor-not-allowed"
              >
                <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0">
                  {mode.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {mode.label}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {mode.description}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Bald
                </span>
              </div>
            );
          }

          return (
            <Link
              key={mode.href}
              href={mode.href}
              className="card card-hover p-4 flex items-center gap-4 block"
            >
              <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--mr-red)]/5 flex items-center justify-center text-[var(--mr-red)] shrink-0">
                {mode.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {mode.label}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {mode.description}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-[var(--text-tertiary)] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </Link>
          );
        })}
      </div>

      {/* Link zu Historie */}
      <div className="mt-8 text-center">
        <Link
          href="/cardscan/history"
          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Letzte Scans ansehen →
        </Link>
      </div>
    </div>
  );
}
