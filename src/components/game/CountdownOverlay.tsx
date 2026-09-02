"use client";

import { useEffect, useState } from "react";

interface CountdownOverlayProps {
  /** 3, 2, 1 — and 0 means GO! */
  value: number;
  visible: boolean;
}

export function CountdownOverlay({ value, visible }: CountdownOverlayProps) {
  const [showGo, setShowGo] = useState(false);

  useEffect(() => {
    if (!visible || value !== 0) return;
    setShowGo(true);
    const id = window.setTimeout(() => setShowGo(false), 700);
    return () => window.clearTimeout(id);
  }, [value, visible]);

  if (!visible && !showGo) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      {value > 0 ? (
        <div key={value} className="countdown-plate">
          <span className="countdown-pop font-retro text-7xl sm:text-8xl">{value}</span>
        </div>
      ) : showGo ? (
        <div className="countdown-plate countdown-plate-go">
          <span className="countdown-go font-retro text-6xl tracking-[0.2em] sm:text-7xl">GO!</span>
        </div>
      ) : null}
    </div>
  );
}
