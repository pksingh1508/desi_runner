import type { HudPowerUp } from "@/types/game";
import { cssVars } from "@/components/ui/cn";
import { Ring } from "@/components/ui/Ring";

interface RocketChip {
  timeLeft: number;
  duration: number;
}

/**
 * Active power-ups (CHUMBAK, NIMBU-MIRCHI, DOUBLE DHAMAKA, CHAI BOOST) as
 * ring timers. The ring blinks in the last two seconds; the shield has no
 * timer ("1 HIT"). On phones the DIWALI ROCKET joins this stack as a chip
 * (the wide fuse lives in the centre cluster on larger screens).
 */
export function PowerUpChips({ powerups, rocket }: { powerups: HudPowerUp[]; rocket: RocketChip | null }) {
  return (
    <div className="pups hud-area-pups">
      {rocket && (
        <div
          className="pup pup--rocket"
          data-low={rocket.timeLeft <= 1.5}
          style={cssVars({ "--c": "#ff6a1f" })}
          title="Diwali rocket"
        >
          <span className="pup__text" aria-hidden="true">
            <span className="pup__label">ROCKET</span>
            <span className="pup__time">{Math.max(0, rocket.timeLeft).toFixed(1)}s</span>
          </span>
          <Ring value={rocket.timeLeft / Math.max(rocket.duration, 0.01)} thickness={12} className="pup__ring">
            <span className="pup__icon" aria-hidden="true">
              🚀
            </span>
          </Ring>
        </div>
      )}
      {powerups.map((chip) => {
        const untimed = chip.remaining <= 0 && chip.fraction >= 1;
        const low = !untimed && chip.remaining <= 2;
        return (
          <div
            key={chip.type}
            className="pup"
            data-low={low}
            style={cssVars({ "--c": chip.colorHex })}
            title={chip.label}
          >
            <span className="pup__text" aria-hidden="true">
              <span className="pup__label">{chip.label}</span>
              <span className="pup__time">{untimed ? "1 HIT" : `${chip.remaining}s`}</span>
            </span>
            <Ring value={untimed ? 1 : chip.fraction} thickness={12} className="pup__ring">
              <span className="pup__icon" aria-hidden="true">
                {chip.icon}
              </span>
            </Ring>
          </div>
        );
      })}
    </div>
  );
}
