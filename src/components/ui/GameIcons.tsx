"use client";

import { cn } from "./cn";
import { useUid } from "./hooks";

/** Embossed gold coin — the run currency. */
export function CoinIcon({ className }: { className?: string }) {
  const uid = useUid();
  return (
    <svg viewBox="0 0 32 32" className={cn("coin-icon", className)} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${uid}face`} cx="36%" cy="28%" r="78%">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.42" stopColor="#ffcb3d" />
          <stop offset="1" stopColor="#e08400" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="17.4" r="12.6" fill="#9c5200" />
      <circle cx="16" cy="15.6" r="12.6" fill={`url(#${uid}face)`} stroke="#b56400" strokeWidth="1.2" />
      <circle cx="16" cy="15.6" r="9" fill="none" stroke="#fff1a8" strokeOpacity="0.8" strokeWidth="1.3" />
      <path
        d="M16 9.4l1.6 4.6 4.6 1.6-4.6 1.6L16 21.8l-1.6-4.6-4.6-1.6 4.6-1.6z"
        fill="#fff8d8"
        stroke="#c27500"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <ellipse cx="11.4" cy="9.6" rx="3.4" ry="1.6" fill="#fff" opacity="0.45" transform="rotate(-28 11.4 9.6)" />
    </svg>
  );
}

/** Golden Life-Saver key. */
export function KeyIcon({ className }: { className?: string }) {
  const uid = useUid();
  const gold = `url(#${uid}gold)`;
  return (
    <svg viewBox="0 0 32 32" className={cn("key-icon", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${uid}gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2a6" />
          <stop offset="0.5" stopColor="#ffc21a" />
          <stop offset="1" stopColor="#d27c00" />
        </linearGradient>
      </defs>
      <g transform="rotate(-38 16 16)">
        <rect x="14.2" y="14.3" width="14" height="3.6" rx="1.3" fill={gold} stroke="#9c5a00" strokeWidth="1.1" />
        <rect x="21.4" y="17" width="2.6" height="4.4" rx="0.7" fill={gold} stroke="#9c5a00" strokeWidth="1" />
        <rect x="25.2" y="17" width="2.4" height="3.2" rx="0.7" fill={gold} stroke="#9c5a00" strokeWidth="1" />
        <circle cx="9.4" cy="16.1" r="6.4" fill={gold} stroke="#9c5a00" strokeWidth="1.3" />
        <circle cx="9.4" cy="16.1" r="2.5" fill="#4a2400" />
        <circle cx="7.6" cy="13.6" r="1.3" fill="#fff" opacity="0.55" />
      </g>
    </svg>
  );
}
