export default function UploadLoading() {
  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="skeleton-text w-16 h-4 mb-5" />
      <div className="skeleton-text w-1/3 h-5 mb-1" />
      <div className="skeleton-text w-2/3 h-4 mb-5" />
      <div className="space-y-3">
        <div className="skeleton w-full h-28 rounded-xl" />
        <div className="skeleton w-full h-28 rounded-xl" />
      </div>
    </div>
  );
}
