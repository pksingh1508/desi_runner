"use client";

interface LoadingScreenProps {
  progress: number;
  label: string;
  error: string | null;
}

export function LoadingScreen({ progress, label, error }: LoadingScreenProps) {
  const pct = Math.min(100, Math.round(progress * 100));
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#05060e]/92 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <h1 className="title-glow text-5xl font-black tracking-[0.35em] sm:text-6xl">NEON</h1>
        <h1 className="title-glow-pink text-5xl font-black tracking-[0.55em] sm:text-6xl">RUN</h1>
      </div>

      {error ? (
        <p className="max-w-md text-center text-sm leading-relaxed text-red-300">{error}</p>
      ) : (
        <div className="flex w-64 flex-col items-center gap-3 sm:w-80">
          <div className="h-[3px] w-full overflow-hidden rounded bg-white/10">
            <div
              className="loading-bar-fill h-full rounded"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex w-full justify-between font-mono text-[10px] tracking-[0.25em] text-cyan-200/70">
            <span>{label}</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
