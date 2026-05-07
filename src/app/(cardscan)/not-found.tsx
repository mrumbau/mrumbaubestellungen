import Link from "next/link";

export default function CardScanNotFound() {
  return (
    <div className="max-w-lg md:max-w-xl mx-auto py-12 text-center animate-fade-in">
      <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-cs-accent-tint">
        <svg className="w-7 h-7 text-cs-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      </div>

      <h1 className="font-headline text-xl text-foreground tracking-tight mb-1">
        Seite nicht gefunden
      </h1>
      <p className="text-sm text-foreground-muted mb-6">
        Diese Seite existiert in CardScan nicht (mehr).
      </p>

      <Link
        href="/cardscan"
        className="inline-block py-3.5 px-6 rounded-xl bg-cs-accent text-white text-sm font-medium hover:bg-cs-accent-light transition-colors min-h-[48px]"
      >
        Zur CardScan-Übersicht
      </Link>
    </div>
  );
}
