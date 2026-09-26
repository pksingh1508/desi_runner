import { OVERDRIVE_CFG } from "@/game/systems/OverdriveSystem";
import { cssVars } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/Ring";

const SPARKS = Array.from({ length: 8 }, (_, i) => i);

interface JoshMeterProps {
  energy: number;
  ready: boolean;
  active: boolean;
  remaining: number;
  touch: boolean;
}

/**
 * JOSH (overdrive) gauge, bottom-left so the lanes stay clear. Charging →
 * ready (glow + sparks + trigger hint) → active (ring drains over 6 s).
 */
export function JoshMeter({ energy, ready, active, remaining, touch }: JoshMeterProps) {
  const state = active ? "active" : ready ? "ready" : "charging";
  const value = active ? remaining / OVERDRIVE_CFG.duration : energy;
  return (
    <div
      className="josh"
      data-state={state}
      role="meter"
      aria-label="Josh meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(energy * 100)}
    >
      <div className="josh__gauge">
        {state === "ready" && (
          <span className="josh__sparks" aria-hidden="true">
            {SPARKS.map((i) => (
              <i key={i} style={cssVars({ "--a": `${i * 45}deg`, "--d": `${i * 110}ms` })} />
            ))}
          </span>
        )}
        <Ring
          value={value}
          thickness={11}
          gradient={active ? ["#fff1a8", "#e4007c"] : ["#ffd766", "#ff5a1f"]}
          className="josh__ring"
        >
          <Icon name="flame" className="josh__flame" />
        </Ring>
      </div>
      <div className="josh__text" aria-hidden="true">
        <span className="josh__title">JOSH</span>
        <span className="josh__sub">
          {active ? (
            `FULL JOSH · ${Math.max(0, Math.ceil(remaining))}s`
          ) : ready ? (
            touch ? (
              "DOUBLE-TAP!"
            ) : (
              <>
                PRESS <kbd className="kbd">E</kbd>
              </>
            )
          ) : (
            `${Math.floor(energy * 100)}%`
          )}
        </span>
      </div>
    </div>
  );
}
