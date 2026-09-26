"use client";

import { useEffect, useEffectEvent, useState } from "react";

interface DebugInfo {
  fps: number;
  drawCalls: number;
  triangles: number;
  speed: string;
  lane: number;
  state: string;
  distance: number;
  obstacles: number;
  coinsActive: number;
  usingFallback: boolean;
}

type GetDebug = () => DebugInfo | null;

const SMALL_SCREEN = "(max-width: 900px), (max-height: 520px)";

/**
 * Development-only diagnostics overlay. Renders nothing in production builds.
 * Collapses to a small FPS chip (default on small screens) so it never hides
 * the game UI; tap to expand again.
 */
export function DebugPanel({ getDebug }: { getDebug: GetDebug }) {
  const isDev = process.env.NODE_ENV === "development";
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [expanded, setExpanded] = useState(
    () => typeof window !== "undefined" && !window.matchMedia(SMALL_SCREEN).matches
  );

  // getDebug is a fresh closure every parent render (10 Hz in play); an
  // Effect Event keeps the interval stable instead of resetting it.
  const readDebug = useEffectEvent(() => setInfo(getDebug()));

  useEffect(() => {
    if (!isDev) return;
    const id = window.setInterval(readDebug, expanded ? 300 : 1000);
    return () => window.clearInterval(id);
  }, [isDev, expanded]);

  if (!isDev || !info) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="debug-chip"
        onClick={() => setExpanded(true)}
        aria-label="Show debug panel"
      >
        DBG {info.fps}
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-panel__head">
        <span>DEBUG</span>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Collapse debug panel">
          –
        </button>
      </div>
      <Row k="FPS" v={String(info.fps)} />
      <Row k="Draws" v={String(info.drawCalls)} />
      <Row k="Tris" v={info.triangles.toLocaleString()} />
      <Row k="Speed" v={`${info.speed} u/s`} />
      <Row k="Lane" v={["L", "C", "R"][info.lane] ?? "?"} />
      <Row k="State" v={info.state} />
      <Row k="Dist" v={`${info.distance}m`} />
      <Row k="Obst" v={String(info.obstacles)} />
      <Row k="Coins" v={String(info.coinsActive)} />
      {info.usingFallback && <Row k="Model" v="FALLBACK BOT" />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="debug-panel__row">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
