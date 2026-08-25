"use client";

import { useEffect, useState } from "react";

interface GameHUDProps {
  score: number;
  distance: number;
  coins: number;
  tierName: string;
  tierLabel: string;
  popupSeq: number;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  interactive: boolean;
}

interface Popup {
  id: number;
}

export function GameHUD({
  score,
  distance,
  coins,
  tierName,
  tierLabel,
  popupSeq,
  muted,
  onPause,
  onToggleMute,
  interactive,
}: GameHUDProps) {
  const [popups, setPopups] = useState<Popup[]>([]);

  useEffect(() => {
    if (popupSeq === 0) return;
    // Dedupe by id: StrictMode double-invokes effects, and rapid pickups can
    // commit the same seq twice — keys must stay unique.
    setPopups((current) =>
      current.some((p) => p.id === popupSeq)
        ? current
        : [...current.slice(-4), { id: popupSeq }]
    );
    const id = window.setTimeout(() => {
      setPopups((current) => current.filter((p) => p.id !== popupSeq));
    }, 750);
    return () => window.clearTimeout(id);
  }, [popupSeq]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(0.9rem,env(safe-area-inset-top))] sm:px-7 sm:pt-5">
      {/* Score */}
      <div className="hud-panel px-3 py-2 sm:px-4">
        <div className="font-tech text-[9px] tracking-[0.3em] text-[#d9de7a]/75">SCORE</div>
        <div className="score-value font-tech text-xl tabular-nums text-[#f4f6d0] sm:text-2xl">
          {score.toLocaleString()}
        </div>
      </div>

      {/* Distance + tier */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="hud-panel px-4 py-1.5 text-center">
          <span className="font-tech text-lg tabular-nums text-[#cfe3ae] sm:text-xl">
            {distance.toLocaleString()}
          </span>
          <span className="font-tech ml-1 text-[10px] tracking-widest text-white/50">m</span>
        </div>
        <div className="tier-chip font-tech text-[9px] tracking-[0.3em]">
          {tierLabel} · {tierName}
        </div>
      </div>

      {/* Coins + controls */}
      <div className="flex flex-col items-end gap-1.5">
        <div className="hud-panel relative flex items-center gap-2 px-3 py-2 sm:px-4">
          <span className="coin-icon">✦</span>
          <span className="font-tech text-lg tabular-nums text-[#e8c96a] sm:text-xl">
            {coins.toLocaleString()}
          </span>
          {popups.map((popup) => (
            <span key={popup.id} className="coin-popup font-tech text-xs font-bold text-[#e8c96a]">
              +25
            </span>
          ))}
        </div>
        <div className={`pointer-events-auto flex gap-1.5 ${interactive ? "" : "opacity-50"}`}>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="icon-btn"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button type="button" onClick={onPause} aria-label="Pause" className="icon-btn" disabled={!interactive}>
            ❚❚
          </button>
        </div>
      </div>
    </div>
  );
}
