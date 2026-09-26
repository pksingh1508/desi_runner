"use client";

import type { EventBannerData, FeedbackItem, HudPowerUp } from "@/types/game";
import { IconButton } from "@/components/ui/Button";
import { useCoarsePointer } from "@/components/ui/hooks";
import { Icon } from "@/components/ui/Icon";
import { FeedbackToasts, EventRibbon } from "./hud/FeedbackToasts";
import { HudCenter } from "./hud/HudCenter";
import { ComboChip, HudScore } from "./hud/HudScore";
import { HudWallet } from "./hud/HudWallet";
import { JoshMeter } from "./hud/JoshMeter";
import { PowerUpChips } from "./hud/PowerUpChips";

interface GameHUDProps {
  score: number;
  distance: number;
  coins: number;
  keys: number;
  tierName: string;
  tierLabel: string;
  popupSeq: number;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  interactive: boolean;
  comboCount: number;
  comboMult: number;
  powerups: HudPowerUp[];
  odEnergy: number;
  odReady: boolean;
  odActive: boolean;
  odRemaining: number;
  shieldActive: boolean;
  sectorName: string;
  feedback: FeedbackItem[];
  banner: EventBannerData | null;
  rocketActive: boolean;
  rocketTimeLeft: number;
  rocketDuration: number;
}

/**
 * In-run HUD. Everything hugs the top band and the bottom-left corner so the
 * lanes, the runner and the lower-centre third stay clear. Pointer-events
 * are off except on the two buttons, so swipes reach the game host.
 */
export function GameHUD(props: GameHUDProps) {
  const touch = useCoarsePointer();
  return (
    <div className="hud" data-interactive={props.interactive}>
      <div className="hud-edge hud-edge--shield" data-on={props.shieldActive} aria-hidden="true" />
      <div className="hud-edge hud-edge--josh" data-on={props.odActive} aria-hidden="true" />
      <div className="hud-edge hud-edge--rocket" data-on={props.rocketActive} aria-hidden="true" />

      <div className="hud-grid">
        <HudScore score={props.score} />
        {props.comboCount > 0 && <ComboChip count={props.comboCount} mult={props.comboMult} />}
        <HudCenter
          distance={props.distance}
          tierName={props.tierName}
          tierLabel={props.tierLabel}
          sectorName={props.sectorName}
          rocketActive={props.rocketActive}
          rocketTimeLeft={props.rocketTimeLeft}
          rocketDuration={props.rocketDuration}
        />
        <HudWallet coins={props.coins} keys={props.keys} popupSeq={props.popupSeq} />
        <div className="hud-ctrl hud-area-ctrl">
          <IconButton
            label={props.muted ? "Unmute" : "Mute"}
            icon={<Icon name={props.muted ? "mute" : "volume"} />}
            data-muted={props.muted}
            onClick={props.onToggleMute}
            releaseFocus
          />
          <IconButton
            label="Pause"
            icon={<Icon name="pause" />}
            onClick={props.onPause}
            disabled={!props.interactive}
            releaseFocus
          />
        </div>
        <PowerUpChips
          powerups={props.powerups}
          rocket={
            props.rocketActive ? { timeLeft: props.rocketTimeLeft, duration: props.rocketDuration } : null
          }
        />
      </div>

      <FeedbackToasts items={props.feedback} />
      {props.banner && <EventRibbon key={props.banner.id} text={props.banner.text} />}

      <JoshMeter
        energy={props.odEnergy}
        ready={props.odReady}
        active={props.odActive}
        remaining={props.odRemaining}
        touch={touch}
      />
    </div>
  );
}
