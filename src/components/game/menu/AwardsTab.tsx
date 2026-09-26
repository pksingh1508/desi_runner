"use client";

import type { AchievementView } from "@/types/game";
import { clamp01, cssVars } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { CoinIcon } from "@/components/ui/GameIcons";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/Ring";

/** Achievements as medal cards; completed medals shine gold. */
export function AwardsTab({ achievements }: { achievements: AchievementView[] }) {
  const done = achievements.filter((a) => a.completed).length;
  const total = achievements.length;
  return (
    <div className="tab-stack stagger">
      <header className="tab-head" style={cssVars({ "--i": 0 })}>
        <Ring
          className="tab-head__ring"
          value={total ? done / total : 0}
          thickness={12}
          gradient={["#ffe07a", "#ff8a1f"]}
          label={`${done} of ${total} awards unlocked`}
        >
          <span className="tab-head__ring-num" aria-hidden="true">
            {done}
          </span>
        </Ring>
        <div className="tab-head__text">
          <h2 className="sec-title">
            AWARDS <span className="sec-title__hi" lang="hi">इनाम</span>
            <span className="sec-title__count">
              {done}/{total}
            </span>
          </h2>
          <p className="tab-head__sub">Every medal pays out XP and coins</p>
        </div>
      </header>
      <div className="award-grid stagger" style={cssVars({ "--i": 1 })}>
        {achievements.map((achievement, index) => {
          const fraction = clamp01(achievement.progress / Math.max(achievement.target, 1));
          return (
            <article
              key={achievement.id}
              className="award card"
              data-done={achievement.completed}
              style={cssVars({ "--i": Math.min(index, 12) })}
            >
              <span className="award__medal" aria-hidden="true">
                <span>{achievement.icon}</span>
              </span>
              <div className="award__main">
                <div className="award__head">
                  <h4 className="award__title">{achievement.title}</h4>
                  {achievement.completed && (
                    <span className="award__done">
                      <Icon name="check" /> WON
                    </span>
                  )}
                </div>
                <p className="award__desc">{achievement.description}</p>
                {!achievement.completed && (
                  <span className="bar award__bar" aria-hidden="true">
                    <span
                      className="bar__fill"
                      data-empty={fraction <= 0}
                      style={cssVars({ "--v": `${fraction * 100}%` })}
                    />
                  </span>
                )}
                <div className="award__rewards">
                  <span className="reward reward--xp">+{fmtInt(achievement.rewardXp)} XP</span>
                  <span className="reward">
                    <CoinIcon />+{fmtInt(achievement.rewardCoins)}
                  </span>
                  {!achievement.completed && (
                    <span className="award__count">
                      {fmtInt(Math.min(achievement.progress, achievement.target))} / {fmtInt(achievement.target)}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
