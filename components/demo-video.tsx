export const DEMO_VIDEO_ID = "-5Y8ftuzQG4";
export const DEMO_VIDEO_URL = `https://youtu.be/${DEMO_VIDEO_ID}`;

/** The AgentPurse demo on YouTube. The privacy-enhanced host sets no cookies until the viewer presses play. */
export function DemoVideo({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border-2 border-ink bg-ink shadow-[var(--shadow)]">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?rel=0&modestbranding=1`}
          title="AgentPurse demo video"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <p className="mt-2 text-sm text-muted">
        Video not loading? <a className="underline" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">Watch it on YouTube</a>.
      </p>
    </div>
  );
}
