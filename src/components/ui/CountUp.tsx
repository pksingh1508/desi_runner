"use client";

import { useLayoutEffect, useRef } from "react";
import { formatKind, type NumberFormatKind } from "./format";

interface CountUpProps {
  value: number;
  durationMs?: number;
  delayMs?: number;
  format?: NumberFormatKind;
  /** Jump straight to the final value (tap-to-skip). */
  instant?: boolean;
  className?: string;
}

/**
 * Bounded count-up for the run summary. Writes textContent directly inside
 * a short rAF loop, so it never re-renders React and stops by itself.
 */
export function CountUp({
  value,
  durationMs = 1000,
  delayMs = 0,
  format = "int",
  instant = false,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || reduced || value <= 0) {
      el.textContent = formatKind(format, value);
      return;
    }
    el.textContent = formatKind(format, 0);
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatKind(format, value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const timeout = window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs, delayMs, format, instant]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" />
      <span className="sr-only">{formatKind(format, value)}</span>
    </span>
  );
}
