"use client";

import { useEffect, useState } from "react";
import type { FeedbackItem, HudPowerUp } from "@/types/game";

interface GameHUDProps {
  score: number;
  distance: number;
  coins: number;
  keys: number;
  tierName: string;
  tierLabel: string;
  popupSeq: number;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  interactive: boolean;
  // V2
  comboCount: number;
  comboMult: number;
  powerups: HudPowerUp[];
  odEnergy: number;
  odReady: boolean;
  odActive: boolean;
  odRemaining: number;
  shieldActive: boolean;
  sectorName: string;
  feedback: FeedbackItem[];
  banner: { id: number; text: string } | null;
  rocketActive: boolean;
  rocketTimeLeft: number;
  rocketDuration: number;
}

interface Popup {
  id: number;
}

export function GameHUD({
  score,
  distance,
  coins,
  keys,
  tierName,
  tierLabel,
  popupSeq,
  muted,
  onPause,
  onToggleMute,
  interactive,
  comboCount,
  comboMult,
  powerups,
  odEnergy,
  odReady,
  odActive,
  odRemaining,
  sectorName,
  feedback,
  banner,
  rocketActive,
  rocketTimeLeft,
  rocketDuration,
}: GameHUDProps) {
  const [popups, setPopups] = useState<Popup[]>([]);

  useEffect(() => {
    if (popupSeq === 0) return;
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
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* ---------------------------------------------------- top row */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[max(0.9rem,env(safe-area-inset-top))] sm:px-7 sm:pt-5">
        {/* Score + combo */}
        <div className="flex flex-col gap-1.5">
          <div className="hud-panel px-3 py-2 sm:px-4">
            <div className="font-tech text-[9px] tracking-[0.3em] text-[#d9de7a]/75">SCORE</div>
            <div className="score-value font-tech text-xl tabular-nums text-[#f4f6d0] sm:text-2xl">
              {score.toLocaleString()}
            </div>
          </div>
          {comboCount > 0 && (
            <div className="combo-chip hud-panel px-3 py-1" key={comboCount}>
              <span className="combo-value font-tech text-sm tabular-nums text-[#ffb84f]">
                COMBO ×{Math.floor(comboCount)}
              </span>
              {comboMult > 1 && (
                <span className="font-tech ml-1.5 text-[10px] text-[#e8c96a]/90">×{comboMult}</span>
              )}
            </div>
          )}
        </div>

        {/* Distance + tier + sector */}
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
          <div className="sector-chip font-tech hidden text-[8px] tracking-[0.35em] sm:block">
            SECTOR · {sectorName}
          </div>
        </div>

        {/* Coins + keys + powerup chips + controls */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
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
            <div className="hud-panel flex items-center gap-1.5 px-3 py-2">
              <span className="text-[13px] leading-none" style={{ filter: keys > 0 ? "drop-shadow(0 0 6px rgba(253,208,19,0.7))" : undefined }}>
                🔑
              </span>
              <span className="font-tech text-[15px] font-black tabular-nums text-white">{keys}</span>
            </div>
          </div>
          {powerups.map((chip) => (
            <div key={chip.type} className="pw-chip hud-panel flex w-[7.5rem] items-center gap-2 px-2 py-1">
              <span className="pw-icon text-xs" style={{ color: chip.colorHex }}>
                {chip.icon}
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="font-tech text-[8px] tracking-[0.2em]" style={{ color: chip.colorHex }}>
                  {chip.label}
                  {chip.fraction < 1 ? ` ${chip.remaining}s` : ""}
                </span>
                <div className="pw-track">
                  <div
                    className="pw-fill"
                    style={{
                      width: `${chip.fraction * 100}%`,
                      background: chip.colorHex,
                      boxShadow: `0 0 8px ${chip.colorHex}`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
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

      {/* ---------------------------------------------------- rocket timer */}
      {rocketActive && (
        <div className="absolute inset-x-0 top-[4.6rem] flex justify-center sm:top-[5.2rem]">
          <div className="rocket-timer hud-panel w-52 px-5 pb-2.5 pt-2 text-center sm:w-64">
            <div className="font-retro text-[10px] tracking-[0.3em] text-[#ff9a8a]">
              🚀 ROCKET FLIGHT
            </div>
            <div className="rocket-time-value font-retro text-3xl tabular-nums sm:text-4xl">
              {Math.max(0, rocketTimeLeft).toFixed(1)}
              <span className="ml-1 text-sm text-[#ff9a8a]">s</span>
            </div>
            <div className="rocket-track mt-1.5">
              <div
                className="rocket-fill"
                style={{
                  width: `${Math.max(0, Math.min(1, rocketTimeLeft / Math.max(rocketDuration, 0.01))) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- feedback toasts */}
      <div className="absolute inset-x-0 top-[22%] flex flex-col items-center gap-2">
        {feedback.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            <span>{item.text}</span>
            {item.sub && <span className="toast-sub">{item.sub}</span>}
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- event banner */}
      {banner && (
        <div key={banner.id} className="absolute inset-x-0 top-[13%] flex justify-center">
          <div className="event-banner font-retro text-lg tracking-[0.3em] sm:text-xl">{banner.text}</div>
        </div>
      )}

      {/* ---------------------------------------------------- overdrive meter */}
      <div className="absolute inset-x-0 bottom-[max(1.1rem,env(safe-area-inset-bottom))] flex justify-center">
        <div
          className={`od-meter ${odReady ? "od-ready" : ""} ${odActive ? "od-active" : ""}`}
          role="meter"
          aria-valuenow={Math.round(odEnergy * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overdrive energy"
        >
          <span className="od-label font-tech">
            {odActive ? `OVERDRIVE ${Math.ceil(odRemaining)}s` : odReady ? "⚡ OVERDRIVE READY ⚡" : "OVERDRIVE"}
          </span>
          <div className="od-track">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={`od-cell ${odEnergy >= (i + 1) / 10 ? "od-cell-on" : ""}`}
              />
            ))}
          </div>
          {!odReady && !odActive && (
            <span className="od-hint font-tech">E / DOUBLE-TAP</span>
          )}
        </div>
      </div>
    </div>
  );
}
