"use client";

import type { CSSProperties } from "react";
import type { MissionView } from "@/types/game";
import { clamp01, cn, cssVars } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { CoinIcon } from "@/components/ui/GameIcons";

/** Daily mission card: medallion icon, progress bar, rewards, SHABAASH stamp. */
export function MissionCard({
  mission,
  compact = false,
  style,
}: {
  mission: MissionView;
  compact?: boolean;
  style?: CSSProperties;
}) {
  const fraction = clamp01(mission.progress / Math.max(mission.target, 1));
  const shown = Math.min(Math.floor(mission.progress), mission.target);
  return (
    <article
      className={cn("mcard card", compact && "mcard--compact")}
      data-done={mission.completed}
      style={style}
    >
      <span className="mcard__icon" aria-hidden="true">
        {mission.icon}
      </span>
      <div className="mcard__main">
        <h4 className="mcard__title">{mission.title}</h4>
        <p className="mcard__desc">{mission.description}</p>
        <div className="mcard__progress">
          <span
            className={cn("bar", mission.completed && "bar--teal")}
            role="progressbar"
            aria-label={`${mission.title} progress`}
            aria-valuemin={0}
            aria-valuemax={mission.target}
            aria-valuenow={shown}
          >
            <span
              className="bar__fill"
              data-empty={fraction <= 0}
              style={cssVars({ "--v": `${fraction * 100}%` })}
            />
          </span>
          <span className="mcard__count">
            {mission.completed ? "DONE" : `${fmtInt(shown)} / ${fmtInt(mission.target)}`}
          </span>
        </div>
        <div className="mcard__rewards">
          <span className="reward reward--xp">+{fmtInt(mission.rewardXp)} XP</span>
          <span className="reward">
            <CoinIcon />+{fmtInt(mission.rewardCoins)}
          </span>
        </div>
      </div>
      {mission.completed && (
        <span className="stamp mcard__stamp" aria-label="Completed">
          SHABAASH!
        </span>
      )}
    </article>
  );
}
