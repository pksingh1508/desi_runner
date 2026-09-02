"use client";

import { useEffect, useRef, useState } from "react";
import type { RunResult } from "@/types/game";
import { xpRequiredForLevel } from "@/game/config/progression";

interface RunSummaryScreenProps {
  result: RunResult;
  bestScore: number;
  bestDistance: number;
  onRestart: () => void;
  onMenu: () => void;
}

/**
 * V2 run summary: animated counters, skill breakdown, XP bar, mission /
 * achievement rewards and level-up reveals. Tapping anywhere skips the
 * count-up animations.
 */
export function RunSummaryScreen({
  result,
  bestScore,
  bestDistance,
  onRestart,
  onMenu,
}: RunSummaryScreenProps) {
  const [skip, setSkip] = useState(false);
  const scoreValue = useCountUp(result.score, 1100, skip);
  const xpValue = useCountUp(result.xpEarned, 900, skip, 500);

  return (
    <div
      className="absolute inset-0 z-40 overflow-y-auto bg-gradient-to-b from-[#070b09]/78 via-[#0a120e]/92 to-[#070b09]/97"
      onClick={() => setSkip(true)}
    >
      <div className="scanlines" />
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="gameover-enter flex flex-col items-center gap-2">
          {(result.isNewBestScore || result.isNewBestDistance) && (
            <span className="new-best-badge font-tech text-[10px] tracking-[0.35em]">
              {result.isNewBestScore ? "NEW RECORD!" : "NEW DISTANCE RECORD!"}
            </span>
          )}
          <h2 className="title-glow title-flicker font-retro text-2xl sm:text-3xl">RUN COMPLETE</h2>
          <div className="score-value font-tech text-5xl tabular-nums text-[#f4f6d0] sm:text-6xl">
            {Math.floor(scoreValue).toLocaleString()}
          </div>
        </div>

        {/* -------------------------------------------------- skill stats */}
        <div className="gameover-enter-delayed hud-panel grid w-full grid-cols-3 gap-x-4 gap-y-2 px-5 py-3">
          <SummaryStat label="DISTANCE" value={`${Math.floor(result.distance).toLocaleString()}m`} accent="text-[#9fca7d]" />
          <SummaryStat label="COINS" value={`✦ ${result.coins.toLocaleString()}`} accent="text-[#e8c96a]" />
          <SummaryStat label="MAX COMBO" value={`×${result.maxCombo}`} accent="text-[#ffb84f]" />
          <SummaryStat label="NEAR MISSES" value={String(result.nearMisses)} />
          <SummaryStat label="PERFECT" value={String(result.perfectJumps + result.perfectSlides)} />
          <SummaryStat label="SMASHES" value={String(result.obstaclesSmashed)} />
          <SummaryStat label="KEYS" value={`🔑 ${result.keysCollected}`} accent="text-[#fdd013]" />
          <SummaryStat label="SAVES" value={String(result.keysUsed)} accent="text-[#7efff5]" />
          <SummaryStat label="ROCKETS" value={`🚀 ${result.rocketsUsed}`} accent="text-[#ff7a6b]" />
          <SummaryStat label="OVERDRIVES" value={String(result.overdrives)} />
          <SummaryStat label="POWER-UPS" value={String(result.powerUps)} />
          <SummaryStat label="SURVIVED" value={`${result.survivalTime}s`} />
        </div>

        {/* ------------------------------------------------------- XP bar */}
        <XPBar result={result} skip={skip} xpShown={xpValue} />

        {/* ------------------------------------------- missions / unlocks */}
        {result.missionsCompleted.length > 0 && (
          <RewardsBlock title="MISSIONS COMPLETE">
            {result.missionsCompleted.map((mission, i) => (
              <RewardRow key={`m${i}`} icon="✓" text={mission.title} detail={`+${mission.rewardXp} XP · +${mission.rewardCoins} ✦`} />
            ))}
          </RewardsBlock>
        )}
        {result.achievementsCompleted.length > 0 && (
          <RewardsBlock title="ACHIEVEMENTS UNLOCKED">
            {result.achievementsCompleted.map((achievement, i) => (
              <RewardRow key={`a${i}`} icon={achievement.icon} text={achievement.title} detail={`+${achievement.rewardXp} XP · +${achievement.rewardCoins} ✦`} />
            ))}
          </RewardsBlock>
        )}
        {result.levelUps.length > 0 && (
          <RewardsBlock title="LEVEL UP!">
            {result.levelUps.map((levelUp, i) => (
              <RewardRow
                key={`l${i}`}
                icon="★"
                text={`LEVEL ${levelUp.from} → ${levelUp.to}`}
                detail={levelUp.rewards.map((r) => r.label).join(" · ")}
              />
            ))}
          </RewardsBlock>
        )}

        {/* ------------------------------------------------------ buttons */}
        <div className="gameover-enter-delayed flex w-64 flex-col gap-3 pb-4 pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
            className="btn-neon w-full py-4 text-xs"
          >
            RUN AGAIN
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
            className="btn-ghost w-full py-3.5 text-[10px]"
          >
            MAIN MENU
          </button>
          {!skip && (
            <button type="button" onClick={() => setSkip(true)} className="font-tech text-[8px] tracking-[0.3em] text-white/30 hover:text-white/60">
              TAP TO SKIP ANIMATIONS
            </button>
          )}
        </div>

        <p className="font-tech pb-2 text-[9px] tracking-[0.3em] text-white/30">
          BEST {bestScore.toLocaleString()} · {bestDistance.toLocaleString()}m
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- pieces

function SummaryStat({ label, value, accent = "text-white/85" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-tech text-[8px] tracking-[0.28em] text-white/40">{label}</span>
      <span className={`font-tech text-sm tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}

function XPBar({ result, skip, xpShown }: { result: RunResult; skip: boolean; xpShown: number }) {
  const { startFraction, endFraction, finalLevel } = xpBarFractions(result);

  return (
    <div className="gameover-enter-delayed hud-panel w-full px-5 py-3">
      <div className="flex items-baseline justify-between">
        <span className="font-tech text-[10px] tracking-[0.25em] text-[#d9de7a]/90">
          LEVEL {finalLevel}
        </span>
        <span className="font-tech text-sm tabular-nums text-[#e8c96a]">
          +{Math.floor(xpShown).toLocaleString()} XP
        </span>
      </div>
      <div className="xp-track mt-2 h-2">
        <div
          className="xp-fill transition-all duration-700 ease-out"
          style={{ width: `${(skip ? endFraction : startFraction) * 100}%` }}
        />
      </div>
    </div>
  );
}

function useCountUpSafe(target: number): number {
  return target;
}

/**
 * Computes XP-bar geometry across possible intermediate level-ups:
 * start = previous position, end = position after all XP is banked.
 */
function xpBarFractions(result: RunResult): {
  startFraction: number;
  endFraction: number;
  finalLevel: number;
} {
  let level = result.previousLevel;
  let xpInto = result.previousXp;
  const startFraction = xpInto / Math.max(xpRequiredForLevel(level), 1);
  let remaining = result.xpEarned;
  let guard = 0;
  while (guard++ < 60 && remaining > 0) {
    const needed = xpRequiredForLevel(level) - xpInto;
    if (remaining >= needed) {
      remaining -= needed;
      level += 1;
      xpInto = 0;
    } else {
      xpInto += remaining;
      remaining = 0;
    }
  }
  return {
    startFraction,
    endFraction: xpInto / Math.max(xpRequiredForLevel(level), 1),
    finalLevel: level,
  };
}

function RewardsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gameover-enter-delayed hud-panel w-full px-5 py-3">
      <div className="font-tech mb-2 text-center text-[9px] tracking-[0.35em] text-[#ffb84f]">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function RewardRow({ icon, text, detail }: { icon: string; text: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/5 py-1 first:border-t-0">
      <span className="w-5 text-center text-[13px] text-[#d9de7a]">{icon}</span>
      <span className="font-tech min-w-0 flex-1 truncate text-[10px] tracking-wider text-[#eef3e4]/90">
        {text}
      </span>
      {detail && <span className="font-tech whitespace-nowrap text-[9px] text-[#e8c96a]/90">{detail}</span>}
    </div>
  );
}

/** requestAnimationFrame-driven count-up; snaps to the target when skipped. */
function useCountUp(target: number, durationMs: number, skipped: boolean, delayMs = 150): number {
  const [value, setValue] = useState(skipped ? target : 0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (skipped) {
      setValue(target);
      return;
    }
    let start: number | null = null;
    const timeoutId = window.setTimeout(() => {
      const tick = (now: number) => {
        if (start === null) start = now;
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(target * eased);
        if (t < 1) frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs, skipped, delayMs]);

  return value;
}
