"use client";

import type { ReactNode } from "react";
import type { CharacterOptionView, MissionView } from "@/types/game";
import { GameButton } from "@/components/ui/Button";
import { cssVars } from "@/components/ui/cn";
import { fmtInt, fmtMeters } from "@/components/ui/format";
import { CoinIcon } from "@/components/ui/GameIcons";
import { Icon } from "@/components/ui/Icon";
import { ControlHints } from "./ControlHints";
import { MissionCard } from "./MissionCard";
import { PowerUpGuide } from "./PowerUpGuide";

interface PlayTabProps {
  equipped: CharacterOptionView;
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  mission: MissionView | null;
  missionsLeft: number;
  touch: boolean;
  onPlay: () => void;
  onOpenGear: () => void;
  onOpenMissions: () => void;
}

/** Home tab: big BHAAGO! CTA, equipped runner, bests, today's mission, controls. */
export function PlayTab(props: PlayTabProps) {
  const { equipped } = props;
  return (
    <div className="play stagger">
      <div className="play-hero" style={cssVars({ "--i": 0 })}>
        <p className="play-kicker">
          <Icon name="sparkle" /> TAIYAAR HO, {equipped.name}? <Icon name="sparkle" />
        </p>
        <GameButton
          variant="saffron"
          size="xl"
          shine
          block
          className="play-cta"
          onClick={props.onPlay}
          aria-label="Bhaago! Start the run"
          icon={<Icon name="play" />}
        >
          BHAAGO!
          <span className="play-cta__hi" lang="hi" aria-hidden="true">
            भागो
          </span>
        </GameButton>
        <p className="play-hint">
          {props.touch ? (
            "TAP BHAAGO TO START"
          ) : (
            <>
              PRESS <kbd className="kbd">ENTER</kbd> OR <kbd className="kbd">SPACE</kbd>
            </>
          )}
        </p>
      </div>

      <div className="play-grid" style={cssVars({ "--i": 1 })}>
        <RunnerCard option={equipped} onChange={props.onOpenGear} />
        <div className="stat-grid">
          <StatTile icon={<Icon name="trophy" />} label="BEST SCORE" value={fmtInt(props.bestScore)} />
          <StatTile icon={<Icon name="road" />} label="BEST RUN" value={fmtMeters(props.bestDistance)} />
          <StatTile icon={<CoinIcon />} label="COINS" value={fmtInt(props.totalCoins)} />
        </div>
      </div>

      {props.mission && (
        <section className="play-mission" style={cssVars({ "--i": 2 })} aria-label="Today's mission">
          <div className="play-sec-head">
            <h3 className="sec-title">
              AAJ KA MISSION
              {props.missionsLeft > 1 && (
                <span className="sec-title__count">+{props.missionsLeft - 1} MORE</span>
              )}
            </h3>
            <button type="button" className="link-btn" onClick={props.onOpenMissions}>
              ALL <Icon name="chevronRight" />
            </button>
          </div>
          <MissionCard mission={props.mission} compact />
        </section>
      )}

      <ControlHints touch={props.touch} style={cssVars({ "--i": 3 })} />
      <PowerUpGuide style={cssVars({ "--i": 4 })} />
    </div>
  );
}

function RunnerCard({ option, onChange }: { option: CharacterOptionView; onChange: () => void }) {
  return (
    <div
      className="runner-card card"
      style={cssVars({ "--accent": option.accentHex, "--grad": option.gradient })}
    >
      <span className="runner-card__portrait" aria-hidden="true">
        <span>{option.icon}</span>
      </span>
      <span className="runner-card__info">
        <span className="t-caps">YOUR RUNNER</span>
        <span className="runner-card__name">
          {option.name}
          {option.hindiName && (
            <span className="runner-card__hi" lang="hi">
              {option.hindiName}
            </span>
          )}
        </span>
        <span className="runner-card__tag">{option.tagline}</span>
      </span>
      <GameButton variant="indigo" size="sm" onClick={onChange} icon={<Icon name="shirt" />}>
        CHANGE
      </GameButton>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">
        <span className="stat-tile__icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span className="stat-tile__value">{value}</span>
    </div>
  );
}
