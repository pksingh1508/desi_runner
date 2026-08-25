"use client";

interface PauseScreenProps {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export function PauseScreen({ onResume, onRestart, onMenu }: PauseScreenProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-[#070b09]/85 backdrop-blur-sm">
      <div className="scanlines" />
      <h2 className="title-glow font-retro text-2xl sm:text-4xl">PAUSED</h2>

      <div className="flex w-60 flex-col gap-3">
        <button type="button" onClick={onResume} className="btn-neon w-full py-4 text-xs">
          RESUME
        </button>
        <button type="button" onClick={onRestart} className="btn-ghost w-full py-3.5 text-[10px]">
          RESTART
        </button>
        <button type="button" onClick={onMenu} className="btn-ghost w-full py-3.5 text-[10px]">
          MAIN MENU
        </button>
      </div>

      <p className="font-tech text-[10px] tracking-[0.3em] text-white/40">
        ESC / P — RESUME
      </p>
    </div>
  );
}
