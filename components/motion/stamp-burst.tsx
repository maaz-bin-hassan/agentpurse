"use client";

export function StampBurst({ show, onDone }: { show: boolean; onDone: () => void }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center" aria-hidden>
      <span className="stamp large slam allow bg-card !px-6 !py-3 !text-4xl" onAnimationEnd={() => window.setTimeout(onDone, 700)}>
        Paid
      </span>
    </div>
  );
}
