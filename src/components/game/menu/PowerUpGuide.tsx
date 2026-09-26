import type { CSSProperties } from "react";
import type { PowerUpType } from "@/types/game";
import { POWERUP_DEFS } from "@/game/config/powerups";
import { cssVars } from "@/components/ui/cn";

const ORDER: PowerUpType[] = ["magnet", "shield", "scoreMultiplier", "turbo"];

const BLURB: Record<PowerUpType, string> = {
  magnet: "Pulls in every coin",
  shield: "Shrugs off one crash",
  scoreMultiplier: "Double score",
  turbo: "Turbo speed, smash through",
};

const EXTRAS = [
  { key: "rocket", icon: "🚀", label: "DIWALI ROCKET", blurb: "Fly above the traffic", color: "#ff5a1f" },
  { key: "key", icon: "🔑", label: "LIFE SAVER", blurb: "Spend a key to revive", color: "#ffc21a" },
] as const;

/** Quick legend of the desi power-ups (names/icons come from engine config). */
export function PowerUpGuide({ style }: { style?: CSSProperties }) {
  return (
    <section className="pguide" style={style} aria-label="Power-ups">
      <h3 className="sec-title">
        DESI POWER-UPS <span className="sec-title__hi" lang="hi">जुगाड़</span>
      </h3>
      <ul className="pguide__list">
        {ORDER.map((type) => {
          const def = POWERUP_DEFS[type];
          return (
            <li key={type} className="pguide__item" style={cssVars({ "--c": def.colorHex })}>
              <span className="pguide__icon" aria-hidden="true">
                {def.icon}
              </span>
              <span className="pguide__text">
                <span className="pguide__name">{def.label}</span>
                <span className="pguide__blurb">{BLURB[type]}</span>
              </span>
            </li>
          );
        })}
        {EXTRAS.map((extra) => (
          <li key={extra.key} className="pguide__item" style={cssVars({ "--c": extra.color })}>
            <span className="pguide__icon" aria-hidden="true">
              {extra.icon}
            </span>
            <span className="pguide__text">
              <span className="pguide__name">{extra.label}</span>
              <span className="pguide__blurb">{extra.blurb}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
