import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { SharedAssets } from "./SharedAssets";
import { TrackSegment } from "./TrackSegment";
import {
  Obstacle,
  createObstacleMesh,
  type ObstacleKind,
} from "@/game/entities/Obstacle";
import { Coin, CoinFactory } from "@/game/entities/Coin";
import { pickPattern, type PatternDef } from "./patterns";
import { WORLD } from "@/game/config/gameplay";

/**
 * Owns the recycled segment ring plus obstacle/coin pools.
 * The player stays near z = 0; segments (and their children) slide toward +Z
 * and teleport ahead when fully behind the camera. Nothing ever grows.
 */
export class WorldManager {
  readonly root = new THREE.Group();
  private segments: TrackSegment[] = [];

  private obstaclePools = new Map<ObstacleKind, Obstacle[]>();
  private coinPool: Coin[] = [];
  private coinFactory: CoinFactory;

  private lastPatternId: string | null = null;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private shared: SharedAssets,
    private bag: ResourceBag
  ) {
    this.root.name = "WorldRoot";
    this.coinFactory = new CoinFactory(bag);

    for (let i = 0; i < WORLD.segmentCount; i++) {
      const segment = new TrackSegment(i, shared, bag);
      this.segments.push(segment);
      this.root.add(segment.group);
    }
    scene.add(this.root);
    this.reset();
  }

  /** Fresh run layout: warmup zone under the player, patterns ahead. */
  reset(): void {
    for (const segment of this.segments) {
      this.releaseSegmentEntities(segment);
    }
    const startZ = WORLD.recycleBehindZ;
    this.segments.forEach((segment, i) => {
      segment.originZ = startZ - i * WORLD.segmentLength;
    });
    // First two segments ahead of the runner stay clear (breathing room).
    let index = 0;
    for (const segment of this.segments) {
      if (index < 2) {
        this.spawnPattern(segment, null);
      } else {
        this.recycleContent(segment, 0);
      }
      index++;
    }
  }

  /**
   * Advance the world.
   * @param delta simulation seconds @param speed world speed (u/s)
   * @param tierIndex difficulty tier used when re-populating recycled segments
   */
  update(delta: number, speed: number, tierIndex: number): void {
    const dz = speed * delta;
    this.time += delta;

    let minOrigin = Infinity;
    for (const segment of this.segments) {
      segment.originZ += dz;
      segment.updateVisual(delta);
      minOrigin = Math.min(minOrigin, segment.originZ);

      // Refresh colliders while the world slides.
      for (const obstacle of segment.obstacles) {
        obstacle.refresh(delta, segment.originZ);
      }
      for (const coin of segment.coins) {
        coin.updateVisual(delta);
      }

      // Distance culling: fog hides everything past fogFar.
      segment.group.visible = segment.originZ > -WORLD.fogFar - WORLD.segmentLength;
    }

    // Recycle segments that are fully behind the play area.
    for (const segment of this.segments) {
      if (segment.originZ - WORLD.segmentLength > WORLD.recycleBehindZ) {
        segment.originZ = minOrigin - WORLD.segmentLength;
        minOrigin = segment.originZ;
        this.releaseSegmentEntities(segment);
        segment.decorate(this.shared);
        const pattern = pickPattern(tierIndex, this.lastPatternId);
        this.lastPatternId = pattern.id;
        this.spawnPattern(segment, pattern);
      }
    }
  }

  /** Re-populates a freshly recycled segment using current difficulty. */
  recycleContent(segment: TrackSegment, tierIndex: number): void {
    const pattern = pickPattern(tierIndex, this.lastPatternId);
    this.lastPatternId = pattern.id;
    this.spawnPattern(segment, pattern);
  }

  // ------------------------------------------------------------- iteration

  forEachObstacle(fn: (obstacle: Obstacle) => void): void {
    for (const segment of this.segments) {
      if (!segment.group.visible) continue;
      for (const obstacle of segment.obstacles) fn(obstacle);
    }
  }

  forEachCoin(fn: (coin: Coin, delta: number) => void, delta: number): void {
    for (const segment of this.segments) {
      if (!segment.group.visible) continue;
      for (const coin of segment.coins) fn(coin, delta);
    }
  }

  get activeObstacleCount(): number {
    let count = 0;
    this.forEachObstacle(() => count++);
    return count;
  }

  get activeCoinCount(): number {
    let count = 0;
    this.forEachCoin(() => count++, 0);
    return count;
  }

  dispose(scene: THREE.Scene): void {
    for (const segment of this.segments) {
      this.releaseSegmentEntities(segment);
    }
    scene.remove(this.root);
  }

  // ---------------------------------------------------------------- intern

  private releaseSegmentEntities(segment: TrackSegment): void {
    for (const obstacle of segment.obstacles) {
      obstacle.active = false;
      obstacle.mesh.removeFromParent();
      const pool = this.obstaclePools.get(obstacle.kind);
      if (pool) pool.push(obstacle);
    }
    segment.obstacles.length = 0;

    for (const coin of segment.coins) {
      coin.active = false;
      coin.mesh.removeFromParent();
      this.coinPool.push(coin);
    }
    segment.coins.length = 0;
  }

  private spawnPattern(segment: TrackSegment, pattern: PatternDef | null): void {
    if (!pattern) return;
    for (const item of pattern.obstacles) {
      const obstacle = this.acquireObstacle(item.kind);
      obstacle.localX = laneIndexToX(item.lane);
      obstacle.localZ = item.z;
      obstacle.mesh.position.set(obstacle.localX, 0, item.z);
      if (item.kind === "moving") {
        obstacle.configureMoving(item.moveAmp ?? 2.5, item.moveSpeed ?? 1.8);
      }
      segment.group.add(obstacle.mesh);
      segment.obstacles.push(obstacle);
      obstacle.refresh(0, segment.originZ);
    }
    for (const spot of pattern.coins) {
      const coin = this.acquireCoin();
      coin.place(spot.x, spot.z, spot.y ?? 0.8);
      segment.group.add(coin.mesh);
      segment.coins.push(coin);
    }
  }

  private acquireObstacle(kind: ObstacleKind): Obstacle {
    const pool = this.obstaclePools.get(kind);
    if (pool && pool.length > 0) {
      const reused = pool.pop()!;
      reused.active = true;
      reused.mesh.visible = true;
      return reused;
    }
    const mesh = createObstacleMesh(kind, this.bag);
    const created = new Obstacle(kind, mesh);
    created.active = true;
    this.obstaclePools.set(kind, this.obstaclePools.get(kind) ?? []);
    return created;
  }

  private acquireCoin(): Coin {
    const reused = this.coinPool.pop();
    if (reused) {
      reused.active = true;
      return reused;
    }
    const created = new Coin(this.coinFactory.create());
    created.active = true;
    return created;
  }
}

export function laneIndexToX(lane: number): number {
  return -2.5 + lane * 2.5;
}
