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
import { Pickup, PickupFactory } from "@/game/entities/Pickup";
import {
  LASER_PATTERNS,
  pickPattern,
  type PatternDef,
} from "./patterns";
import {
  POWERUP_DEFS,
  POWERUP_SPAWN,
} from "@/game/config/powerups";
import { WORLD } from "@/game/config/gameplay";
import type { PowerUpType } from "@/types/game";
import { weightedIndex } from "@/game/utils/math";

/**
 * Owns the recycled segment ring plus obstacle/coin/pickup pools.
 * The player stays near z = 0; segments (and their children) slide toward +Z
 * and teleport ahead when fully behind the camera. Nothing ever grows.
 *
 * V2 additions: power-up pickups ride segments, dynamic (storm) coins live on
 * the world root, authored event patterns can be queued into upcoming
 * recycles, and obstacles can be destroyed back into their pools.
 */
export class WorldManager {
  readonly root = new THREE.Group();
  private segments: TrackSegment[] = [];

  private obstaclePools = new Map<ObstacleKind, Obstacle[]>();
  private coinPool: Coin[] = [];
  private coinFactory: CoinFactory;
  private pickupPool: Pickup[] = [];
  private pickupFactory: PickupFactory;
  /** Storm/event coins parented to the world root with absolute z. */
  private dynamicCoins: Coin[] = [];

  /** Authored patterns (laser grids etc.) consumed one per recycle. */
  private queuedPatterns: PatternDef[] = [];

  private lastPatternId: string | null = null;
  private time = 0;
  private pickupCooldown = 0;
  private billboardSetIndex = 0;
  private distance = 0;

  constructor(
    scene: THREE.Scene,
    private shared: SharedAssets,
    private bag: ResourceBag
  ) {
    this.root.name = "WorldRoot";
    this.coinFactory = new CoinFactory(bag);
    this.pickupFactory = new PickupFactory(bag);

    for (let i = 0; i < WORLD.segmentCount; i++) {
      const segment = new TrackSegment(i, shared, bag);
      this.segments.push(segment);
      this.root.add(segment.group);
    }
    scene.add(this.root);
    this.reset();
  }

  setBillboardSet(index: number): void {
    this.billboardSetIndex = index;
  }

  /** Queue N authored laser-chain patterns for upcoming recycled segments. */
  queueAuthoredPatterns(count: number): void {
    for (let i = 0; i < count; i++) {
      this.queuedPatterns.push(LASER_PATTERNS[i % LASER_PATTERNS.length]);
    }
  }

  /** Spawn a floating coin line directly onto the world root (Coin Storm). */
  spawnDynamicCoinLine(x: number, zStart: number, count: number, spacing: number): void {
    for (let i = 0; i < count; i++) {
      const coin = this.acquireCoin();
      coin.place(x, zStart - i * spacing, 0.85);
      this.root.add(coin.mesh);
      this.dynamicCoins.push(coin);
    }
  }

  /** Fresh run layout: warmup zone under the player, patterns ahead. */
  reset(): void {
    for (const segment of this.segments) {
      this.releaseSegmentEntities(segment);
    }
    for (const coin of this.dynamicCoins) {
      coin.active = false;
      coin.mesh.removeFromParent();
      this.coinPool.push(coin);
    }
    this.dynamicCoins.length = 0;
    this.queuedPatterns.length = 0;
    this.pickupCooldown = 0;

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
   * @param distance run distance in meters (gates pickup spawns)
   */
  update(delta: number, speed: number, tierIndex: number, distance: number): void {
    const dz = speed * delta;
    this.time += delta;
    this.distance = distance;
    if (this.pickupCooldown > 0) this.pickupCooldown -= delta;

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
      for (const pickup of segment.pickups) {
        pickup.updateVisual(delta);
      }

      // Distance culling: fog hides everything past fogFar.
      segment.group.visible = segment.originZ > -WORLD.fogFar - WORLD.segmentLength;
    }

    // Dynamic coins advance manually (they are not parented to a segment).
    for (let i = this.dynamicCoins.length - 1; i >= 0; i--) {
      const coin = this.dynamicCoins[i];
      if (coin.collected) {
        coin.playCollection(delta);
        continue;
      }
      coin.mesh.position.z += dz;
      coin.localZ = coin.mesh.position.z;
      coin.updateVisual(delta);
      if (coin.localZ > 14) {
        coin.active = false;
        coin.mesh.removeFromParent();
        this.dynamicCoins.splice(i, 1);
        this.coinPool.push(coin);
      }
    }

    // Recycle segments that are fully behind the play area.
    for (const segment of this.segments) {
      if (segment.originZ - WORLD.segmentLength > WORLD.recycleBehindZ) {
        segment.originZ = minOrigin - WORLD.segmentLength;
        minOrigin = segment.originZ;
        this.releaseSegmentEntities(segment);
        segment.decorate(this.shared, this.billboardSetIndex);
        this.recycleContent(segment, tierIndex);
        this.maybeSpawnPickup(segment);
      }
    }
  }

