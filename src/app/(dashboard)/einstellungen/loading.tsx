export default function EinstellungenLoading() {
  return (
    <div className="animate-pulse">
      {/* SubNav-Platzhalter (horizontaler Rail) */}
      <div className="border-b border-line-subtle mb-6 pb-2 flex gap-4">
        <div className="h-5 skeleton-text w-20" />
        <div className="h-5 skeleton-text w-24" />
        <div className="h-5 skeleton-text w-28" />
        <div className="h-5 skeleton-text w-20" />
      </div>

      {/* PageHeader-Platzhalter */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-1.5">
          <div className="h-3 skeleton-text w-24" />
          <div className="h-3 skeleton-text w-16" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-7 skeleton rounded w-48" />
            <div className="h-4 skeleton-text w-96 max-w-full" />
          </div>
          <div className="h-9 skeleton rounded-md w-40 shrink-0" />
        </div>
        <div className="industrial-line mt-1" aria-hidden="true" />
      </div>

      {/* Ein Listen-Card-Platzhalter */}
      <div className="card p-0 overflow-hidden">
        <div className="divide-y divide-line-subtle">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 skeleton-text w-32" />
                  <div className="h-3 skeleton rounded w-20" />
                </div>
                <div className="h-3 skeleton-text w-64 max-w-full" />
                <div className="h-3 skeleton-text w-48 max-w-full" />
              </div>
              <div className="flex gap-1 shrink-0">
                <div className="h-8 w-8 skeleton rounded-md" />
                <div className="h-8 w-8 skeleton rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
