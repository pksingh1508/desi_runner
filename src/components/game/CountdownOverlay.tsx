"use client";

import { useEffect, useState } from "react";
import { cssVars } from "@/components/ui/cn";
import { XText } from "@/components/ui/Logo";
import { PetalBurst } from "@/components/ui/Ornaments";

interface CountdownOverlayProps {
  /** 3, 2, 1 — and 0 means GO. */
  value: number;
  visible: boolean;
}

/** "TEEN · DO · EK · BHAAGO!" — Hindi numerals with per-step festival colours. */
const STEPS: Record<number, { hindi: string; word: string; face: string; edge: string; edge2: string; ray: string }> = {
  3: { hindi: "तीन", word: "TEEN", face: "linear-gradient(180deg,#ffffff 0%,#8ff5ea 40%,#00a6a6 100%)", edge: "#004f4f", edge2: "#002a2a", ray: "rgba(0,166,166,0.55)" },
  2: { hindi: "दो", word: "DO", face: "linear-gradient(180deg,#ffffff 0%,#ff9ed0 40%,#e4007c 100%)", edge: "#6d0039", edge2: "#3d0020", ray: "rgba(228,0,124,0.55)" },
  1: { hindi: "एक", word: "EK", face: "linear-gradient(180deg,#ffffff 0%,#ffd08a 40%,#ff8a1f 100%)", edge: "#7a2f04", edge2: "#401802", ray: "rgba(255,138,31,0.6)" },
};

const GO_MS = 950;

export function CountdownOverlay({ value, visible }: CountdownOverlayProps) {
  // Detect the 1 → 0 edge during render; the engine flips to "playing" in
  // the same tick it reports 0, so `visible` alone cannot catch GO.
  const [prev, setPrev] = useState(value);
  const [goSeq, setGoSeq] = useState(0);
  const [goDone, setGoDone] = useState(0);
  if (value !== prev) {
    setPrev(value);
    if (value === 0 && prev === 1) setGoSeq((n) => n + 1);
  }

  useEffect(() => {
    if (goSeq === 0) return;
    const id = window.setTimeout(() => setGoDone(goSeq), GO_MS);
    return () => window.clearTimeout(id);
  }, [goSeq]);

  const step = STEPS[value];
  const showNumber = visible && value > 0 && step;
  const showGo = !showNumber && goSeq > 0 && goDone !== goSeq;
  if (!showNumber && !showGo) return null;

  return (
    <div className="cd" aria-live="assertive">
      {showNumber ? (
        <div
          key={value}
          className="cd__stage"
          style={cssVars({ "--ray": step.ray, "--face": step.face, "--edge": step.edge, "--edge2": step.edge2 })}
        >
          <span className="cd__rays" aria-hidden="true" />
          <XText className="cd__num" text={String(value)} />
          <span className="cd__word" aria-hidden="true">
            <span className="cd__hindi" lang="hi">
              {step.hindi}
            </span>
            <span className="cd__roman">{step.word}</span>
          </span>
        </div>
      ) : (
        <div key={`go-${goSeq}`} className="cd__stage cd__stage--go">
          <span className="cd__rays cd__rays--go" aria-hidden="true" />
          <PetalBurst count={26} />
          <XText className="cd__go" text="BHAAGO!" />
          <span className="cd__go-hi" lang="hi" aria-hidden="true">
            भागो!
          </span>
        </div>
      )}
    </div>
  );
}
