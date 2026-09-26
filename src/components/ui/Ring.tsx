"use client";

import type { CSSProperties, ReactNode } from "react";
import { clamp01, cn } from "./cn";
import { useUid } from "./hooks";

interface RingProps {
  /** 0..1 */
  value: number;
  className?: string;
  style?: CSSProperties;
  /** Stroke thickness in viewBox units (ring is 100×100). */
  thickness?: number;
  /** Optional two-stop gradient stroke. */
  gradient?: readonly [string, string];
  /** Accessible label; decorative when omitted. */
  label?: string;
  children?: ReactNode;
}

/**
 * SVG progress ring. Values arrive at ~10 Hz from the store; the CSS
 * stroke-dashoffset transition interpolates between them smoothly.
 */
export function Ring({ value, className, style, thickness = 10, gradient, label, children }: RingProps) {
  const uid = useUid();
  const v = clamp01(value);
  const r = 50 - thickness / 2;
  return (
    <span
      className={cn("ring", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg className="ring__svg" viewBox="0 0 100 100" aria-hidden focusable="false">
        {gradient && (
          <defs>
            <linearGradient id={`${uid}rg`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={gradient[0]} />
              <stop offset="1" stopColor={gradient[1]} />
            </linearGradient>
          </defs>
        )}
        <circle className="ring__track" cx="50" cy="50" r={r} strokeWidth={thickness} fill="none" />
        <circle
          className="ring__bar"
          cx="50"
          cy="50"
          r={r}
          strokeWidth={thickness}
          fill="none"
          pathLength={100}
          strokeDasharray="100 100"
          strokeLinecap="round"
          data-empty={v <= 0.004}
          style={{
            strokeDashoffset: 100 - v * 100,
            stroke: gradient ? `url(#${uid}rg)` : undefined,
          }}
        />
      </svg>
      {children !== undefined && <span className="ring__center">{children}</span>}
    </span>
  );
}
