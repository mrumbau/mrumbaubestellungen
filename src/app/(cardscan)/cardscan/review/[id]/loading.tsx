export default function ReviewLoading() {
  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="skeleton w-12 h-12 rounded-xl" />
          <div className="flex-1 space-y-2.5">
            <div className="skeleton-text w-2/3 h-5" />
            <div className="skeleton-text w-1/2 h-3" />
            <div className="skeleton-text w-3/4 h-3" />
          </div>
        </div>
      </div>
      <div className="card p-4 mb-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton-text w-1/5 h-[0.65em]" />
            <div className="skeleton w-full h-10" />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <div className="skeleton flex-1 h-12" />
        <div className="skeleton flex-1 h-12" />
      </div>
    </div>
  );
}
