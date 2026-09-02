"use client";

interface ReviveScreenProps {
  keys: number;
  countdown: number;
  onRevive: () => void;
  onSkip: () => void;
}

export function ReviveScreen({ keys, countdown, onRevive, onSkip }: ReviveScreenProps) {
  const canRevive = keys > 0;
  // Progress ring for countdown
  const pct = Math.max(0, Math.min(1, countdown / 6));

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a1628]/68 backdrop-blur-[6px] px-6">
      <div className="hud-panel relative flex w-full max-w-[420px] flex-col items-center gap-5 px-7 py-7 text-center">
        {/* Scanline accent */}
        <div className="pointer-events-none absolute inset-0 rounded-[0.85rem] opacity-[0.06]" style={{ background: `repeating-linear-gradient(180deg, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 4px)` }} />

        <div className="font-retro text-[10px] tracking-[0.35em] text-white/60">YOU CRASHED!</div>

        <div className="relative flex flex-col items-center gap-3">
          <div className="relative">
            {/* Countdown ring */}
            <svg width="96" height="96" className="absolute inset-0 -rotate-90">
              <circle cx="48" cy="48" r="42" stroke="rgba(255,255,255,0.14)" strokeWidth="5" fill="none" />
              <circle
                cx="48"
                cy="48"
                r="42"
                stroke="#fdd013"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct)}`}
                style={{ transition: "stroke-dashoffset 0.25s linear", filter: "drop-shadow(0 0 8px rgba(253,208,19,0.7))" }}
              />
            </svg>
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-[#1e314f] to-[#0f1e32] shadow-[0_0_22px_rgba(253,208,19,0.28), inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/10">
              <span className="font-retro text-4xl leading-none text-white" style={{ WebkitTextStroke: "2px #0f1e32" as unknown as string, paintOrder: "stroke fill" as unknown as string }}>
                {countdown}
              </span>
            </div>
            <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#fdd013] text-[13px] font-black text-[#0f1e32] shadow-[0_0_10px_rgba(253,208,19,0.55)]">
              🔑
            </div>
          </div>

          <h2 className="font-retro text-[20px] font-black leading-none tracking-[0.14em] text-white">LIFE SAVER</h2>
          <p className="font-tech text-[11px] font-semibold tracking-[0.16em] text-white/85">
            USE <span className="text-[#fdd013]">1 KEY</span> TO CONTINUE FROM HERE?
          </p>
          <p className="font-tech text-[10px] tracking-[0.2em] text-white/55">
            YOU HAVE <span className="font-bold text-white">{keys}</span> KEY{keys === 1 ? "" : "S"} · FIND KEYS RANDOMLY ON TRACK
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={onRevive}
            disabled={!canRevive}
            className={`btn-neon flex w-full items-center justify-center gap-2 py-4 text-[12px] font-black ${!canRevive ? "opacity-45 grayscale" : ""}`}
            style={{ filter: canRevive ? undefined : "grayscale(0.6)" }}
          >
            <span className="text-[16px]">🔑</span> USE KEY &amp; CONTINUE
            <span className="rounded-full bg-black/15 px-2 py-0.5 text-[10px] tracking-wide">-1</span>
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost w-full py-3 text-[11px] font-bold tracking-[0.16em] text-white/90">
            NO THANKS
          </button>
          {!canRevive && <p className="font-tech text-[9px] tracking-[0.18em] text-[#ffb84f]">NO KEYS — COLLECT MORE ON TRACK!</p>}
        </div>

        <p className="font-tech text-[8px] tracking-[0.28em] text-white/35">CONTINUES AT SAME SPEED &amp; DISTANCE</p>
      </div>
    </div>
  );
}
