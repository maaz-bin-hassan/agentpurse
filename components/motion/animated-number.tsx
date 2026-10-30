"use client";

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "framer-motion";
import { useEffect } from "react";

export function AnimatedNumber({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? cents : 0);
  const text = useTransform(value, (latest) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(latest / 100),
  );

  useEffect(() => {
    if (reduce) {
      value.set(cents);
      return;
    }
    const controls = animate(value, cents, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [cents, reduce, value]);

  return <motion.span className={className}>{text}</motion.span>;
}
