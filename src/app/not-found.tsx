import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-canvas px-6 py-12 relative overflow-hidden">
      {/* Subtle dot-grid texture */}
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 max-w-md text-center">
        <Logo size={48} />

        <p className="mt-10 text-[10px] text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
          Fehler 404
        </p>

        <h1 className="mt-3 font-headline text-4xl tracking-tight text-foreground">
          Seite nicht gefunden
        </h1>

        <div className="industrial-line mt-6 mb-6" aria-hidden="true" />

        <p className="text-foreground-muted text-[15px] leading-relaxed">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
          Möglicherweise wurde die Bestellung archiviert oder gelöscht.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="btn-primary px-5 py-2.5 rounded-md text-sm inline-flex items-center justify-center min-h-[44px] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Zum Dashboard
          </Link>
          <Link
            href="/bestellungen"
            className="px-5 py-2.5 rounded-md text-sm border border-line text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors inline-flex items-center justify-center min-h-[44px] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Bestellungen
          </Link>
        </div>
      </div>
    </main>
  );
}
