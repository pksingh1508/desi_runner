import {
  POWERUP_DEFS,
  SCORE_MULT,
  TURBO,
} from "@/game/config/powerups";
import type { HudPowerUp, PowerUpType } from "@/types/game";
import { damp } from "@/game/utils/math";

interface ActivePowerUp {
  remaining: number;
  duration: number;
}

/**
 * Central owner of every active power-up state. Player/WorldManager/HUD all
 * query this system instead of tracking their own timers.
 * Turbo ramps in/out smoothly (`turboRamp` → 0..1) so speed, FOV and FX
 * never snap.
 */
export class PowerUpSystem {
  private active = new Map<PowerUpType, ActivePowerUp>();
  /** Smoothed 0..1 intensity of the turbo effect. */
  turboRamp = 0;

  activate(type: PowerUpType): void {
    const duration = POWERUP_DEFS[type].duration;
    // Re-collection refreshes the timer (shield is consume-on-hit).
    this.active.set(type, { remaining: duration, duration });
  }

  consumeShield(): boolean {
    if (!this.active.has("shield")) return false;
    this.active.delete("shield");
    return true;
  }

  hasShield(): boolean {
    return this.active.has("shield");
  }

  update(delta: number): void {
    for (const [type, state] of this.active) {
      if (state.duration <= 0) continue; // shield persists until consumed
      state.remaining -= delta;
      if (state.remaining <= 0) {
        this.active.delete(type);
      }
    }
    const target = this.active.has("turbo") ? 1 : 0;
    this.turboRamp = damp(this.turboRamp, target, 4.2, delta);
  }

  isActive(type: PowerUpType): boolean {
    return this.active.has(type);
  }

  get scoreMultiplierBonus(): number {
    return this.isActive("scoreMultiplier") ? SCORE_MULT.value : 1;
  }

  get turboSpeedFactor(): number {
    return 1 + TURBO.speedBoost * this.turboRamp;
  }

  get turboFovBoost(): number {
    return TURBO.fovBoost * this.turboRamp;
  }

  /** Turbo grants temporary protection + smashing once ramped up. */
  get turboProtects(): boolean {
    return this.turboRamp >= TURBO.smashThreshold;
  }

  /** HUD chips ordered by remaining time. */
  snapshot(out: HudPowerUp[]): HudPowerUp[] {
    out.length = 0;
    for (const [type, state] of this.active) {
      const def = POWERUP_DEFS[type];
      const fraction = state.duration > 0 ? Math.max(0, state.remaining / state.duration) : 1;
      out.push({
        type,
        icon: def.icon,
        label: def.label,
        remaining: Math.ceil(state.remaining),
        fraction,
        colorHex: def.colorHex,
      });
    }
    return out;
  }

  reset(): void {
    this.active.clear();
    this.turboRamp = 0;
  }
}
