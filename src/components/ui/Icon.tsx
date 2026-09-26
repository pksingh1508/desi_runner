import type { ReactNode } from "react";
import { cn } from "./cn";

/** Crisp 24×24 stroke icons (currentColor) used across menus and HUD. */
const FILL = { fill: "currentColor", stroke: "none" } as const;

const PATHS = {
  play: <path {...FILL} d="M8 5.3v13.4a1.1 1.1 0 0 0 1.68.93l10.4-6.7a1.1 1.1 0 0 0 0-1.86L9.68 4.37A1.1 1.1 0 0 0 8 5.3z" />,
  pause: (
    <>
      <rect {...FILL} x="6" y="4.5" width="4.3" height="15" rx="1.4" />
      <rect {...FILL} x="13.7" y="4.5" width="4.3" height="15" rx="1.4" />
    </>
  ),
  volume: (
    <>
      <path {...FILL} d="M3.5 9.3v5.4a1 1 0 0 0 1 1h3l4.5 3.8a.8.8 0 0 0 1.3-.6V5.1a.8.8 0 0 0-1.3-.6L7.5 8.3h-3a1 1 0 0 0-1 1z" />
      <path d="M16.3 9.1a4.2 4.2 0 0 1 0 5.8" />
      <path d="M18.9 6.4a8 8 0 0 1 0 11.2" />
    </>
  ),
  mute: (
    <>
      <path {...FILL} d="M3.5 9.3v5.4a1 1 0 0 0 1 1h3l4.5 3.8a.8.8 0 0 0 1.3-.6V5.1a.8.8 0 0 0-1.3-.6L7.5 8.3h-3a1 1 0 0 0-1 1z" />
      <path d="M16.6 9.6l4.8 4.8M21.4 9.6l-4.8 4.8" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.4V6.3l10-2.2v11.2" />
      <circle {...FILL} cx="6.6" cy="17.5" r="2.6" />
      <circle {...FILL} cx="16.6" cy="15.3" r="2.6" />
    </>
  ),
  sfx: <path d="M3 12h1.6M7 8.6v6.8M10.6 5v14M14.2 8v8M17.8 10.2v3.6M21 12h.01" />,
  memes: (
    <>
      <path d="M4.6 4.6h14.8a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-8.3l-4.7 3.5v-3.5H4.6a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z" />
      <path d="M8.2 10.8h.01M12 10.8h.01M15.8 10.8h.01" strokeWidth={3} />
    </>
  ),
  shake: (
    <>
      <rect x="8" y="3.6" width="8" height="16.8" rx="2" />
      <path d="M4.6 8.6v6.8M19.4 8.6v6.8M2 10.6v2.8M22 10.6v2.8" />
    </>
  ),
  perf: (
    <>
      <path d="M4.3 17a8.4 8.4 0 1 1 15.4 0" />
      <path d="M12 15.2l3.9-4.6" />
      <circle {...FILL} cx="12" cy="15.6" r="1.7" />
    </>
  ),
  home: <path d="M3.6 11.3 12 4.2l8.4 7.1M6 9.4V20h4.4v-5.4h3.2V20H18V9.4" />,
  restart: (
    <>
      <path d="M4.7 13.2a7.5 7.5 0 1 0 2.1-6.2" />
      <path d="M4.5 3.9v4.6h4.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.4" width="14" height="10.2" rx="2.6" />
      <path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" />
      <path d="M12 14.4v2.3" />
    </>
  ),
  check: <path d="M5 12.8l4.4 4.4 9.6-9.8" />,
  chevronRight: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  star: <path {...FILL} d="M12 3.2l2.7 5.5 6 .88-4.36 4.24 1.04 6.02L12 17l-5.38 2.84 1.04-6.02L3.3 9.58l6-.88z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle {...FILL} cx="12" cy="12" r="1.5" />
    </>
  ),
  chart: (
    <>
      <path d="M3.8 20.2h16.4" />
      <path d="M6.4 16.6v-4M10.4 16.6V7.2M14.4 16.6v-6.4M18.4 16.6V9.2" />
    </>
  ),
  shirt: <path d="M8.6 3.8 3.9 6.6l1.9 4.2 2.3-1v10.4h7.8V9.8l2.3 1 1.9-4.2-4.7-2.8a3.5 3.5 0 0 1-6.8 0z" />,
  medal: (
    <>
      <path d="M8 3.4h8l-2.6 5.7h-2.8z" />
      <circle cx="12" cy="15" r="5.7" />
      <path {...FILL} d="m12 12.2 1 1.95 2.15.31-1.56 1.52.37 2.14L12 17.1l-1.96 1.02.37-2.14-1.56-1.52 2.15-.31z" />
    </>
  ),
  flame: <path {...FILL} d="M12 21.3c-3.8 0-6.4-2.6-6.4-6.1 0-3 1.9-4.9 3.4-6.7.5 1.3 1.3 2.2 2.3 2.6-.4-2.9.9-5.9 3.4-8 .2 3.2 3.7 5.5 3.7 10.1 0 4.6-2.5 8.1-6.4 8.1z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrowLeft: <path d="M19 12H5.6M11 5.6 4.6 12l6.4 6.4" />,
  arrowRight: <path d="M5 12h13.4M13 5.6l6.4 6.4-6.4 6.4" />,
  arrowUp: <path d="M12 19V5.6M5.6 11 12 4.6l6.4 6.4" />,
  arrowDown: <path d="M12 5v13.4M5.6 13l6.4 6.4 6.4-6.4" />,
  tap: (
    <>
      <circle {...FILL} cx="12" cy="12" r="3.3" />
      <circle cx="12" cy="12" r="7.6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.2s-6.4-5.9-6.4-11a6.4 6.4 0 0 1 12.8 0c0 5.1-6.4 11-6.4 11z" />
      <circle cx="12" cy="10.2" r="2.3" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.6 4h8.8v5.2a4.4 4.4 0 0 1-8.8 0z" />
      <path d="M7.6 6H4.9a3 3 0 0 0 3 4.2M16.4 6h2.7a3 3 0 0 1-3 4.2M12 13.6V17M8.6 20.4h6.8M10 17h4v3.4h-4z" />
    </>
  ),
  road: (
    <>
      <path d="M7 20.5 10 3.5M17 20.5 14 3.5" />
      <path d="M12 6v2.2M12 11v2.4M12 16.4V19" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3.2 2" />
    </>
  ),
  bolt: <path {...FILL} d="M13.3 2.8 4.8 13.6h6.1l-1.2 7.6 8.5-10.8h-6.1z" />,
  sparkle: <path {...FILL} d="M12 2.8c.7 4.6 3 6.9 7.6 7.6-4.6.7-6.9 3-7.6 7.6-.7-4.6-3-6.9-7.6-7.6 4.6-.7 6.9-3 7.6-7.6z" />,
  rocket: (
    <>
      <path d="M12 2.8c3 2.2 4.5 5.4 4.5 9.2v3.6h-9V12c0-3.8 1.5-7 4.5-9.2z" />
      <circle cx="12" cy="9.6" r="1.7" />
      <path d="M7.5 13 5 16v2.6h2.5M16.5 13l2.5 3v2.6h-2.5M10 18.6c0 1.3.8 2.4 2 2.9 1.2-.5 2-1.6 2-2.9" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  className?: string;
  /** Accessible title; icons are decorative (aria-hidden) without it. */
  title?: string;
  strokeWidth?: number;
}

export function Icon({ name, className, title, strokeWidth = 2.1 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("icon", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
