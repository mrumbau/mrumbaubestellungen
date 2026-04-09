export default function SuccessLoading() {
  return (
    <div className="max-w-xl mx-auto py-8 animate-fade-in">
      <div className="text-center mb-8">
        <div className="skeleton w-14 h-14 rounded-2xl mx-auto mb-4" />
        <div className="skeleton-text w-1/3 h-6 mx-auto mb-2" />
        <div className="skeleton-text w-2/3 h-4 mx-auto" />
      </div>
      <div className="card p-4 space-y-3 mb-5">
        <div className="skeleton w-full h-8" />
        <div className="skeleton w-full h-8" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton flex-1 h-12" />
        <div className="skeleton flex-1 h-12" />
      </div>
    </div>
  );
}
