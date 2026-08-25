"use client";

import { useEffect, useState } from "react";

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

/**
 * Development-only diagnostics overlay. Renders nothing in production builds.
 */
export function DebugPanel({ getDebug }: { getDebug: GetDebug }) {
  const isDev = process.env.NODE_ENV === "development";
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!isDev) return;
    const id = window.setInterval(() => {
      if (!open) return;
      setInfo(getDebug());
    }, 300);
    return () => window.clearInterval(id);
  }, [getDebug, isDev, open]);

  if (!isDev || !info || !open) return null;

  return (
    <div className="absolute bottom-3 left-3 z-50 rounded border border-cyan-400/20 bg-black/70 p-2.5 font-mono text-[10px] leading-relaxed text-cyan-100/80 backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-6">
        <span className="tracking-[0.25em] text-cyan-300">DEBUG</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/40 hover:text-white"
          aria-label="Close debug panel"
        >
          ✕
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
    <div className="flex justify-between gap-5">
      <span className="text-white/40">{k}</span>
      <span>{v}</span>
    </div>
  );
}
