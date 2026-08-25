"use client";

import { useEffect, useState } from "react";

interface StartScreenProps {
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  muted: boolean;
  onPlay: () => void;
  onToggleMute: () => void;
}

export function StartScreen({
  bestScore,
  bestDistance,
  totalCoins,
  muted,
  onPlay,
  onToggleMute,
}: StartScreenProps) {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-between py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mt-8 flex flex-col items-center gap-3 sm:mt-14">
        <h1 className="title-flicker text-6xl font-black leading-none tracking-[0.3em] sm:text-8xl">
          NEON
        </h1>
        <h1 className="title-glow-pink -mt-2 text-6xl font-black leading-none tracking-[0.5em] sm:text-8xl">
          RUN
        </h1>
        <p className="font-mono text-xs tracking-[0.45em] text-cyan-200/80 sm:text-sm">
          RUN · DODGE · SURVIVE
        </p>
      </div>

      <div className="flex flex-col items-center gap-7">
        <button type="button" onClick={onPlay} className="btn-neon px-14 py-4 text-lg">
          PLAY
        </button>

        {touch ? (
          <p className="text-center font-mono text-[11px] leading-relaxed tracking-widest text-white/60">
            SWIPE ← → TO CHANGE LANES
            <br />
            SWIPE ↑ JUMP · SWIPE ↓ SLIDE
          </p>
        ) : (
          <div className="flex items-center gap-6 font-mono text-[11px] tracking-widest text-white/60">
            <span>
              <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> MOVE
            </span>
            <span>
              <kbd className="kbd">↑</kbd> / <kbd className="kbd">SPACE</kbd> JUMP
            </span>
            <span>
              <kbd className="kbd">↓</kbd> SLIDE
            </span>
          </div>
        )}

        <div className="stats-chip flex items-center gap-5 px-6 py-2 font-mono text-[11px] tracking-widest">
          <span className="text-cyan-200/90">BEST {bestScore.toLocaleString()}</span>
          <span className="text-white/25">|</span>
          <span className="text-purple-200/90">{bestDistance.toLocaleString()}m</span>
          <span className="text-white/25">|</span>
          <span className="text-amber-200/90">✦ {totalCoins.toLocaleString()}</span>
        </div>
      </div>

      <div className="w-full max-w-3xl px-6">
        <p className="mb-2 text-center font-mono text-[9px] tracking-[0.35em] text-white/30">
          A FUTURISTIC ENDLESS SPRINT THROUGH THE GRID
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="icon-btn"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>
    </div>
  );
}
