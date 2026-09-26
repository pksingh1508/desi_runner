"use client";

import { cn, cssVars } from "./cn";
import { useUid } from "./hooks";

/* ------------------------------------------------------------------ Mandala */

const OUTER_PETALS = Array.from({ length: 24 }, (_, i) => i * 15);
const MID_PETALS = Array.from({ length: 12 }, (_, i) => i * 30);
const INNER_PETALS = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

/**
 * Rangoli mandala. Three counter-rotating rings (CSS-driven) — `spin` for a
 * slow ambient ornament, `loader` for the loading spinner.
 */
export function Mandala({
  className,
  motion = "none",
}: {
  className?: string;
  motion?: "none" | "spin" | "loader";
}) {
  const uid = useUid();
  const outer = `${uid}o`;
  const mid = `${uid}m`;
  const inner = `${uid}i`;
  return (
    <svg
      viewBox="0 0 200 200"
      className={cn("mandala", motion !== "none" && `mandala--${motion}`, className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <path id={outer} d="M100 26C95 21 95 13 100 6c5 7 5 15 0 20z" />
        <path id={mid} d="M100 80C88 68 88 50 100 36c12 14 12 32 0 44z" />
        <path id={inner} d="M100 88c-7-8-7-17 0-24 7 7 7 16 0 24z" />
      </defs>
      <g className="mandala__outer">
        {OUTER_PETALS.map((angle) => (
          <use key={`p${angle}`} href={`#${outer}`} transform={`rotate(${angle} 100 100)`} />
        ))}
        {OUTER_PETALS.map((angle) => (
          <circle key={`d${angle}`} cx="100" cy="31" r="2.4" transform={`rotate(${angle + 7.5} 100 100)`} />
        ))}
      </g>
      <circle className="mandala__rim" cx="100" cy="100" r="66" />
      <g className="mandala__mid">
        {MID_PETALS.map((angle) => (
          <use key={angle} href={`#${mid}`} transform={`rotate(${angle} 100 100)`} />
        ))}
      </g>
      <g className="mandala__inner">
        {INNER_PETALS.map((angle) => (
          <use key={angle} href={`#${inner}`} transform={`rotate(${angle} 100 100)`} />
        ))}
      </g>
      <circle className="mandala__core" cx="100" cy="100" r="13" />
      <circle className="mandala__eye" cx="100" cy="100" r="5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Garland */

const SWAG = Array.from({ length: 9 }, (_, i) => {
  const t = (i + 1) / 10;
  return { x: 96 * t, y: 4 + 52 * t - 52 * t * t };
});

function Marigold({ x, y, r, color, edge }: { x: number; y: number; r: number; color: string; edge: string }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={color}
        stroke={edge}
        strokeWidth={r * 0.4}
        strokeDasharray={`${(r * 0.34).toFixed(2)} ${(r * 0.26).toFixed(2)}`}
      />
      <circle cx={x} cy={y} r={r * 0.4} fill={edge} opacity={0.7} />
    </g>
  );
}

/**
 * Marigold toran — swags of genda phool (with hanging drops unless `slim`),
 * tiled through an SVG pattern so it never distorts at any width.
 */
export function Garland({ className, slim = false }: { className?: string; slim?: boolean }) {
  const uid = useUid();
  const height = slim ? 24 : 44;
  return (
    <svg className={cn("garland", slim && "garland--slim", className)} aria-hidden focusable="false">
      <defs>
        <pattern id={`${uid}t`} width="96" height={height} patternUnits="userSpaceOnUse">
          <path d="M0 4Q48 30 96 4" fill="none" stroke="#2f6b2a" strokeWidth="1.3" />
          <path d="M4.5 8.5q2.5-3.2 5.8-2.1-2 3.4-5.8 2.1z" fill="#3f8f33" />
          <path d="M91.5 8.5q-2.5-3.2-5.8-2.1 2 3.4 5.8 2.1z" fill="#3f8f33" />
          {SWAG.map((p, i) => (
            <Marigold
              key={i}
              x={p.x}
              y={p.y}
              r={4.3}
              color={i % 2 === 0 ? "#ffc21a" : "#ff8a1f"}
              edge={i % 2 === 0 ? "#e07b00" : "#c2410c"}
            />
          ))}
          <Marigold x={0} y={4} r={4.9} color="#e4007c" edge="#9a0054" />
          <Marigold x={96} y={4} r={4.9} color="#e4007c" edge="#9a0054" />
          {!slim && (
            <>
              <path d="M48 17V39" stroke="#2f6b2a" strokeWidth="1.1" />
              <Marigold x={48} y={24.6} r={3.5} color="#ff8a1f" edge="#c2410c" />
              <Marigold x={48} y={31.2} r={3.5} color="#ffc21a" edge="#e07b00" />
              <Marigold x={48} y={37.4} r={3.2} color="#ff8a1f" edge="#c2410c" />
              <path d="M48 40.2q2.6 1.6 0 3.6-2.6-2 0-3.6z" fill="#3f8f33" />
            </>
          )}
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${uid}t)`} />
    </svg>
  );
}

/* --------------------------------------------------------------------- Diya */

/** Clay diya with a flickering flame (loading bar head, pause ornament). */
export function Diya({ className }: { className?: string }) {
  const uid = useUid();
  return (
    <svg viewBox="0 0 40 40" className={cn("diya", className)} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${uid}g`}>
          <stop offset="0" stopColor="#ffd766" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8a1f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8763c" />
          <stop offset="1" stopColor="#7d2e10" />
        </linearGradient>
        <linearGradient id={`${uid}f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff7a12" />
          <stop offset="0.55" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#fffbe6" />
        </linearGradient>
      </defs>
      <circle className="diya__glow" cx="20" cy="14" r="14" fill={`url(#${uid}g)`} />
      <g className="diya__flame">
        <path d="M20 4c2.7 3.5 4.1 6.2 4.1 8.6a4.1 4.1 0 0 1-8.2 0C15.9 10.2 17.3 7.5 20 4z" fill={`url(#${uid}f)`} />
      </g>
      <path d="M4.5 22.5h31C34.3 29 28.2 33.4 20 33.4S5.7 29 4.5 22.5z" fill={`url(#${uid}c)`} />
      <path d="M4.5 22.5h31" stroke="#ffb37a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 27.6h18" stroke="#ffd766" strokeOpacity="0.6" strokeWidth="1.3" strokeDasharray="1.4 2.2" strokeLinecap="round" />
    </svg>
  );
}

/* --------------------------------------------------------------- PetalBurst */

const PETAL_COLORS = ["#ffb300", "#ff8a1f", "#e4007c", "#fff4e0", "#ffd766", "#00a6a6"];

/** Deterministic marigold-petal confetti (pure CSS animation). */
export function PetalBurst({ count = 30, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("petals", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 === 0 ? 0.13 : -0.09);
        const dist = 6 + ((i * 37) % 11) * 0.65;
        return (
          <i
            key={i}
            style={cssVars({
              "--dx": `${(Math.cos(angle) * dist).toFixed(2)}rem`,
              "--dy": `${(Math.sin(angle) * dist * 0.72 - 2.2).toFixed(2)}rem`,
              "--rot": `${((i * 73) % 360) - 180}deg`,
              "--delay": `${(i % 6) * 45}ms`,
              "--c": PETAL_COLORS[i % PETAL_COLORS.length],
            })}
          />
        );
      })}
    </div>
  );
}
