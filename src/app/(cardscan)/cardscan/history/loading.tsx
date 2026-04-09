export default function HistoryLoading() {
  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-6">
        Letzte Scans
      </h1>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-text w-3/4" />
              <div className="skeleton-text w-1/3 h-[0.75em]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
