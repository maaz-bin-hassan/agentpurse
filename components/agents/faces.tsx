import type { ReactNode } from "react";

export type FaceMood = "idle" | "think" | "yes" | "block" | "paused" | "revoked";

export function moodForStatus(status: string): FaceMood {
  if (status === "paused") return "paused";
  if (status === "revoked") return "revoked";
  return "idle";
}

export function AgentFace({ id, status, mood }: { id: string; status: string; mood?: FaceMood }) {
  const face = mood ?? moodForStatus(status);
  const dim = face === "paused" || face === "revoked" || status !== "active";
  const dot = face === "yes" || status === "active" ? "#7dffb2" : face === "paused" || status === "paused" ? "#ffc14d" : face === "block" || status === "revoked" ? "#ff5d73" : "#7dffb2";
  const skin =
    id.includes("way") ? "#d5d8e0" :
    id.includes("stack") ? "#efe6d6" :
    id.includes("handy") ? "#f0d2b0" :
    "#f3e2c8";
  return (
    <svg viewBox="0 0 80 80" className={`face-${face} h-16 w-16`} role="img" aria-label={`${id} ${face}`}>
      <circle cx="40" cy="42" r="26" fill={skin} opacity={dim && face !== "block" ? 0.55 : 1} />
      {id.includes("way") ? <Wayfinder mood={face} /> : id.includes("stack") ? <Stack mood={face} /> : id.includes("handy") ? <Handy mood={face} /> : <Grocer mood={face} />}
      <circle cx="64" cy="16" r="5" fill="#050505" />
      <circle cx="64" cy="16" r="3.4" fill={face === "block" ? "#ff5d73" : dot} />
    </svg>
  );
}

function Eyes({ y = 40, mood }: { y?: number; mood: FaceMood }) {
  const shut = mood === "block";
  return (
    <g className="pupil">
      <ellipse className="lid" cx="31" cy={y} rx="3.1" ry={shut ? 0.6 : 3.1} fill="#141413" />
      <ellipse className="lid" cx="49" cy={y} rx="3.1" ry={shut ? 0.6 : 3.1} fill="#141413" />
      {shut ? null : (
        <>
          <circle cx="32" cy={y - 1} r="0.9" fill="white" />
          <circle cx="50" cy={y - 1} r="0.9" fill="white" />
        </>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: FaceMood }) {
  if (mood === "block") return <path d="M32 52h16" stroke="#141413" strokeWidth="2" strokeLinecap="round" />;
  if (mood === "yes") return <path className="smile" d="M30 49c4 7 16 7 20 0" stroke="#141413" strokeWidth="2" fill="none" strokeLinecap="round" />;
  if (mood === "think") return <circle cx="44" cy="51" r="1.6" fill="#141413" />;
  return <path className="smile" d="M33 50c3 3 11 3 14 0" stroke="#141413" strokeWidth="2" fill="none" strokeLinecap="round" />;
}

function Grocer({ mood }: { mood: FaceMood }) {
  return (
    <g>
      <path d="M26 30c6-8 18-6 22 2" stroke="#2f6b45" strokeWidth="2" fill="none" />
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      <circle cx="24" cy="46" r="2" fill="#ff8b7a" opacity="0.8" />
    </g>
  );
}

function Wayfinder({ mood }: { mood: FaceMood }) {
  return (
    <g>
      <path d="M22 36h36v10H22z" fill="#1c2433" opacity="0.9" />
      <Eyes y={41} mood={mood} />
      <path d="M40 20l4 6h-8z" fill="#ff5c2a" />
      <Mouth mood={mood} />
    </g>
  );
}

function Stack({ mood }: { mood: FaceMood }) {
  return (
    <g>
      <rect x="20" y="33" width="16" height="12" rx="4" fill="none" stroke="#141413" strokeWidth="1.6" />
      <rect x="44" y="33" width="16" height="12" rx="4" fill="none" stroke="#141413" strokeWidth="1.6" />
      <Eyes y={39} mood={mood} />
      <Mouth mood={mood} />
    </g>
  );
}

function Handy({ mood }: { mood: FaceMood }) {
  return (
    <g>
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      <path d="M58 24l1.4 4.2 4.2 1.4-4.2 1.4L58 35.2l-1.4-4.2-4.2-1.4 4.2-1.4z" fill="#ff5c2a" />
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
  const r = 34;
  const c = 2 * Math.PI * r;
  const grad = `${ringId}-ring`;
  return (
    <div className="relative grid h-[88px] w-[88px] place-items-center">
      <svg viewBox="0 0 88 88" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={`url(#${grad})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          style={{ transition: "stroke-dasharray 520ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5c2a" />
            <stop offset="100%" stopColor="#ffc14d" />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  );
}
