"use client";

import { useEffect, useState } from "react";
import type { RunResult } from "@/types/game";
import { xpRequiredForLevel } from "@/game/config/progression";
import { cssVars } from "@/components/ui/cn";
import { CountUp } from "@/components/ui/CountUp";
import { Icon } from "@/components/ui/Icon";

/**
 * XP geometry across possible level-ups: start = previous position,
 * end = position after all XP is banked.
 */
function xpBarFractions(result: RunResult) {
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
    startFraction: Math.min(1, startFraction),
    endFraction: Math.min(1, xpInto / Math.max(xpRequiredForLevel(level), 1)),
    finalLevel: level,
  };
}

type Phase = 0 | 1 | 2 | 3;

/**
 * XP bar: fills from the old position; on level-up it fills to the brim,
 * flashes LEVEL UP, snaps to zero and fills to the new position. A few
 * timeouts drive it — no per-frame work.
 */
export function XpPanel({ result, skip }: { result: RunResult; skip: boolean }) {
  const { startFraction, endFraction, finalLevel } = xpBarFractions(result);
  const levelsGained = finalLevel - result.previousLevel;
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    if (skip) return;
    const timers = [window.setTimeout(() => setPhase(1), 700)];
    if (levelsGained > 0) {
      timers.push(window.setTimeout(() => setPhase(2), 1700));
      timers.push(window.setTimeout(() => setPhase(3), 1780));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [skip, levelsGained]);

  const current: Phase = skip ? 3 : phase;
  let width = current === 0 ? startFraction : endFraction;
  let animate = !skip;
  if (levelsGained > 0) {
    width = current === 0 ? startFraction : current === 1 ? 1 : current === 2 ? 0 : endFraction;
    animate = !skip && current !== 2;
  }
  const leveledUp = levelsGained > 0 && current >= 2;
  const shownLevel = leveledUp ? finalLevel : result.previousLevel;

  return (
    <section className="xp card" data-levelup={leveledUp} aria-label="Experience">
      <div className="xp__head">
        <span className="xp__level">
          <Icon name="star" /> LEVEL {shownLevel}
        </span>
        {leveledUp && (
          <span className="xp__up">
            LEVEL UP! {result.previousLevel} → {finalLevel}
          </span>
        )}
        <CountUp className="xp__gain" value={result.xpEarned} format="xp" durationMs={900} delayMs={650} instant={skip} />
      </div>
      <span className="bar xp__bar">
        <span
          className="bar__fill"
          data-animate={animate}
          style={cssVars({ "--v": `${width * 100}%` })}
        />
      </span>
    </section>
  );
}
