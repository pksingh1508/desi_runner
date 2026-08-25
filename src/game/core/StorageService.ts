import type { BestStats } from "@/types/game";

const KEYS = {
  bestScore: "neonrun.bestScore",
  bestDistance: "neonrun.bestDistance",
  totalCoins: "neonrun.totalCoins",
  muted: "neonrun.muted",
} as const;

function readNumber(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Math.floor(value)));
  } catch {
    /* storage unavailable (private mode etc.) — persistence is best-effort */
  }
}

export const StorageService = {
  getBestStats(): BestStats {
    return {
      bestScore: readNumber(KEYS.bestScore),
      bestDistance: readNumber(KEYS.bestDistance),
      totalCoins: readNumber(KEYS.totalCoins),
    };
  },

  recordRun(score: number, distance: number, coins: number): BestStats {
    const stats = this.getBestStats();
    const next: BestStats = {
      bestScore: Math.max(stats.bestScore, score),
      bestDistance: Math.max(stats.bestDistance, distance),
      totalCoins: stats.totalCoins + coins,
    };
    writeNumber(KEYS.bestScore, next.bestScore);
    writeNumber(KEYS.bestDistance, next.bestDistance);
    writeNumber(KEYS.totalCoins, next.totalCoins);
    return next;
  },

  isMuted(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(KEYS.muted) === "1";
    } catch {
      return false;
    }
  },

  setMuted(muted: boolean): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEYS.muted, muted ? "1" : "0");
    } catch {
      /* best-effort */
    }
  },
};
