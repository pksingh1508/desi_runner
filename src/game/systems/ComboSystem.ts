/**
 * Skill-action combo tracking. Combo grows only through skillful play
 * (perfect actions, near misses, coin streaks, event chains) — never from
 * elapsed time. It decays gently after a grace period and resets fully when
 * an unprotected collision lands.
 */
export const COMBO_TIERS = [
  { min: 30, mult: 3 },
  { min: 20, mult: 2 },
  { min: 10, mult: 1.5 },
  { min: 5, mult: 1.25 },
  { min: 0, mult: 1 },
] as const;

const GRACE_SECONDS = 7;
/** After the grace period the count drains at this rate (gentle decay). */
const DECAY_PER_SECOND = 1.5;

export class ComboSystem {
  count = 0;
  bestThisRun = 0;
  /** Set by Game after a run so achievements/summary can read it. */
  lifetimeBest = 0;

  private lastEventTime = 0;
  private now = 0;
  private announcedTierMult = 1;
  /** Callbacks wired by Game (feedback / overdrive / audio). */
  onMilestone: ((count: number, mult: number) => void) | null = null;
  onChanged: (() => void) | null = null;

  add(points: number, simTime: number): void {
    if (points <= 0) return;
    this.count += points;
    this.lastEventTime = simTime;
    this.now = simTime;
    if (this.count > this.bestThisRun) this.bestThisRun = this.count;
    const tier = this.multiplier;
    if (tier > this.announcedTierMult) {
      this.announcedTierMult = tier;
      this.onMilestone?.(this.count, tier);
    }
    this.onChanged?.();
  }

  /** Unprotected collision → full reset. */
  breakCombo(): void {
    this.count = 0;
    this.lastEventTime = this.now;
    this.onChanged?.();
  }

  update(delta: number): void {
    if (this.count <= 0) return;
    this.now += delta;
    if (this.now - this.lastEventTime > GRACE_SECONDS) {
      this.count = Math.max(0, this.count - DECAY_PER_SECOND * delta);
      if (this.count === 0) this.announcedTierMult = 1;
      this.onChanged?.();
    }
  }

  get multiplier(): number {
    for (const tier of COMBO_TIERS) {
      if (this.count >= tier.min) return tier.mult;
    }
    return 1;
  }

  reset(): void {
    if (this.bestThisRun > this.lifetimeBest) this.lifetimeBest = this.bestThisRun;
    this.count = 0;
    this.bestThisRun = 0;
    this.lastEventTime = 0;
    this.announcedTierMult = 1;
  }
}
