export default function PurseLoading() {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[236px_minmax(0,1fr)]" aria-busy="true" aria-live="polite">
      <div className="band hidden md:block" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="h-16 animate-pulse rounded-xl bg-sunk" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-xl bg-sunk" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-sunk" />
      </div>
    </div>
  );
}
