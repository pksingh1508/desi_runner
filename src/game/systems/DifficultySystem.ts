import { DIFFICULTY_TIERS, SPEED } from "@/game/config/gameplay";
import { clamp } from "@/game/utils/math";

export interface DifficultyTier {
  index: number;
  name: string;
  label: string;
}

/**
 * Distance-driven difficulty: speed ramps linearly towards a hard clamp and
 * unlocks progressively nastier track patterns via `patternTier`.
 */
export class DifficultySystem {
  private currentDistance: number = 0;
  private currentSpeed: number = SPEED.start;

  reset(): void {
    this.currentDistance = 0;
    this.currentSpeed = SPEED.start;
  }

  /** Advance by meters travelled this frame; returns current world speed. */
  update(delta: number, worldMoving: boolean): number {
    if (worldMoving) {
      this.currentDistance += this.currentSpeed * delta;
      const ramp = clamp(this.currentDistance / SPEED.rampDistance, 0, 1);
      this.currentSpeed = SPEED.start + (SPEED.max - SPEED.start) * ramp;
    }
    return this.currentSpeed;
  }

  /** Speed used outside normal play (menu drift / countdown). */
  overrideSpeed(speed: number): void {
    this.currentSpeed = speed;
  }

  get speed(): number {
    return this.currentSpeed;
  }

  get ratio(): number {
    return clamp((this.currentSpeed - SPEED.start) / (SPEED.max - SPEED.start), 0, 1);
  }

  get tier(): DifficultyTier {
    let tier: (typeof DIFFICULTY_TIERS)[number] = DIFFICULTY_TIERS[0];
    for (const candidate of DIFFICULTY_TIERS) {
      if (this.currentDistance >= candidate.minDistance) tier = candidate;
    }
    return { index: DIFFICULTY_TIERS.indexOf(tier), name: tier.name, label: tier.label };
  }
}
