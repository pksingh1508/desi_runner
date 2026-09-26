import { cssVars } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { Icon } from "@/components/ui/Icon";
import { RocketTimer } from "./RocketTimer";

/** Difficulty tier accent: CHALTA HAI → TEZ → TOOFAN → BAWAAL. */
const TIER_COLOR: Record<string, string> = {
  I: "#4de3d4",
  II: "#ffd766",
  III: "#ff8a1f",
  IV: "#ff5cae",
};

interface HudCenterProps {
  distance: number;
  tierName: string;
  tierLabel: string;
  sectorName: string;
  rocketActive: boolean;
  rocketTimeLeft: number;
  rocketDuration: number;
}

/** Distance + tier chip + sector (swapped for the rocket fuse while flying). */
export function HudCenter(props: HudCenterProps) {
  return (
    <div className="hud-center hud-area-center">
      <div className="hud-dist">
        <span className="hud-dist__value">{fmtInt(props.distance)}</span>
        <span className="hud-dist__unit">m</span>
      </div>
      <span
        className="tier"
        key={`tier-${props.tierLabel}`}
        style={cssVars({ "--tc": TIER_COLOR[props.tierLabel] ?? "#ffd766" })}
      >
        <span className="tier__num">{props.tierLabel}</span>
        {props.tierName}
      </span>
      {props.rocketActive ? (
        <RocketTimer timeLeft={props.rocketTimeLeft} duration={props.rocketDuration} />
      ) : (
        props.sectorName && (
          <span className="sector" key={`sector-${props.sectorName}`}>
            <Icon name="pin" />
            {props.sectorName}
          </span>
        )
      )}
    </div>
  );
}
