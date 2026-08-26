import type { PowerUpType } from "@/types/game";

/**
 * Power-up tuning. All durations are seconds; `duration: 0` means
 * "until consumed" (shield).
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
    icon: "◈",
    label: "MAGNET",
    colorHex: "#37d3e0",
  },
  shield: {
    id: "shield",
    type: "shield",
    duration: 0,
    spawnWeight: 0.9,
    icon: "⬡",
    label: "SHIELD",
    colorHex: "#4f8dff",
  },
  scoreMultiplier: {
    id: "scoreMultiplier",
    type: "scoreMultiplier",
    duration: 10,
    spawnWeight: 1.0,
    icon: "×2",
    label: "2× SCORE",
    colorHex: "#e8c96a",
  },
  turbo: {
    id: "turbo",
    type: "turbo",
    duration: 6,
    spawnWeight: 0.8,
    icon: "≫",
    label: "TURBO",
    colorHex: "#c06bff",
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

export const MAGNET = {
  radius: 6.5,
  /** Lateral/vertical pull damping factor — coins accelerate as they approach. */
  pullLambda: 7.5,
} as const;

export const TURBO = {
  speedBoost: 0.45,
  fovBoost: 8,
  /** Turbo ramp above this value counts as "protected / smashing". */
  smashThreshold: 0.5,
  scoreBonusMult: 1.5,
} as const;

export const SCORE_MULT = { value: 2 } as const;
