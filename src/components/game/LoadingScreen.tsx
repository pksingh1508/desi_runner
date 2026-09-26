"use client";

import { useEffect, useState } from "react";
import { GameButton } from "@/components/ui/Button";
import { cssVars } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Diya, Garland, Mandala } from "@/components/ui/Ornaments";

interface LoadingScreenProps {
  progress: number;
  label: string;
  error: string | null;
}

const TIPS = [
  "Gaay ko rasta do — cows always have right of way. Switch lanes! 🐄",
  "Phaatak down? Jump or slide — never stop running. 🚧",
  "CHUMBAK 🧲 pulls every coin in the galli straight to you.",
  "NIMBU-MIRCHI 🍋 shrugs off one crash. Buri nazar door!",
  "JOSH full? Press E or double-tap and smash through. 🔥",
  "Grab a DIWALI ROCKET 🚀 and fly right over the traffic.",
  "Crashed? A 🔑 key means PICTURE ABHI BAAKI HAI!",
  "CHAI BOOST ☕ — turbo speed, zero brakes.",
  "Near misses charge JOSH faster. Thoda risk toh banta hai!",
  "Autos swerve without warning — keep your eyes on the road. 🛺",
];

const TIP_MS = 3400;

/** Boot screen: logo, spinning rangoli loader, diya progress, rotating tips. */
export function LoadingScreen({ progress, label, error }: LoadingScreenProps) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (error) return;
    const id = window.setInterval(() => setTip((current) => (current + 1) % TIPS.length), TIP_MS);
    return () => window.clearInterval(id);
  }, [error]);

  return (
    <div className="loading" role="status" aria-live="polite" aria-busy={!error}>
      <div className="loading__bg" aria-hidden="true">
        <Mandala className="loading__mandala" />
      </div>
      <Garland className="loading__garland" />

      <div className="loading__center">
        <Logo size="xl" className="loading__logo" />
        <p className="loading__tagline">GALLI GALLI · FULL SPEED</p>

        {error ? (
          <div className="loading__error panel">
            <p className="loading__error-title">ARRE YAAR! Something broke.</p>
            <p className="loading__error-msg">{error}</p>
            <GameButton variant="saffron" size="md" onClick={() => window.location.reload()} icon={<Icon name="restart" />}>
              TRY AGAIN
            </GameButton>
          </div>
        ) : (
          <>
            <div className="loader" aria-hidden="true">
              <Mandala motion="loader" />
            </div>
            <div className="progress" style={cssVars({ "--pct": `${pct}%` })}>
              <div
                className="progress__track"
                role="progressbar"
                aria-label="Loading"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span className="progress__fill" />
                <span className="progress__diya">
                  <Diya />
                </span>
              </div>
              <div className="progress__meta">
                <span>{label}</span>
                <span className="tnum">{pct}%</span>
              </div>
            </div>
            <p className="tip" key={tip}>
              <span className="tip__label">TIP</span>
              {TIPS[tip]}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
