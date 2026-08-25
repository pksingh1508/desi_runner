import type { Obstacle } from "@/game/entities/Obstacle";
import type { Coin } from "@/game/entities/Coin";

const HIT_SHRINK = 0.06; // forgiveness margin applied to obstacle boxes

/**
 * Lightweight AABB collision checks. Only nearby entities are passed in by the
 * WorldManager, so we never test hundreds of distant objects per frame.
 */
export class CollisionSystem {
  /** Returns the first obstacle overlapping the player box, if any. */
  findHit(
    player: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
    obstacles: readonly Obstacle[]
  ): Obstacle | null {
    for (const obstacle of obstacles) {
      const c = obstacle.collider;
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
      if (overlap) return obstacle;
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
      const dx = Math.abs(coin.worldX - player.x);
      if (dx > COIN_COLLECT_RADIUS_XZ) continue;
      const dz = Math.abs(coin.worldZ);
      if (dz > COIN_COLLECT_RADIUS_XZ) continue;
      const dy = Math.abs(coin.baseY + coin.bobOffset - centerY);
      if (dy > COIN_COLLECT_RADIUS_Y) continue;
      coin.collected = true;
      onCollect(coin);
    }
  }
}

const COIN_COLLECT_RADIUS_XZ = 1.05;
const COIN_COLLECT_RADIUS_Y = 1.3;
