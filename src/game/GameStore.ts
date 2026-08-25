import type { GameState, RunResult } from "@/types/game";
import { StorageService } from "./core/StorageService";

export interface HudSnapshot {
  gameState: GameState;
  loadingProgress: number;
  loadingLabel: string;
  error: string | null;
  score: number;
  distance: number;
  coins: number;
  speedRatio: number;
  tierName: string;
  tierLabel: string;
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  muted: boolean;
  countdownValue: number; // 3,2,1 and 0 => "GO"
  runResult: RunResult | null;
  /** Increments each coin pickup so the HUD can spawn a CSS popup. */
  popupSeq: number;
}

function initialSnapshot(): HudSnapshot {
  const stats = StorageService.getBestStats();
  return {
    gameState: "loading",
    loadingProgress: 0,
    loadingLabel: "BOOTING",
    error: null,
    score: 0,
    distance: 0,
    coins: 0,
    speedRatio: 0,
    tierName: DIFFICULTY_DEFAULT_NAME,
    tierLabel: "I",
    bestScore: stats.bestScore,
    bestDistance: stats.bestDistance,
    totalCoins: stats.totalCoins,
    muted: StorageService.isMuted(),
    countdownValue: 3,
    runResult: null,
    popupSeq: 0,
  };
}

const DIFFICULTY_DEFAULT_NAME = "WARM-UP";

/**
 * Bridge between the Three.js simulation and React UI.
 *
 * The engine writes here; React reads via useSyncExternalStore.
 * High-frequency HUD numbers are flushed at ~10Hz instead of per frame,
 * while state transitions propagate immediately.
 */
export class GameStore {
  private snapshot: HudSnapshot = initialSnapshot();
  private listeners = new Set<() => void>();
  private hudDirty = false;
  private lastFlush = 0;
  /** Monotonic version bumped whenever the snapshot object is replaced. */
  version = 0;

  getSnapshot = (): HudSnapshot => this.snapshot;

  getServerSnapshot = (): HudSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** Replaces the whole snapshot (structural change → notify immediately). */
  private replace(next: HudSnapshot): void {
    this.snapshot = next;
    this.emit();
  }

  private patch(partial: Partial<HudSnapshot>, immediate: boolean): void {
    this.snapshot = { ...this.snapshot, ...partial };
    if (immediate) {
      this.emit();
    } else {
      this.hudDirty = true;
    }
  }

  /** Called by the game loop every frame; throttles HUD-only updates. */
  flush(nowMs: number): void {
    if (!this.hudDirty) return;
    if (nowMs - this.lastFlush < 100) return;
    this.lastFlush = nowMs;
    this.hudDirty = false;
    this.emit();
  }

  setLoading(progress: number, label: string): void {
    this.patch({ loadingProgress: progress, loadingLabel: label }, false);
  }

  setError(message: string): void {
    this.patch({ error: message }, true);
  }

  setState(state: GameState): void {
    this.patch({ gameState: state }, true);
  }

  setHud(values: {
    score: number;
    distance: number;
    coins: number;
    speedRatio: number;
    tierName: string;
    tierLabel: string;
  }): void {
    this.patch(values, false);
  }

  setCountdown(value: number): void {
    this.patch({ countdownValue: value }, true);
  }

  registerCoinPopup(): void {
    this.patch({ popupSeq: this.snapshot.popupSeq + 1 }, true);
  }

  finishRun(result: RunResult, stats: {
    bestScore: number;
    bestDistance: number;
    totalCoins: number;
  }): void {
    this.patch({ runResult: result, ...stats }, true);
  }

  clearRunResult(): void {
    this.patch({ runResult: null }, true);
  }

  setMuted(muted: boolean): void {
    StorageService.setMuted(muted);
    this.patch({ muted }, true);
  }
}
