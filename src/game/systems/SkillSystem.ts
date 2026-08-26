import type { Obstacle } from "@/game/entities/Obstacle";
import type { SkillEventKind } from "@/types/game";

export interface PlayerSkillState {
  x: number;
  /** Feet height (0 when grounded). */
  y: number;
  halfWidth: number;
  airborne: boolean;
  sliding: boolean;
  secondsSinceJumpStart: number;
}

export interface SkillAwards {
  events: { kind: SkillEventKind; obstacle: Obstacle | null }[];
}

const NEAR_MISS_LATERAL_MARGIN = 0.85;
/** Vertical skim window above an obstacle's top surface for perfect jumps. */
const PERFECT_JUMP_SKIM = 1.05;
/** Jump must be recent enough to read as deliberate timing. */
const PERFECT_JUMP_MAX_AGE = 1.1;

const JUMPABLE_KINDS = new Set(["barrier", "block"]);
const SLIDEABLE_KINDS = new Set(["overhead1", "overhead3"]);
const DODGEABLE_KINDS = new Set(["block", "moving"]);

/**
 * Detects skillful passes around obstacles. Each obstacle is armed while the
 * player is inside its interaction window and judged exactly once after it
 * slides past — so no event can repeat against the same obstacle.
 *
 * Rules:
 *  - perfect jump  : clears a barrier/block airborne with a tight skim
 *  - perfect slide : crosses under an overhead while sliding
 *  - near miss     : squeezes past a block/mover within the lateral margin
 */
export class SkillSystem {
  private awardsOut: SkillAwards = { events: [] };
  private chainTimes: number[] = [];
  private lastChainTime = -10;

  /**
   * @param simTime monotonic run time, used for obstacle-chain detection.
   * Must be called before collision resolution each frame with the same
   * nearby-obstacle list the collision system uses.
   */
  evaluate(
    player: PlayerSkillState,
    obstacles: readonly Obstacle[],
    simTime: number
  ): SkillAwards {
    this.awardsOut.events.length = 0;

    for (const obstacle of obstacles) {
      const c = obstacle.collider;
      const passedFullyBehind = c.minZ > 1.0;
      const inWindow = c.maxZ > -2.5 && c.minZ < 2.2;

      if (!obstacle.skillEvaluated && passedFullyBehind) {
        obstacle.skillEvaluated = true;
        if (obstacle.nearArmed) {
          this.awardsOut.events.push({ kind: "nearMiss", obstacle });
        } else if (obstacle.jumpSkim) {
          this.awardsOut.events.push({ kind: "perfectJump", obstacle });
        } else if (obstacle.slideUnder) {
          this.awardsOut.events.push({ kind: "perfectSlide", obstacle });
        }
        continue;
      }

      if (!inWindow || obstacle.skillEvaluated) continue;

      // Arm vertical skills.
      if (JUMPABLE_KINDS.has(obstacle.kind) && player.airborne) {
        const skimHeight = c.maxY + PERFECT_JUMP_SKIM;
        if (player.y < skimHeight && player.y >= c.maxY - 0.2) {
          obstacle.jumpSkim = true;
        } else if (player.y >= skimHeight || player.secondsSinceJumpStart > PERFECT_JUMP_MAX_AGE) {
          obstacle.jumpSkim = false;
        }
      }
      if (SLIDEABLE_KINDS.has(obstacle.kind) && player.sliding) {
        obstacle.slideUnder = true;
      }

      // Arm lateral near miss for dodge-only obstacles.
      if (DODGEABLE_KINDS.has(obstacle.kind)) {
        const hx = (c.maxX - c.minX) / 2;
        const cx = (c.maxX + c.minX) / 2;
        const lateralGap = Math.abs(player.x - cx) - hx - player.halfWidth;
        if (lateralGap >= -0.05 && lateralGap < NEAR_MISS_LATERAL_MARGIN) {
          obstacle.nearArmed = true;
        }
      }
    }

    return this.awardsOut;
  }

  /** A hit invalidates any armed skill outcome on that obstacle. */
  notifyHit(obstacle: Obstacle): void {
    obstacle.nearArmed = false;
    obstacle.jumpSkim = false;
    obstacle.slideUnder = false;
    obstacle.skillEvaluated = true;
  }

  /**
   * Three skill awards inside a rolling 4s window trigger a chain bonus
   * (with its own cooldown so it cannot machine-gun).
   */
  registerAward(simTime: number): boolean {
    this.chainTimes.push(simTime);
    while (this.chainTimes.length > 6) this.chainTimes.shift();
    const cutoff = simTime - 4;
    while (this.chainTimes.length > 0 && this.chainTimes[0] < cutoff) {
      this.chainTimes.shift();
    }
    if (this.chainTimes.length >= 3 && simTime - this.lastChainTime > 4) {
      this.lastChainTime = simTime;
      this.chainTimes.length = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.chainTimes.length = 0;
    this.lastChainTime = -10;
  }
}
