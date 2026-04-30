"use client";

export default function ProjekteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="font-headline text-lg text-foreground mb-1">Projekte konnten nicht geladen werden</h2>
      <p className="text-sm text-foreground-subtle mb-6">Bitte versuche es erneut.</p>
      <button
        onClick={reset}
        className="px-5 py-2.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light transition-colors"
      >
        Neu laden
      </button>
    </div>
  );
}
