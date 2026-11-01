const OUTLINE = "#14261f";

const SIZES = { sm: "h-8 w-8", md: "h-14 w-14", lg: "h-20 w-20" };

/* Each agent has its own silhouette, so it reads without its color. */
export function AgentFace({ id, status, size = "md" }: { id: string; status: string; size?: keyof typeof SIZES }) {
  const awake = status === "active";
  const Body = id.includes("way") ? Wayfinder : id.includes("stack") ? Stack : id.includes("handy") ? Handy : Grocer;
  return (
    <svg viewBox="0 0 80 80" className={`${SIZES[size]} shrink-0`} role="img" aria-label={`${id.replace("agent_", "")} is ${status}`}>
      <Body awake={awake} />
    </svg>
  );
}

function Eyes({ left, right, y, awake, delay }: { left: number; right: number; y: number; awake: boolean; delay: string }) {
  if (!awake) {
    return (
      <g fill="none" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round">
        <path d={`M${left - 6} ${y}q6 5 12 0`} />
        <path d={`M${right - 6} ${y}q6 5 12 0`} />
      </g>
    );
  }
  return (
    <g className="agent-blink" style={{ animationDelay: delay }}>
      <ellipse cx={left} cy={y} rx="7.5" ry="8.5" fill="#fcf9f0" stroke={OUTLINE} strokeWidth="2.5" />
      <ellipse cx={right} cy={y} rx="7.5" ry="8.5" fill="#fcf9f0" stroke={OUTLINE} strokeWidth="2.5" />
      <g className="agent-look" style={{ animationDelay: delay }} fill={OUTLINE}>
        <circle cx={left + 1} cy={y + 1} r="3.6" />
        <circle cx={right + 1} cy={y + 1} r="3.6" />
      </g>
    </g>
  );
}

type Part = { awake: boolean };

function Grocer({ awake }: Part) {
  return (
    <g>
      <path d="M40 22c-1-6 1-11 5-14" fill="none" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
      <path d="M44 15c5-8 14-9 20-7-1 8-11 13-20 7Z" fill="#7cc76b" stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 22c15-8 33 1 33 23 0 19-15 31-33 31S7 64 7 45c0-22 18-31 33-23Z" fill="#3f9e63" stroke={OUTLINE} strokeWidth="2.5" />
      <Eyes left={29} right={51} y={44} awake={awake} delay="0s" />
      <path d="M33 61c4 4 10 4 14 0" fill="none" stroke={OUTLINE} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Wayfinder({ awake }: Part) {
  return (
    <g>
      <path d="M40 4c19 0 33 14 33 32 0 20-20 33-33 41C27 69 7 56 7 36 7 18 21 4 40 4Z" fill="#3a6cc4" stroke={OUTLINE} strokeWidth="2.5" />
      <Eyes left={29} right={51} y={32} awake={awake} delay="1.3s" />
      <path d="M34 50h12" stroke={OUTLINE} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Stack({ awake }: Part) {
  return (
    <g stroke={OUTLINE} strokeWidth="2.5">
      <rect x="15" y="60" width="50" height="15" rx="6" fill="#5c3796" />
      <rect x="11" y="48" width="58" height="15" rx="6" fill="#7a4fbc" />
      <rect x="7" y="7" width="66" height="44" rx="13" fill="#9a70da" />
      <circle cx="56" cy="55.5" r="2" fill="#fcf9f0" strokeWidth="0" />
      <circle cx="56" cy="67.5" r="2" fill="#fcf9f0" strokeWidth="0" />
      <Eyes left={28} right={52} y={28} awake={awake} delay="2.4s" />
    </g>
  );
}

function Handy({ awake }: Part) {
  return (
    <g>
      <path d="M28 24v-7a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v7" fill="none" stroke={OUTLINE} strokeWidth="5" />
      <rect x="6" y="22" width="68" height="52" rx="14" fill="#e58a33" stroke={OUTLINE} strokeWidth="2.5" />
      <Eyes left={28} right={52} y={43} awake={awake} delay="3.5s" />
      <path d="M31 60c5 5 13 5 18 0" fill="none" stroke={OUTLINE} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}
