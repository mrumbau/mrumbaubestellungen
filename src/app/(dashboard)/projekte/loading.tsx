export default function ProjekteLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 skeleton rounded w-32" />
          <div className="h-4 skeleton rounded w-24 mt-2" />
        </div>
        <div className="h-9 skeleton rounded-lg w-36" />
      </div>
      <div className="h-px skeleton my-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-5 skeleton rounded w-40 mb-2" />
            <div className="h-4 skeleton rounded w-16 mb-3" />
            <div className="h-3 skeleton rounded w-full mb-1" />
            <div className="h-3 skeleton rounded w-2/3 mb-4" />
            <div className="flex gap-4">
              <div className="h-3 skeleton rounded w-20" />
              <div className="h-3 skeleton rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
