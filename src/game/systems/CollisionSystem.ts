import type { Obstacle, ObstacleCollider } from "@/game/entities/Obstacle";
import type { Coin } from "@/game/entities/Coin";

const HIT_SHRINK = 0.06; // forgiveness margin applied to obstacle boxes

/** Anything exposing a world-space AABB collider (obstacles, drones). */
export interface ColliderLike {
  readonly collider: ObstacleCollider;
}

/**
 * Lightweight AABB collision checks. Only nearby entities are passed in by the
 * WorldManager, so we never test hundreds of distant objects per frame.
 */
export class CollisionSystem {
  /** Returns the first obstacle overlapping the player box, if any. */
  findHit(
    player: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
    colliders: readonly ColliderLike[]
  ): ColliderLike | null {
    for (const source of colliders) {
      const c = source.collider;
      const minX = c.minX + HIT_SHRINK;
      const maxX = c.maxX - HIT_SHRINK;
      const minY = c.minY;
      const maxY = c.maxY;
      const minZ = c.minZ + HIT_SHRINK;
      const maxZ = c.maxZ - HIT_SHRINK;

      const overlap =
        player.maxX > minX &&
        player.minX < maxX &&
        player.maxY > minY &&
        player.minY < maxY &&
        player.maxZ > minZ &&
        player.minZ < maxZ;
      if (overlap) return source;
    }
    return null;
  }

  /** Collects coins near the player; returns how many were taken. */
  collectCoins(
    player: { x: number; y: number; height: number },
    coins: readonly Coin[],
    onCollect: (coin: Coin) => void
  ): void {
    const centerY = player.y + Math.min(player.height / 2 + 0.35, player.height);
    for (const coin of coins) {
      if (!coin.active || coin.collected) continue;
      const dx = Math.abs(coin.mesh.position.x - player.x);
      if (dx > COIN_COLLECT_RADIUS_XZ) continue;
      const dz = Math.abs(coin.worldZ);
      if (dz > COIN_COLLECT_RADIUS_XZ) continue;
      // mesh.position.y reflects bobbing or magnet attraction alike.
      const dy = Math.abs(coin.mesh.position.y - centerY);
      if (dy > COIN_COLLECT_RADIUS_Y) continue;
      coin.collected = true;
      onCollect(coin);
    }
  }
}

const COIN_COLLECT_RADIUS_XZ = 1.05;
const COIN_COLLECT_RADIUS_Y = 1.3;
