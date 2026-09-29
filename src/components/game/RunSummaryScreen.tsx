"use client";

import { useState, type ReactNode } from "react";
import type { RunResult } from "@/types/game";
import { GameButton } from "@/components/ui/Button";
import { cssVars } from "@/components/ui/cn";
import { CountUp } from "@/components/ui/CountUp";
import { fmtClock, fmtInt, fmtMeters, type NumberFormatKind } from "@/components/ui/format";
import { CoinIcon, KeyIcon } from "@/components/ui/GameIcons";
import { Icon } from "@/components/ui/Icon";
import { guardActivationKeys } from "@/components/ui/keyboard";
import { Garland, PetalBurst } from "@/components/ui/Ornaments";
import { XpPanel } from "./summary/XpPanel";

interface RunSummaryScreenProps {
  result: RunResult;
  bestScore: number;
  bestDistance: number;
  onRestart: () => void;
  onMenu: () => void;
}

type VerdictKind = "record" | "early" | "solid";

function verdictFor(result: RunResult): { kind: VerdictKind; text: string } {
  if (result.isNewBestScore || result.isNewBestDistance) return { kind: "record", text: "LOOKING LIKE A WOW!" };
  if (result.distance < 300) return { kind: "early", text: "ARRE YAAR… PHIR SE!" };
  return { kind: "solid", text: "BAHUT HARD!" };
}

/**
 * Run summary: meme verdict stamp, animated score, hero stats, detail grid,
 * XP bar, rewards. Tapping anywhere skips the count-ups; a new record
 * throws a marigold-petal burst.
 */
