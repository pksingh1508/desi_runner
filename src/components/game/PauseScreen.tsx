"use client";

interface PauseScreenProps {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export function PauseScreen({ onResume, onRestart, onMenu }: PauseScreenProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-[#05060e]/80 backdrop-blur-sm">
      <h2 className="title-glow text-4xl font-black tracking-[0.45em] sm:text-5xl">PAUSED</h2>

      <div className="flex w-56 flex-col gap-3">
        <button type="button" onClick={onResume} className="btn-neon w-full py-3">
          RESUME
        </button>
        <button type="button" onClick={onRestart} className="btn-ghost w-full py-3">
          RESTART
        </button>
        <button type="button" onClick={onMenu} className="btn-ghost w-full py-3">
          MAIN MENU
        </button>
      </div>

      <p className="font-mono text-[10px] tracking-[0.3em] text-white/40">
        ESC / P — RESUME
      </p>
    </div>
  );
}
