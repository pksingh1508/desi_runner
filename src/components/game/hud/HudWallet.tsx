"use client";

import { useState } from "react";
import { CurrencyPill } from "../CurrencyPill";

/**
 * Run coins + Life-Saver keys. Each pickup (popupSeq) re-mounts the coin
 * icon (bump) and a "+1" floater — pure CSS, no timers.
 */
export function HudWallet({ coins, keys, popupSeq }: { coins: number; keys: number; popupSeq: number }) {
  const [baseSeq] = useState(popupSeq);
  const pickedUp = popupSeq !== baseSeq;
  return (
    <div className="hud-wallet hud-area-wallet">
      <CurrencyPill kind="coin" value={coins} className="hud-pill" iconKey={popupSeq}>
        {pickedUp && (
          <span key={`float-${popupSeq}`} className="coin-float" aria-hidden="true">
            +1
          </span>
        )}
      </CurrencyPill>
      <CurrencyPill kind="key" value={keys} className="hud-pill" iconKey={keys} />
    </div>
  );
}
