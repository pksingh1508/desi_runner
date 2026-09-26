"use client";

import { useEffect, useState } from "react";
import { GameButton } from "@/components/ui/Button";
import { cssVars } from "@/components/ui/cn";
import { KeyIcon } from "@/components/ui/GameIcons";
import { guardActivationKeys } from "@/components/ui/keyboard";
import { XText } from "@/components/ui/Logo";
import { Ring } from "@/components/ui/Ring";

interface ReviveScreenProps {
  keys: number;
  /** Whole seconds left (engine ticks it once per second). */
  countdown: number;
  totalSeconds: number;
  onRevive: () => void;
  onSkip: () => void;
}

/**
 * Life-Saver offer: "PICTURE ABHI BAAKI HAI!". The key ring always eases
 * toward the *next* whole second over 1 s, so it drains smoothly in sync
 * with the engine's integer countdown without any per-frame React work.
 */
export function ReviveScreen({ keys, countdown, totalSeconds, onRevive, onSkip }: ReviveScreenProps) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const total = Math.max(totalSeconds, 1);
  const ring = armed ? Math.max(0, countdown - 1) / total : Math.min(1, countdown / total);
  const canRevive = keys > 0;
  const urgent = countdown <= 2;

  return (
    <div
      className="overlay overlay--revive"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revive-title"
      onKeyDown={guardActivationKeys}
    >
      <div className="overlay__scrim overlay__scrim--danger" aria-hidden="true" />
      <div className="modal panel panel--gold revive">
        <p className="modal__kicker revive__kicker">DHADAAM! CRASH HO GAYA</p>
        <h2 id="revive-title" className="revive__title">
          <XText text="PICTURE ABHI" srLabel={false} />
          <XText text="BAAKI HAI!" srLabel={false} />
          <span className="sr-only">Picture abhi baaki hai!</span>
        </h2>
        <p className="modal__sub">…mere dost! Spend a Life Saver key and keep running.</p>

        <div className="revive__timer" data-urgent={urgent}>
          <Ring
            value={ring}
            thickness={7}
            gradient={urgent ? ["#ff8cc6", "#e4007c"] : ["#fff1a8", "#ff8a1f"]}
            className="revive__ring"
            style={cssVars({ "--ring-t": "1s" })}
            label={`${countdown} seconds to decide`}
          >
            <span className="revive__center">
              <KeyIcon className="revive__key" />
              <span className="revive__count" key={countdown}>
                {countdown}
              </span>
            </span>
          </Ring>
        </div>

        <p className="revive__keys">
          YOU HAVE <b>{keys}</b> <KeyIcon className="revive__keys-icon" /> {keys === 1 ? "KEY" : "KEYS"}
        </p>

        <div className="modal__actions">
          <GameButton
            variant="marigold"
            size="lg"
            block
            shine={canRevive}
            disabled={!canRevive}
            onClick={onRevive}
            icon={<KeyIcon />}
          >
            USE KEY &amp; CONTINUE <span className="revive__cost">−1</span>
          </GameButton>
          <GameButton variant="ghost" size="md" block onClick={onSkip}>
            NO THANKS
          </GameButton>
        </div>
        {!canRevive && <p className="revive__none">No keys left — grab 🔑 on the track!</p>}
      </div>
    </div>
  );
}
