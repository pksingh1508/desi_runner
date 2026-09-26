"use client";

import { GameButton } from "@/components/ui/Button";
import { fmtInt, fmtMeters } from "@/components/ui/format";
import { CoinIcon } from "@/components/ui/GameIcons";
import { Icon } from "@/components/ui/Icon";
import { guardActivationKeys } from "@/components/ui/keyboard";
import { XText } from "@/components/ui/Logo";
import { Garland, Mandala } from "@/components/ui/Ornaments";
import { SettingsBar } from "./SettingsBar";
import type { SettingsActions, SettingsView } from "./settings";

interface PauseScreenProps {
  score: number;
  distance: number;
  coins: number;
  settings: SettingsView;
  settingsActions: SettingsActions;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

const AUDIO_ONLY = ["sound", "music", "voice"] as const;

/** "RUKO ZARA!" pause card with the current run, quick audio toggles. */
export function PauseScreen(props: PauseScreenProps) {
  return (
    <div
      className="overlay overlay--pause"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      onKeyDown={guardActivationKeys}
    >
      <div className="overlay__scrim" aria-hidden="true" />
      <div className="modal panel panel--gold">
        <Garland className="modal__garland" />
        <div className="modal__mandala" aria-hidden="true">
          <Mandala />
        </div>
        <p className="modal__kicker">GAME PAUSED</p>
        <h2 id="pause-title" className="modal__title">
          <XText text="RUKO ZARA!" />
        </h2>
        <p className="modal__sub">Sabar karo — the galli will wait for you.</p>

        <dl className="pause-stats">
          <div>
            <dt>SCORE</dt>
            <dd>{fmtInt(props.score)}</dd>
          </div>
          <div>
            <dt>DISTANCE</dt>
            <dd>{fmtMeters(props.distance)}</dd>
          </div>
          <div>
            <dt>COINS</dt>
            <dd>
              <CoinIcon className="pause-stats__coin" />
              {fmtInt(props.coins)}
            </dd>
          </div>
        </dl>

        <div className="modal__actions">
          <GameButton variant="saffron" size="lg" block shine onClick={props.onResume} icon={<Icon name="play" />}>
            RESUME
          </GameButton>
          <div className="modal__row">
            <GameButton variant="indigo" size="md" block onClick={props.onRestart} icon={<Icon name="restart" />}>
              RESTART
            </GameButton>
            <GameButton variant="ghost" size="md" block onClick={props.onMenu} icon={<Icon name="home" />}>
              MENU
            </GameButton>
          </div>
        </div>

        <SettingsBar
          className="modal__settings"
          settings={props.settings}
          actions={props.settingsActions}
          only={AUDIO_ONLY}
        />

        <p className="modal__hint">
          <kbd className="kbd">ESC</kbd> / <kbd className="kbd">P</kbd> TO RESUME
        </p>
      </div>
    </div>
  );
}
