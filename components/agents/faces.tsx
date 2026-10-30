import type { ReactNode } from "react";

export function AgentFace({ id, status }: { id: string; status: string }) {
  const tone =
    id.includes("way") ? ["#c9d6ff", "#1c2a55"] :
    id.includes("stack") ? ["#e4ccff", "#3a215c"] :
    id.includes("handy") ? ["#ffe0a3", "#5a3d12"] :
    ["#b8fff2", "#0e3d36"];
  const dim = status !== "active";
  const dot = status === "active" ? "#3ee0c5" : status === "paused" ? "#f5b942" : "#ff6b8a";
  return (
    <svg viewBox="0 0 80 80" className="h-16 w-16" role="img" aria-label={`${id} ${status}`}>
      <defs>
        <radialGradient id={`${id}-face`} cx="38%" cy="32%">
          <stop offset="0%" stopColor={tone[0]} />
          <stop offset="100%" stopColor={tone[1]} />
        </radialGradient>
      </defs>
      <circle cx="40" cy="42" r="26" fill={`url(#${id}-face)`} opacity={dim ? 0.5 : 1} />
      <ellipse cx="28" cy="58" rx="8" ry="3" fill="#07080d" opacity="0.15" />
      {id.includes("way") ? <Wayfinder /> : id.includes("stack") ? <Stack /> : id.includes("handy") ? <Handy /> : <Grocer />}
      <circle cx="62" cy="16" r="6" fill="#07080d" />
      <circle cx="62" cy="16" r="4.2" fill={dot} className={status === "active" ? "origin-center animate-pulse" : undefined} />
    </svg>
  );
}

function Grocer() {
  return (
    <g>
      <path d="M24 34c2-8 10-10 16-6" stroke="#123e36" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="31" cy="40" r="2.6" fill="#07080d" />
      <circle cx="49" cy="40" r="2.6" fill="#07080d" />
      <circle cx="32" cy="39" r="0.9" fill="white" />
      <circle cx="50" cy="39" r="0.9" fill="white" />
      <path d="M32 50c3 4 13 4 16 0" stroke="#07080d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M54 30c4 1 6 4 5 7" stroke="#3ee0c5" strokeWidth="1.6" fill="none" />
    </g>
  );
}

function Wayfinder() {
  return (
    <g>
      <path d="M22 38h36" stroke="#9db4ff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
      <circle cx="32" cy="38" r="2.2" fill="#07080d" />
      <circle cx="48" cy="38" r="2.2" fill="#07080d" />
      <path d="M33 50h14" stroke="#07080d" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 22l3 5h-6z" fill="#c9d6ff" />
    </g>
  );
}

function Stack() {
  return (
    <g>
      <rect x="22" y="32" width="14" height="10" rx="3" fill="none" stroke="#07080d" strokeWidth="1.7" />
      <rect x="44" y="32" width="14" height="10" rx="3" fill="none" stroke="#07080d" strokeWidth="1.7" />
      <circle cx="29" cy="37" r="1.6" fill="#07080d" />
      <circle cx="51" cy="37" r="1.6" fill="#07080d" />
      <rect x="32" y="48" width="16" height="2.4" rx="1.2" fill="#07080d" />
    </g>
  );
}

function Handy() {
  return (
    <g>
      <circle cx="31" cy="39" r="2.5" fill="#07080d" />
      <circle cx="49" cy="39" r="2.5" fill="#07080d" />
      <path d="M31 49c4 5 14 5 18 0" stroke="#07080d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M56 28l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffe0a3" />
    </g>
  );
}

export function AllowanceRing({
  spent,
  allowance,
  ringId,
  children,
}: {
  spent: number;
  allowance: number;
  ringId: string;
  children: ReactNode;
}) {
  const ratio = allowance <= 0 ? 0 : Math.min(1, Math.max(0, spent / allowance));
  const r = 36;
  const c = 2 * Math.PI * r;
  const grad = `${ringId}-ring`;
  return (
    <div className="relative grid h-[92px] w-[92px] place-items-center">
      <svg viewBox="0 0 92 92" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke={`url(#${grad})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          className="transition-[stroke-dasharray] duration-700"
        />
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b7cff" />
            <stop offset="100%" stopColor="#3ee0c5" />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  );
}
