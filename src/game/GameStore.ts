import type {
  EventBannerData,
  FeedbackItem,
  GameState,
  HudPowerUp,
  RunResult,
} from "@/types/game";
import { SaveService } from "./core/SaveService";

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
  keys: number;
  muted: boolean;
  countdownValue: number; // 3,2,1 and 0 => "GO"
  runResult: RunResult | null;
  /** Increments each coin pickup so the HUD can spawn a CSS popup. */
  popupSeq: number;

  // ---- V2 ----
  comboCount: number;
  comboMult: number;
  powerups: HudPowerUp[];
  odEnergy: number; // 0..1
  odReady: boolean;
  odActive: boolean;
  odRemaining: number;
  feedback: FeedbackItem[];
  banner: EventBannerData | null;
  sectorName: string;
  shieldActive: boolean;
  /** Bumped whenever persistent meta data changed (run end, equip, unlock). */
  metaVersion: number;
  // ---- Life Saver ----
  reviveCountdown: number;
  runKeysCollected: number;
  // ---- Rocket ----
  rocketActive: boolean;
  rocketTimeLeft: number;
  rocketDuration: number;
}

function initialSnapshot(): HudSnapshot {
  const stats = SaveService.get().stats;
  const save = SaveService.get();
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
    keys: save.keys,
    muted: SaveService.get().settings.muted,
    countdownValue: 3,
    runResult: null,
    popupSeq: 0,
    comboCount: 0,
    comboMult: 1,
    powerups: [],
    odEnergy: 0,
    odReady: false,
    odActive: false,
    odRemaining: 0,
    feedback: [],
    banner: null,
    sectorName: "NEON CITY",
    shieldActive: false,
    metaVersion: 0,
    reviveCountdown: 0,
    runKeysCollected: 0,
    rocketActive: false,
    rocketTimeLeft: 0,
    rocketDuration: 1,
  };
}

const DIFFICULTY_DEFAULT_NAME = "WARM-UP";

/**
 * Bridge between the Three.js simulation and React UI.
 *
 * The engine writes here; React reads via useSyncExternalStore.
 * High-frequency HUD numbers are flushed at ~10Hz instead of per frame,
 * while state transitions propagate immediately. V2 combat state (combo,
 * power-up chips, overdrive meter) rides the same throttled flush.
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

  setCombat(values: {
    comboCount: number;
    comboMult: number;
    powerups: HudPowerUp[];
    odEnergy: number;
    odReady: boolean;
    odActive: boolean;
    odRemaining: number;
    shieldActive: boolean;
    sectorName: string;
  }): void {
    this.patch(values, false);
  }

  setFeedback(feedback: FeedbackItem[], banner: EventBannerData | null): void {
    this.patch({ feedback, banner }, true);
  }

  setCountdown(value: number): void {
    this.patch({ countdownValue: value }, true);
  }

  registerCoinPopup(): void {
    this.patch({ popupSeq: this.snapshot.popupSeq + 1 }, true);
  }

  setKeys(keys: number): void {
    this.patch({ keys }, true);
  }

  setRunKeys(collected: number): void {
    this.patch({ runKeysCollected: collected }, false);
  }

  setReviveCountdown(value: number): void {
    this.patch({ reviveCountdown: value }, true);
  }

  setRocket(active: boolean, timeLeft: number, duration?: number): void {
    this.patch(
      {
        rocketActive: active,
        rocketTimeLeft: timeLeft,
        ...(duration !== undefined ? { rocketDuration: duration } : {}),
      },
      true
    );
  }

  finishRun(result: RunResult, stats: {
    bestScore: number;
    bestDistance: number;
    totalCoins: number;
    keys: number;
  }): void {
    this.patch(
      { runResult: result, ...stats, metaVersion: this.snapshot.metaVersion + 1 },
      true
    );
  }

  clearRunResult(): void {
    this.patch({ runResult: null }, true);
  }

  setMuted(muted: boolean): void {
    SaveService.update((save) => {
      save.settings.muted = muted;
    });
    this.patch({ muted }, true);
  }

  bumpMetaVersion(): void {
    this.patch({ metaVersion: this.snapshot.metaVersion + 1 }, true);
  }
}
