import type { PlayerStatsData } from "@/types/game";

/**
 * Versioned local persistence (SaveDataV2). Migrates legacy V1 keys
 * (neonrun.bestScore / bestDistance / totalCoins / muted) without destroying
 * them; corrupted or partial data always falls back to safe defaults.
 *
 * Known limitation: daily missions rely on the local clock — accepted for a
 * backend-free V2.
 */

export interface SettingsData {
  muted: boolean;
  screenShake: boolean;
  music: boolean;
  sound: boolean;
  performanceMode: boolean;
}

export interface CustomizationData {
  character: string;
  trail: string;
  unlockedCharacters: string[];
  unlockedTrails: string[];
  badges: string[];
}

export interface MissionsSave {
  date: string;
  entries: { id: string; templateId: string; target: number }[];
  /** Live progress keyed by mission id. */
  progress: Record<string, number>;
  completed: string[];
}

export interface AchievementsSave {
  completed: string[];
}

export interface ProgressionSave {
  level: number;
  xp: number;
}

export interface SaveDataV2 {
  version: 2;
  progression: ProgressionSave;
  stats: PlayerStatsData;
  missions: MissionsSave;
  achievements: AchievementsSave;
  customization: CustomizationData;
  settings: SettingsData;
  /** Life-Saver keys inventory — used to revive at death point. */
  keys: number;
}

const SAVE_KEY = "neonrun.save.v2";
const LEGACY_KEYS = {
  bestScore: "neonrun.bestScore",
  bestDistance: "neonrun.bestDistance",
  totalCoins: "neonrun.totalCoins",
  muted: "neonrun.muted",
} as const;

function defaultStats(): PlayerStatsData {
  return {
    totalRuns: 0,
    totalDistance: 0,
    totalCoins: 0,
    bestScore: 0,
    bestDistance: 0,
    highestCombo: 0,
    totalNearMisses: 0,
    totalPerfectJumps: 0,
    totalPerfectSlides: 0,
    totalPowerUps: 0,
    totalOverdrives: 0,
    obstaclesSmashed: 0,
    totalPlayTime: 0,
    missionsCompleted: 0,
  };
}

export function defaultSave(): SaveDataV2 {
  return {
    version: 2,
    progression: { level: 1, xp: 0 },
    stats: defaultStats(),
    missions: { date: "", entries: [], progress: {}, completed: [] },
    achievements: { completed: [] },
    customization: {
      character: "vector",
      trail: "default",
      unlockedCharacters: ["vector"],
      unlockedTrails: ["default"],
      badges: [],
    },
    settings: {
      muted: false,
      screenShake: true,
      music: true,
      sound: true,
      performanceMode: false,
    },
    keys: 2,
  };
}

/** Reads legacy V1 scattered keys so existing players keep their records. */
function readLegacy(): Partial<SaveDataV2> {
  if (typeof window === "undefined") return {};
  try {
    const hasAny =
      window.localStorage.getItem(LEGACY_KEYS.bestScore) !== null ||
      window.localStorage.getItem(LEGACY_KEYS.bestDistance) !== null ||
      window.localStorage.getItem(LEGACY_KEYS.totalCoins) !== null;
    if (!hasAny) return {};
    return {
      stats: {
        ...defaultStats(),
        bestScore: readLegacyNumber(LEGACY_KEYS.bestScore),
        bestDistance: readLegacyNumber(LEGACY_KEYS.bestDistance),
        totalCoins: readLegacyNumber(LEGACY_KEYS.totalCoins),
      },
      settings: { muted: window.localStorage.getItem(LEGACY_KEYS.muted) === "1" } as SettingsData,
    };
  } catch {
    return {};
  }
}

function readLegacyNumber(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

let cache: SaveDataV2 | null = null;

function clampIntoDefaults(raw: unknown): SaveDataV2 {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<SaveDataV2>;
  return {
    version: 2,
    progression: {
      level: Number.isFinite(data.progression?.level) ? Math.max(1, Math.floor(data.progression!.level)) : base.progression.level,
      xp: Number.isFinite(data.progression?.xp) ? Math.max(0, Math.floor(data.progression!.xp)) : 0,
    },
    stats: { ...base.stats, ...(data.stats ?? {}) },
    missions: {
      date: typeof data.missions?.date === "string" ? data.missions.date : "",
      entries: Array.isArray(data.missions?.entries)
        ? data.missions!.entries.filter(
            (e): e is MissionsSave["entries"][number] =>
              !!e && typeof e.id === "string" && typeof e.templateId === "string" && Number.isFinite(e.target)
          )
        : [],
      progress: isRecord(data.missions?.progress) ? data.missions!.progress : {},
      completed: Array.isArray(data.missions?.completed) ? data.missions!.completed : [],
    },
    achievements: {
      completed: Array.isArray(data.achievements?.completed) ? data.achievements!.completed : [],
    },
    customization: {
      character: typeof data.customization?.character === "string" ? data.customization.character : base.customization.character,
      trail: typeof data.customization?.trail === "string" ? data.customization.trail : base.customization.trail,
      unlockedCharacters: Array.isArray(data.customization?.unlockedCharacters)
        ? data.customization.unlockedCharacters
        : base.customization.unlockedCharacters,
      unlockedTrails: Array.isArray(data.customization?.unlockedTrails)
        ? data.customization.unlockedTrails
        : base.customization.unlockedTrails,
      badges: Array.isArray(data.customization?.badges) ? data.customization.badges : [],
    },
    settings: { ...base.settings, ...(data.settings ?? {}) },
    keys: Number.isFinite((data as { keys?: unknown }).keys) ? Math.max(0, Math.floor((data as { keys: number }).keys)) : base.keys,
  };
}

function isRecord(value: unknown): value is Record<string, number> {
  return typeof value === "object" && value !== null;
}

export const SaveService = {
  get(): SaveDataV2 {
    if (cache) return cache;
    let loaded: SaveDataV2 = defaultSave();
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (raw) {
          loaded = clampIntoDefaults(JSON.parse(raw));
        } else {
          // Fresh V2 install — pull anything V1 left behind.
          loaded = clampIntoDefaults({ ...defaultSave(), ...readLegacy() });
        }
      } catch {
        loaded = clampIntoDefaults({ ...defaultSave(), ...readLegacy() });
      }
    }
    cache = loaded;
    return loaded;
  },

  persist(next?: SaveDataV2): void {
    const data = next ?? this.get();
    cache = data;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — persistence stays best-effort */
    }
  },

  /** Mutate + persist in one call. Returns the updated save. */
  update(mutate: (save: SaveDataV2) => void): SaveDataV2 {
    const save = this.get();
    mutate(save);
    this.persist(save);
    return save;
  },
};
