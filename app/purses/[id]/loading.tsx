export default function PurseLoading() {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-3 py-4 md:grid-cols-[220px_1fr] md:px-6" aria-busy="true" aria-live="polite">
      <div className="glass h-72 animate-pulse rounded-3xl" />
      <div className="space-y-4">
        <div className="glass h-16 animate-pulse rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="glass h-48 animate-pulse rounded-3xl" />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="glass h-64 animate-pulse rounded-3xl" />
          <div className="glass h-64 animate-pulse rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
