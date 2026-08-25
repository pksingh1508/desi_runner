"use client";

import type { RunResult } from "@/types/game";

interface GameOverScreenProps {
  result: RunResult;
  bestScore: number;
  bestDistance: number;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverScreen({
  result,
  bestScore,
  bestDistance,
  onRestart,
  onMenu,
}: GameOverScreenProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 bg-gradient-to-b from-[#070b09]/75 via-[#0a120e]/88 to-[#070b09]/95 px-6">
      <div className="scanlines" />
      <div className="gameover-enter flex flex-col items-center gap-3">
        {result.isNewBestScore && (
          <span className="new-best-badge font-tech text-[10px] tracking-[0.35em]">
            NEW BEST SCORE
          </span>
        )}
        <h2 className="title-glow title-flicker font-retro text-3xl sm:text-5xl">
          RUN OVER
        </h2>
      </div>

      <div className="gameover-enter stats-grid font-tech grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
        <Stat label="SCORE" value={result.score.toLocaleString()} accent="text-[#d9de7a]" />
        <Stat label="DISTANCE" value={`${result.distance.toLocaleString()}m`} accent="text-[#9fca7d]" />
        <Stat label="COINS" value={`✦ ${result.coins.toLocaleString()}`} accent="text-[#e8c96a]" />
        <Stat label="BEST" value={bestScore.toLocaleString()} accent="text-[#f2ead3]" />
      </div>

      <p className="font-tech text-[10px] tracking-[0.3em] text-white/40">
        BEST DISTANCE {bestDistance.toLocaleString()}m
      </p>

      <div className="gameover-enter-delayed flex w-64 flex-col gap-3">
        <button type="button" onClick={onRestart} className="btn-neon w-full py-4 text-xs">
          RUN AGAIN
        </button>
        <button type="button" onClick={onMenu} className="btn-ghost w-full py-3.5 text-[10px]">
          MAIN MENU
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-[#0b120e]/95 px-8 py-3">
      <span className="text-[9px] tracking-[0.35em] text-white/45">{label}</span>
      <span className={`text-xl tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}
