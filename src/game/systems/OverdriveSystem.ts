import { damp } from "@/game/utils/math";

/**
 * Overdrive: the run's ultimate meter. Charges only through skilled play
 * (coins, perfect actions, near misses, power-ups, combo milestones) and
 * unleashes a 6-second rampage — speed, FOV, destruction, auto-collection.
 * All intensity transitions are damped; nothing snaps.
 */
export const OVERDRIVE_CFG = {
  maxEnergy: 100,
  duration: 6,
  speedFactor: 1.32,
  fovBoost: 13,
  scoreMultBonus: 2,
  magnetRadiusBoost: 7,
  /** Energy grants. */
  gainCoin: 0.7,
  gainNearMiss: 10,
  gainPerfect: 8,
  gainPowerUp: 12,
  gainSmash: 4,
  gainComboMilestone: 6,
} as const;

export class OverdriveSystem {
  energy = 0;
  active = false;
  remaining = 0;
  /** Smoothed 0..1 intensity driving FX/speed/FOV. */
  ramp = 0;

  private readyAnnounced = false;

  onReady: (() => void) | null = null;
  onActivated: (() => void) | null = null;
  onEnded: (() => void) | null = null;

  gain(amount: number): void {
    if (this.active || this.energy >= OVERDRIVE_CFG.maxEnergy) return;
    this.energy = Math.min(this.energy + amount, OVERDRIVE_CFG.maxEnergy);
    if (this.energy >= OVERDRIVE_CFG.maxEnergy && !this.readyAnnounced) {
      this.readyAnnounced = true;
      this.onReady?.();
    }
  }

  tryActivate(): boolean {
    if (this.active || this.energy < OVERDRIVE_CFG.maxEnergy) return false;
    this.active = true;
    this.remaining = OVERDRIVE_CFG.duration;
    this.readyAnnounced = false;
    this.onActivated?.();
    return true;
  }

  update(delta: number): void {
    this.ramp = damp(this.ramp, this.active ? 1 : 0, 5, delta);
    if (!this.active) return;
    this.remaining -= delta;
    if (this.remaining <= 0) {
      this.end();
    }
  }

  private end(): void {
    this.active = false;
    this.remaining = 0;
    this.energy = 0;
    this.readyAnnounced = false;
    this.onEnded?.();
  }

  get isReady(): boolean {
    return !this.active && this.energy >= OVERDRIVE_CFG.maxEnergy;
  }

  reset(): void {
    this.energy = 0;
    this.active = false;
    this.remaining = 0;
    this.readyAnnounced = false;
  }
}