export function RunSummaryScreen({ result, bestScore, bestDistance, onRestart, onMenu }: RunSummaryScreenProps) {
  const [skip, setSkip] = useState(false);
  const verdict = verdictFor(result);
  const record = verdict.kind === "record";

  const details: { label: string; value: string; icon: ReactNode }[] = [
    { label: "NEAR MISSES", value: fmtInt(result.nearMisses), icon: "😰" },
    { label: "PERFECT", value: fmtInt(result.perfectJumps + result.perfectSlides), icon: "✨" },
    { label: "SMASHES", value: fmtInt(result.obstaclesSmashed), icon: "💥" },
    { label: "JOSH", value: fmtInt(result.overdrives), icon: "🔥" },
    { label: "POWER-UPS", value: fmtInt(result.powerUps), icon: "⚡" },
    { label: "ROCKETS", value: fmtInt(result.rocketsUsed), icon: "🚀" },
    { label: "KEYS FOUND", value: fmtInt(result.keysCollected), icon: <KeyIcon /> },
    { label: "SAVES", value: fmtInt(result.keysUsed), icon: "🛟" },
    { label: "SURVIVED", value: fmtClock(result.survivalTime), icon: "⏱️" },
  ];

  const stop = (action: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    action();
  };

  return (
    <div
      className="overlay overlay--summary summary scroll-area"
      onClick={() => setSkip(true)}
      onKeyDown={guardActivationKeys}
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-title"
    >
      <div className="summary__col">
        <header className="summary__head">
          <Garland className="summary__garland" />
          {record && <PetalBurst count={34} className="summary__petals" />}
          {record && (
            <span className="summary__record">
              <Icon name="star" /> NEW {result.isNewBestScore ? "HIGH SCORE" : "DISTANCE RECORD"} <Icon name="star" />
            </span>
          )}
          <h2 id="summary-title" className="stamp summary__verdict" data-kind={verdict.kind}>
            {verdict.text}
          </h2>
          <p className="summary__label">RUN SCORE</p>
          <CountUp className="summary__score" value={result.score} durationMs={1300} delayMs={380} instant={skip} />
          <p className="summary__best">
            BEST {fmtInt(bestScore)} · {fmtMeters(bestDistance)}
          </p>
        </header>

        <section className="summary__hero" aria-label="Run stats">
          <HeroStat
            icon={<Icon name="road" />}
            label="DISTANCE"
            value={Math.floor(result.distance)}
            format="meters"
            best={result.isNewBestDistance}
            skip={skip}
            index={0}
          />
          <HeroStat icon={<CoinIcon />} label="COINS" value={result.coins} skip={skip} index={1} />
          <HeroStat icon={<Icon name="flame" />} label="MAX COMBO" value={result.maxCombo} format="combo" skip={skip} index={2} />
        </section>

        <section className="summary__grid" aria-label="Skill breakdown">
          {details.map((detail, index) => (
            <div key={detail.label} className="sum-stat" style={cssVars({ "--i": index })}>
              <span className="sum-stat__icon" aria-hidden="true">
                {detail.icon}
              </span>
              <span className="sum-stat__value">{detail.value}</span>
              <span className="sum-stat__label">{detail.label}</span>
            </div>
          ))}
        </section>

        <XpPanel result={result} skip={skip} />

        {result.missionsCompleted.length > 0 && (
          <RewardBlock title="MISSIONS COMPLETE" tone="teal">
            {result.missionsCompleted.map((mission, index) => (
              <RewardRow
                key={`m${index}`}
                icon={<Icon name="check" />}
                text={mission.title}
                detail={`+${fmtInt(mission.rewardXp)} XP · +${fmtInt(mission.rewardCoins)}`}
              />
            ))}
          </RewardBlock>
        )}
        {result.achievementsCompleted.length > 0 && (
          <RewardBlock title="AWARDS UNLOCKED" tone="gold">
            {result.achievementsCompleted.map((achievement, index) => (
              <RewardRow
                key={`a${index}`}
                icon={achievement.icon}
                text={achievement.title}
                detail={`+${fmtInt(achievement.rewardXp)} XP · +${fmtInt(achievement.rewardCoins)}`}
              />
            ))}
          </RewardBlock>
        )}
        {result.levelUps.length > 0 && (
          <RewardBlock title="LEVEL UP!" tone="rani">
            {result.levelUps.map((levelUp, index) => (
              <RewardRow
                key={`l${index}`}
                icon={<Icon name="star" />}
                text={`LEVEL ${levelUp.from} → ${levelUp.to}`}
                detail={levelUp.rewards
                  .filter((reward) => reward.kind === "coins")
                  .map((reward) => reward.label)
                  .join(" · ")}
              />
            ))}
            {result.unlocks.map((unlock, index) => (
              <RewardRow
                key={`u${index}`}
                icon={unlock.kind === "character" ? "🏃" : "🏅"}
                text={unlock.label}
                detail={unlock.kind === "character" ? "NEW RUNNER" : "NEW BADGE"}
                highlight
              />
            ))}
          </RewardBlock>
        )}

        {/* Sticky: the retry CTA is always one tap away, however long the
            rewards list gets. */}
        <div className="summary__dock">
          <div className="summary__actions">
            <GameButton
              variant="saffron"
              size="lg"
              block
              shine
              onClick={stop(onRestart)}
              icon={<Icon name="restart" />}
            >
              PHIR SE BHAAGO!
            </GameButton>
            <GameButton variant="indigo" size="md" block onClick={stop(onMenu)} icon={<Icon name="home" />}>
              MAIN MENU
            </GameButton>
          </div>
          {!skip && (
            <button type="button" className="summary__skip" onClick={stop(() => setSkip(true))}>
              TAP ANYWHERE TO SKIP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  format = "int",
  best = false,
  skip,
  index,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  format?: NumberFormatKind;
  best?: boolean;
  skip: boolean;
  index: number;
}) {
  return (
    <div className="hero-stat card" data-best={best} style={cssVars({ "--i": index })}>
      <span className="hero-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <CountUp
        className="hero-stat__value"
        value={value}
        format={format}
        durationMs={900}
        delayMs={520 + index * 120}
        instant={skip}
      />
      <span className="hero-stat__label">
        {label}
        {best && <span className="hero-stat__best">BEST!</span>}
      </span>
    </div>
  );
}

function RewardBlock({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "teal" | "gold" | "rani";
  children: ReactNode;
}) {
  return (
    <section className="reward-block card" data-tone={tone} aria-label={title}>
      <h3 className="reward-block__title">{title}</h3>
      <ul className="reward-block__list">{children}</ul>
    </section>
  );
}

function RewardRow({
  icon,
  text,
  detail,
  highlight = false,
}: {
  icon: ReactNode;
  text: string;
  detail?: string;
  highlight?: boolean;
}) {
  return (
    <li className="reward-row" data-highlight={highlight}>
      <span className="reward-row__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="reward-row__text">{text}</span>
      {detail && <span className="reward-row__detail">{detail}</span>}
    </li>
  );
}
