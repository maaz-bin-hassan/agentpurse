"use client";

import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#7dffb2", "#ff5c2a", "#f7f7f5"];

export function ConfettiBurst({ show }: { show: boolean }) {
  const reduce = useReducedMotion();
  if (!show || reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, index) => {
        const angle = (index / 28) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            className="absolute top-[28%] left-1/2 h-2.5 w-1.5 rounded-sm"
            style={{ background: COLORS[index % COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * (140 + (index % 5) * 36),
              y: Math.sin(angle) * (90 + (index % 4) * 28) + 30,
              opacity: 0,
              rotate: 220,
            }}
            transition={{ duration: 0.95, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
