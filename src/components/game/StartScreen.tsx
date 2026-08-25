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
      <div className="scanlines" />
      <div className="mt-8 flex flex-col items-center gap-4 sm:mt-14">
        <h1 className="title-flicker title-glow font-retro text-4xl leading-none sm:text-6xl">
          NEON
        </h1>
        <h1 className="title-gold font-retro text-4xl leading-none sm:text-6xl">
          RUN
        </h1>
        <p className="font-tech mt-2 text-xs tracking-[0.45em] text-[#9fca7d]/90 sm:text-sm">
          RUN · DODGE · SURVIVE
        </p>
      </div>

      <div className="flex flex-col items-center gap-7">
        <button type="button" onClick={onPlay} className="btn-neon px-14 py-4 text-sm">
          PLAY
        </button>

        {touch ? (
          <p className="font-tech text-center text-[11px] leading-relaxed tracking-widest text-white/60">
            SWIPE ← → TO CHANGE LANES
            <br />
            SWIPE ↑ JUMP · SWIPE ↓ SLIDE
          </p>
        ) : (
          <div className="font-tech flex items-center gap-6 text-[11px] tracking-widest text-white/60">
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

        <div className="stats-chip font-tech flex items-center gap-5 px-6 py-2 text-[11px] tracking-widest">
          <span className="text-[#d9de7a]/95">BEST {bestScore.toLocaleString()}</span>
          <span className="text-white/25">|</span>
          <span className="text-[#9fca7d]/95">{bestDistance.toLocaleString()}m</span>
          <span className="text-white/25">|</span>
          <span className="text-[#e8c96a]/95">✦ {totalCoins.toLocaleString()}</span>
        </div>
      </div>

      <div className="w-full max-w-3xl px-6">
        <p className="font-tech mb-2 text-center text-[9px] tracking-[0.35em] text-white/30">
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
