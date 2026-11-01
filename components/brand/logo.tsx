import Link from "next/link";

export function PurseMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M11 15c0-13 18-13 18 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="3" y="14" width="34" height="23" rx="9" fill="currentColor" />
      <circle cx="17" cy="13" r="3.2" fill="currentColor" />
      <circle cx="23" cy="13" r="3.2" fill="currentColor" />
      <circle cx="14" cy="25" r="3.4" fill="var(--mark-eye)" />
      <circle cx="26" cy="25" r="3.4" fill="var(--mark-eye)" />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 no-underline">
      <PurseMark />
      <span className="font-serif text-xl font-semibold tracking-tight">
        Agent<em className="font-medium">Purse</em>
      </span>
    </Link>
  );
}
