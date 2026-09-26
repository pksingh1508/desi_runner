"use client";

import { cssVars } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { Logo } from "@/components/ui/Logo";
import { Ring } from "@/components/ui/Ring";
import { CurrencyPill } from "../CurrencyPill";
import { levelInfo } from "../meta";

/** Logo lockup + level ring / XP + coin and key wallets. */
export function MenuHeader({ totalCoins, keys }: { totalCoins: number; keys: number }) {
  const level = levelInfo();
  const fraction = level.xpInto / Math.max(level.xpForNext, 1);
  return (
    <header className="menu-top">
      <Logo size="md" className="menu-top__logo" />
      <div className="menu-top__meta">
        <div
          className="lvl"
          title={`Level ${level.level} — ${fmtInt(level.xpInto)} / ${fmtInt(level.xpForNext)} XP`}
        >
          <Ring
            value={fraction}
            thickness={11}
            gradient={["#ffe07a", "#ff6a1f"]}
            label={`Level ${level.level}, ${Math.round(fraction * 100)} percent to next level`}
          >
            <span className="lvl__num" aria-hidden="true">
              <small>LV</small>
              {level.level}
            </span>
          </Ring>
          <span className="lvl__meta" aria-hidden="true">
            <span className="lvl__label">LEVEL {level.level}</span>
            <span className="bar">
              <span className="bar__fill" style={cssVars({ "--v": `${fraction * 100}%` })} />
            </span>
            <span className="lvl__xp">
              {fmtInt(level.xpInto)} / {fmtInt(level.xpForNext)} XP
            </span>
          </span>
        </div>
        <CurrencyPill kind="coin" value={totalCoins} />
        <CurrencyPill kind="key" value={keys} />
      </div>
    </header>
  );
}