  /** Re-populates a freshly recycled segment using current difficulty. */
  recycleContent(segment: TrackSegment, tierIndex: number): void {
    const pattern = this.queuedPatterns.shift() ?? pickPattern(tierIndex, this.lastPatternId);
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
    for (const coin of this.dynamicCoins) fn(coin, delta);
  }

  forEachPickup(fn: (pickup: Pickup) => void): void {
    for (const segment of this.segments) {
      if (!segment.group.visible) continue;
      for (const pickup of segment.pickups) fn(pickup);
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

  /**
   * Shatters an obstacle: releases it to its pool and removes it from the
   * owning segment. Returns false when the obstacle was not found (already
   * released).
   */
  destroyObstacle(obstacle: Obstacle): boolean {
    for (const segment of this.segments) {
      const index = segment.obstacles.indexOf(obstacle);
      if (index === -1) continue;
      segment.obstacles.splice(index, 1);
      obstacle.active = false;
      obstacle.mesh.removeFromParent();
      const pool = this.obstaclePools.get(obstacle.kind);
      if (pool) pool.push(obstacle);
      return true;
    }
    return false;
  }

  dispose(scene: THREE.Scene): void {
    for (const segment of this.segments) {
      this.releaseSegmentEntities(segment);
    }
    for (const coin of this.dynamicCoins) {
      coin.mesh.removeFromParent();
    }
    this.dynamicCoins.length = 0;
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

    for (const pickup of segment.pickups) {
      pickup.active = false;
      pickup.mesh.removeFromParent();
      this.pickupPool.push(pickup);
    }
    segment.pickups.length = 0;
  }

  private maybeSpawnPickup(segment: TrackSegment): void {
    if (
      this.pickupCooldown > 0 ||
      this.distance < POWERUP_SPAWN.minRunDistance ||
      Math.random() > POWERUP_SPAWN.chancePerSegment
    ) {
      return;
    }

    const types = Object.keys(POWERUP_DEFS) as PowerUpType[];
    const weights = types.map((t) => POWERUP_DEFS[t].spawnWeight);
    const type = types[weightedIndex(weights)];

    // Find a slot clear of obstacles (never spawn an unfair pickup).
    for (const z of POWERUP_SPAWN.candidateZs) {
      const blocked = segment.obstacles.some(
        (o) => Math.abs(o.localZ - z) < 4 && o.collider.maxY > 1.2
      );
      if (blocked) continue;
      const laneFreeX = [-2.5, 0, 2.5].find(
        (x) => !segment.obstacles.some((o) => Math.abs(o.localZ - z) < 3.5 && Math.abs(o.centerX - x) < 2)
      );
      if (laneFreeX === undefined) continue;
      const pickup = this.acquirePickup(type);
      pickup.place(type, laneFreeX, z);
      segment.group.add(pickup.mesh);
      segment.pickups.push(pickup);
      this.pickupCooldown = POWERUP_SPAWN.cooldownSeconds;
      return;
    }
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
      reused.resetRuntimeFlags();
      reused.active = true;
      reused.mesh.visible = true;
      reused.mesh.scale.setScalar(1);
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

  private acquirePickup(type: PowerUpType): Pickup {
    const reused = this.pickupPool.pop();
    if (reused) {
      reused.active = true;
      return reused;
    }
    const created = this.pickupFactory.create(type);
    created.active = true;
    return created;
  }
}

export function laneIndexToX(lane: number): number {
  return -2.5 + lane * 2.5;
}
