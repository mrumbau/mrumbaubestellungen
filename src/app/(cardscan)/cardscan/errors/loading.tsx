export default function ErrorsLoading() {
  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="skeleton-text w-16 h-4 mb-5" />
      <div className="skeleton-text w-1/3 h-6 mb-6" />
      <div className="space-y-2">
        <div className="skeleton w-full h-20 rounded-xl" />
        <div className="skeleton w-full h-20 rounded-xl" />
      </div>
    </div>
  );
}
