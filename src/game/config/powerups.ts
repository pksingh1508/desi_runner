import type { PowerUpType } from "@/types/game";

/**
 * Power-up tuning. All durations are seconds; `duration: 0` means
 * "until consumed" (shield).
 *
 * Desi identities (internal ids stay stable for saves/missions):
 *  magnet → CHUMBAK · shield → NIMBU-MIRCHI (wards off one crash) ·
 *  scoreMultiplier → DOUBLE DHAMAKA · turbo → CHAI BOOST.
 */
export interface PowerUpDefinition {
  id: string;
  type: PowerUpType;
  duration: number;
  spawnWeight: number;
  icon: string;
  label: string;
  colorHex: string;
}

export const POWERUP_DEFS: Record<PowerUpType, PowerUpDefinition> = {
  magnet: {
    id: "magnet",
    type: "magnet",
    duration: 8,
    spawnWeight: 1.0,
    icon: "🧲",
    label: "CHUMBAK",
    colorHex: "#2e9bff",
  },
  shield: {
    id: "shield",
    type: "shield",
    duration: 0,
    spawnWeight: 0.9,
    icon: "🍋",
    label: "NIMBU-MIRCHI",
    colorHex: "#b5e61d",
  },
  scoreMultiplier: {
    id: "scoreMultiplier",
    type: "scoreMultiplier",
    duration: 10,
    spawnWeight: 1.0,
    icon: "💥",
    label: "DOUBLE DHAMAKA",
    colorHex: "#ffb300",
  },
  turbo: {
    id: "turbo",
    type: "turbo",
    duration: 6,
    spawnWeight: 0.8,
    icon: "☕",
    label: "CHAI BOOST",
    colorHex: "#ff6b35",
  },
};

export const POWERUP_SPAWN = {
  /** Roll per recycled segment (a segment ≈ 48m). Scarcity keeps them exciting. */
  chancePerSegment: 0.32,
  /** Minimum seconds between two power-up spawns. */
  cooldownSeconds: 13,
  /** No pickups during the opening stretch. */
  minRunDistance: 130,
  /** Candidate local-z slots inside a segment for pickup placement. */
  candidateZs: [-10, -24, -38],
} as const;

/**
 * Chumbak (magnet) field. Coins inside the field LATCH on and home in on the
 * runner's chest in full 3D (lateral, vertical and depth), accelerating until
 * collected — so every lane is emptied even at top speed. The forward reach
 * grows with speed so the pull always lasts about the same time.
 */
export const MAGNET = {
  /** Kept for key/rocket vacuum (overdrive / turbo / flight). */
  radius: 6.5,
  /** Lateral/vertical pull damping factor for keys/rockets. */
  pullLambda: 7.5,
  /** Field size: every lane from any lane, generous height for arcs. */
  lateralReach: 6.2,
  verticalReach: 6,
  /** Forward reach = base + speed × seconds (clamped). */
  reachBase: 14,
  reachSeconds: 0.75,
  reachMax: 44,
  /** Homing: chase speed (m/s) on top of the world scroll, + acceleration. */
  chaseBase: 9,
  chaseAccel: 55,
  /** Target point above the runner's feet (chest). */
  targetHeight: 1.15,
  /** Weaker fields: turbo sweeps nearby coins only. */
  turboLateral: 3.2,
  turboReach: 12,
} as const;

export const TURBO = {
  speedBoost: 0.45,
  fovBoost: 8,
  /** Turbo ramp above this value counts as "protected / smashing". */
  smashThreshold: 0.5,
  scoreBonusMult: 1.5,
} as const;

export const SCORE_MULT = { value: 2 } as const;
