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
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 bg-gradient-to-b from-[#05060e]/70 via-[#0a0714]/85 to-[#05060e]/95 px-6">
      <div className="gameover-enter flex flex-col items-center gap-2">
        {result.isNewBestScore && (
          <span className="new-best-badge font-mono text-[10px] tracking-[0.35em]">
            NEW BEST SCORE
          </span>
        )}
        <h2 className="title-glow-pink text-5xl font-black tracking-[0.3em] sm:text-6xl">
          RUN OVER
        </h2>
      </div>

      <div className="gameover-enter stats-grid grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 font-mono sm:gap-px">
        <Stat label="SCORE" value={result.score.toLocaleString()} accent="text-cyan-200" />
        <Stat label="DISTANCE" value={`${result.distance.toLocaleString()}m`} accent="text-purple-200" />
        <Stat label="COINS" value={`✦ ${result.coins.toLocaleString()}`} accent="text-amber-200" />
        <Stat label="BEST" value={bestScore.toLocaleString()} accent="text-white/90" />
      </div>

      <p className="font-mono text-[10px] tracking-[0.3em] text-white/40">
        BEST DISTANCE {bestDistance.toLocaleString()}m
      </p>

      <div className="gameover-enter-delayed flex w-60 flex-col gap-3">
        <button type="button" onClick={onRestart} className="btn-neon w-full py-3.5 text-base">
          RUN AGAIN
        </button>
        <button type="button" onClick={onMenu} className="btn-ghost w-full py-3">
          MAIN MENU
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-[#0a0c18]/95 px-8 py-3">
      <span className="text-[9px] tracking-[0.35em] text-white/45">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}
