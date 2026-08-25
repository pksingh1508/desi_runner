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
        <span key={value} className="countdown-pop font-retro text-7xl text-[#d9de7a] sm:text-8xl">
          {value}
        </span>
      ) : showGo ? (
        <span className="countdown-go font-retro text-6xl tracking-[0.2em] text-[#e8c96a] sm:text-7xl">
          GO!
        </span>
      ) : null}
    </div>
  );
}
