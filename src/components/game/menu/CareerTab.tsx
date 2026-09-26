"use client";

import type { PlayerStatsData } from "@/types/game";
import { cssVars } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { Ring } from "@/components/ui/Ring";
import { careerGroups, formatDistance, levelInfo } from "../meta";

const ROW_ICON: Record<string, string> = {
  "Total Runs": "🏃",
  Distance: "🛣️",
  Coins: "🪙",
  "Play Time": "⏱️",
  "Missions Done": "🎯",
  Score: "🏆",
  Combo: "🔥",
  "Near Misses": "😰",
  "Perfect Jumps": "🦘",
  "Perfect Slides": "🛷",
  "Power-ups": "⚡",
  "Josh Bursts": "💪",
  Smashes: "💥",
};

/** UI copy overrides for stat labels (none needed today). */
const ROW_LABEL: Record<string, string> = {};

const GROUP_TITLE: Record<string, { title: string; hi?: string }> = {
  CAREER: { title: "SAFAR", hi: "सफ़र" },
  BEST: { title: "PERSONAL BEST" },
  SKILLS: { title: "SKILLS", hi: "हुनर" },
};

/** Lifetime stats: level hero + grouped stat tiles. */
export function CareerTab({ stats }: { stats: PlayerStatsData }) {
  const level = levelInfo();
  const fraction = level.xpInto / Math.max(level.xpForNext, 1);
  const groups = careerGroups(stats);
  return (
    <div className="tab-stack stagger">
      <section className="career-hero card" style={cssVars({ "--i": 0 })} aria-label="Level progress">
        <Ring
          className="career-hero__ring"
          value={fraction}
          thickness={9}
          gradient={["#ffe07a", "#e4007c"]}
          label={`Level ${level.level}`}
        >
          <span className="career-hero__lvl" aria-hidden="true">
            <small>LEVEL</small>
            {level.level}
          </span>
        </Ring>
        <div className="career-hero__body">
          <p className="t-caps">Next level in</p>
          <p className="career-hero__xp">
            {fmtInt(Math.max(0, level.xpForNext - level.xpInto))} <span>XP</span>
          </p>
          <div className="career-hero__facts">
            <span>
              <b>{fmtInt(stats.totalRuns)}</b> runs
            </span>
            <span>
              <b>{formatDistance(stats.totalDistance)}</b> covered
            </span>
          </div>
        </div>
      </section>

      {groups.map((group, index) => {
        const heading = GROUP_TITLE[group.label] ?? { title: group.label };
        return (
          <section key={group.label} className="career-group" style={cssVars({ "--i": index + 1 })}>
            <h3 className="sec-title">
              {heading.title}
              {heading.hi && (
                <span className="sec-title__hi" lang="hi">
                  {heading.hi}
                </span>
              )}
            </h3>
            <div className="career-grid">
              {group.rows.map((row) => (
                <div key={row.label} className="stat-tile">
                  <span className="stat-tile__label">
                    <span className="stat-tile__icon" aria-hidden="true">
                      {ROW_ICON[row.label] ?? "✦"}
                    </span>
                    {ROW_LABEL[row.label] ?? row.label}
                  </span>
                  <span className="stat-tile__value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
