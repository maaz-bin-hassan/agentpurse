"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type TourStep = {
  /** Matches an element's data-tour attribute. Leave empty for a centered card. */
  target?: string;
  title: string;
  body: ReactNode;
  /** Runs before the step looks for its target, e.g. to switch a tab. */
  onEnter?: () => void;
  /** Replaces the Next button on this step. */
  actions?: ReactNode;
};

type Rect = { top: number; left: number; width: number; height: number };
type Place = "bottom" | "top" | "right" | "center";

const GAP = 14;
const PAD = 6;
const CARD_W = 340;

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)];
  return all.find((el) => el.getClientRects().length > 0) ?? null;
}

/** Coach marks: dims the page, rings the target, and points a card at it. The page stays clickable. */
export function GuidedTour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState({ top: 0, left: 0, place: "center" as Place, arrow: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    if (!el) {
      setRect(null);
      return;
    }
    const box = el.getBoundingClientRect();
    setRect({ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 });
  }, [step?.target]);

  // Enter the step, wait for its target to appear, scroll it into view, then measure.
  useEffect(() => {
    if (!open || !step) return;
    step.onEnter?.();
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const seek = () => {
      const el = findTarget(step.target);
      if (step.target && !el && tries < 20) {
        tries += 1;
        timer = setTimeout(seek, 60);
        return;
      }
      if (el) {
        const box = el.getBoundingClientRect();
        if (box.top < 80 || box.bottom > window.innerHeight - 220) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      measure();
      timer = setTimeout(measure, 380);
    };
    seek();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // Place the card beside the ring, inside the viewport, with its arrow on the target.
  useLayoutEffect(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(CARD_W, vw - 32);
    const h = cardRef.current?.offsetHeight ?? 220;
    if (!rect) {
      setCard({ top: Math.max(16, (vh - h) / 2), left: (vw - w) / 2, place: "center", arrow: 0 });
      return;
    }
    const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16);
    const clampY = (y: number) => Math.min(Math.max(16, y), vh - h - 16);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (rect.left + rect.width + GAP + w + 16 < vw && rect.left < vw / 3 && rect.width < vw / 3) {
      const top = clampY(cy - h / 2);
      setCard({ top, left: rect.left + rect.width + GAP, place: "right", arrow: Math.min(Math.max(18, cy - top), h - 18) });
    } else if (rect.top + rect.height + GAP + h + 16 < vh) {
      const left = clampX(cx - w / 2);
      setCard({ top: rect.top + rect.height + GAP, left, place: "bottom", arrow: Math.min(Math.max(18, cx - left), w - 18) });
    } else if (rect.top - GAP - h > 16) {
      const left = clampX(cx - w / 2);
      setCard({ top: rect.top - GAP - h, left, place: "top", arrow: Math.min(Math.max(18, cx - left), w - 18) });
    } else {
      setCard({ top: vh - h - 16, left: clampX(cx - w / 2), place: "center", arrow: 0 });
    }
  }, [open, rect, index]);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < steps.length - 1) setIndex((i) => i + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, steps.length, onClose]);

  if (!open || !step) return null;
  const last = index === steps.length - 1;

  return (
    <div className="tour-root" aria-live="polite">
      {rect ? (
        <div className="tour-ring" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} aria-hidden />
      ) : (
        <div className="tour-dim" aria-hidden />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className={`tour-card tour-${card.place}`}
        style={{ top: card.top, left: card.left, width: Math.min(CARD_W, typeof window === "undefined" ? CARD_W : window.innerWidth - 32), ["--arrow" as string]: `${card.arrow}px` }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Step {index + 1} of {steps.length}</p>
          <button type="button" className="-mt-1 -mr-1 cursor-pointer rounded p-1 text-muted hover:text-ink" onClick={onClose} aria-label="Close the tour">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1 text-2xl leading-tight">{step.title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{step.body}</div>
        <div className="mt-4 flex items-center gap-1" aria-hidden>
          {steps.map((_, dot) => (
            <span key={dot} className={`h-1.5 rounded-full transition-all ${dot === index ? "w-5 bg-ink" : "w-1.5 bg-line"}`} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {index > 0 ? (
            <button type="button" className="btn secondary !min-h-10" onClick={() => setIndex(index - 1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          ) : (
            <button type="button" className="cursor-pointer text-sm text-muted underline underline-offset-[3px]" onClick={onClose}>Skip tour</button>
          )}
          {last && step.actions ? (
            <div className="flex flex-wrap gap-2">{step.actions}</div>
          ) : (
            <button ref={nextRef} type="button" className="btn !min-h-10" onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? "Done" : "Next"} {last ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
