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
import { Key, KeyFactory } from "@/game/entities/Key";
import { Rocket, RocketFactory } from "@/game/entities/Rocket";
import {
  pickBreather,
  pickPattern,
  type PatternDef,
} from "./patterns";
import {
  POWERUP_DEFS,
  POWERUP_SPAWN,
} from "@/game/config/powerups";
import { PATTERN, ROCKET_TRAIL, SPEED, WORLD } from "@/game/config/gameplay";
import type { PowerUpType } from "@/types/game";
import { weightedIndex, clamp, lerp } from "@/game/utils/math";

/**
 * Owns the recycled segment ring plus obstacle/coin/pickup pools.
 * The player stays near z = 0; segments (and their children) slide toward +Z
 * and teleport ahead when fully behind the camera. Nothing ever grows.
 *
 * V2 additions: power-up pickups ride segments, dynamic (storm) coins live on
 * the world root, run events can reserve a stretch of upcoming segments
 * (open road for drone attacks, traffic-jam chains), and obstacles can be
 * destroyed back into their pools.
 *
 * Pacing: obstacle rows keep a minimum *time* gap at the speed the runner
 * will have when they arrive, and a long run of rows is always followed by
 * a breather (coins only).
 */
export class WorldManager {
  readonly root = new THREE.Group();
  private segments: TrackSegment[] = [];

  private obstaclePools = new Map<ObstacleKind, Obstacle[]>();
  private coinPool: Coin[] = [];
  private coinFactory: CoinFactory;
  private pickupPool: Pickup[] = [];
  private pickupFactory: PickupFactory;
  private keyPool: Key[] = [];
  private keyFactory: KeyFactory;
  private rocketPool: Rocket[] = [];
  private rocketFactory: RocketFactory;
  /** Storm/event coins parented to the world root with absolute z. */
  private dynamicCoins: Coin[] = [];

  /** Reserved event patterns, consumed one per recycle. */
  private queuedPatterns: PatternDef[] = [];
  /** Queued patterns still ahead of the latest stretch's first one (-1 = none pending). */
  private stretchStartsIn = -1;
  /** First segment of the latest reserved stretch, once it has spawned. */
  private stretchHead: TrackSegment | null = null;
  /** Obstacle rows spawned since the last breather segment. */
  private rowStreak = 0;

  private lastPatternId: string | null = null;
  private time = 0;
  private pickupCooldown = 0;
  private keyCooldown = 0;
  private rocketCooldown = 0;
  private billboardSetIndex = 0;
  private distance = 0;
  /** Latest world speed (sizes reserved open-road stretches). */
  private speed: number = SPEED.start;

  constructor(
    scene: THREE.Scene,
    private shared: SharedAssets,
    private bag: ResourceBag
  ) {
    this.root.name = "WorldRoot";
    this.coinFactory = new CoinFactory(bag);
    this.pickupFactory = new PickupFactory(bag);
    this.keyFactory = new KeyFactory(bag);
    this.rocketFactory = new RocketFactory(bag);

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

  /**
   * Reserves the next recycled segments for a run event: each one receives
   * the next of `patterns` instead of a random pick (a traffic-jam chain, or
   * coins-only open road for a drone attack). Track the stretch with
   * `reservedStretchZ`; it spawns ~one recycle later, far beyond the fog.
   */
  reserveStretch(patterns: readonly PatternDef[]): void {
    this.stretchHead = null;
    this.stretchStartsIn = this.queuedPatterns.length;
    for (const pattern of patterns) this.queuedPatterns.push(pattern);
  }

  /**
   * Reserves coins-only open road lasting about `seconds` at the speed the
   * runner will have when it arrives (it spawns at the far end of the ring).
   */
  reserveOpenRoad(seconds: number): void {
    const ahead = WORLD.segmentLength * (WORLD.segmentCount - 1);
    const count = Math.max(1, Math.ceil((arrivalSpeed(this.speed, ahead) * seconds) / WORLD.segmentLength));
    const patterns: PatternDef[] = [];
    let last = this.lastPatternId;
    for (let i = 0; i < count; i++) {
      const pattern = pickBreather(last);
      patterns.push(pattern);
      last = pattern.id;
    }
    this.reserveStretch(patterns);
  }

  /**
   * World z of the near edge of the latest reserved stretch (negative =
   * still ahead), or null while it hasn't spawned yet / after release.
   */
  get reservedStretchZ(): number | null {
    return this.stretchHead ? this.stretchHead.originZ : null;
  }

  /**
   * Forget the reserved stretch (the event is over or gave up); reserved
   * patterns that haven't spawned yet are dropped too.
   */
  releaseStretch(): void {
    this.stretchHead = null;
    this.stretchStartsIn = -1;
    this.queuedPatterns.length = 0;
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

  /** High coin trail for rocket flight: ~1s single-lane bursts with ~1s
   * gaps (weave between paydays) spanning the whole flight plus a buffer.
   * @param flightSeconds expected flight duration @param speed world speed now
   */
  spawnRocketCoinTrail(zStart: number, flightSeconds: number, speed: number): void {
    const burstLen = ROCKET_TRAIL.burstSeconds * speed;
    const gapLen = ROCKET_TRAIL.gapSeconds * speed;
    const totalLen = speed * (flightSeconds + ROCKET_TRAIL.extraSeconds);
    let distance = ROCKET_TRAIL.leadDistance;
    let prevLane = -1;
    while (distance < totalLen) {
      // One lane per burst; never repeat the previous lane back-to-back so
      // every gap ends in a visible, rewarding lane change.
      let lane = Math.floor(Math.random() * 3);
      if (lane === prevLane) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      prevLane = lane;
      const x = -2.5 + lane * 2.5;
      const burstEnd = Math.min(distance + burstLen, totalLen);
      for (let d = distance; d < burstEnd; d += ROCKET_TRAIL.coinSpacing) {
        const coin = this.acquireCoin();
        coin.place(x, zStart - d, ROCKET_TRAIL.coinY);
        // Air coins read slightly larger/brighter at flight height.
        coin.mesh.scale.setScalar(1.12);
        this.root.add(coin.mesh);
        this.dynamicCoins.push(coin);
      }
      distance = burstEnd + gapLen;
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
    this.releaseStretch();
    this.rowStreak = 0;
    this.lastPatternId = null;
    this.pickupCooldown = 0;
    this.keyCooldown = 4;
    this.rocketCooldown = 6;

    const startZ = WORLD.recycleBehindZ;
    this.segments.forEach((segment, i) => {
      segment.originZ = startZ - i * WORLD.segmentLength;
    });
    // First two segments ahead of the runner stay clear (breathing room).
    let index = 0;
    for (const segment of this.segments) {
      if (index < 2) {
        this.spawnPattern(segment, null, SPEED.start);
      } else {
        this.recycleContent(segment, 0, SPEED.start);
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
    this.speed = speed;
    if (this.pickupCooldown > 0) this.pickupCooldown -= delta;
    if (this.keyCooldown > 0) this.keyCooldown -= delta;
    if (this.rocketCooldown > 0) this.rocketCooldown -= delta;

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
      for (const key of segment.keys) {
        key.updateVisual(delta);
      }
      for (const rocket of segment.rockets) {
        rocket.updateVisual(delta);
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
        // A reserved stretch that has fully passed stops being trackable.
        if (segment === this.stretchHead) this.stretchHead = null;
        segment.originZ = minOrigin - WORLD.segmentLength;
        minOrigin = segment.originZ;
        this.releaseSegmentEntities(segment);
        segment.decorate(this.shared, this.billboardSetIndex);
        this.recycleContent(segment, tierIndex, speed);
        this.maybeSpawnPickup(segment);
        this.maybeSpawnKey(segment);
        this.maybeSpawnRocket(segment);
      }
    }
  }

  /**
   * Re-populates a freshly recycled segment using current difficulty.
   * Reserved event patterns come first; otherwise a long streak of
   * obstacle rows is always broken by a breather.
   * @param speed current world speed — row gaps scale with the speed the
   * runner will have on arrival so reaction time stays fair.
   */
  recycleContent(segment: TrackSegment, tierIndex: number, speed: number): void {
    let pattern = this.queuedPatterns.shift();
    if (pattern) {
      if (this.stretchStartsIn === 0) this.stretchHead = segment;
      if (this.stretchStartsIn >= 0) this.stretchStartsIn--;
    } else if (this.rowStreak >= PATTERN.breatherAfterRows) {
      pattern = pickBreather(this.lastPatternId);
    } else {
      pattern = pickPattern(tierIndex, this.lastPatternId, tierIndex * PATTERN.breatherBonusPerTier);
    }
    this.lastPatternId = pattern.id;
    this.spawnPattern(segment, pattern, speed);
    const rows = countRows(segment.obstacles);
    this.rowStreak = rows > 0 ? this.rowStreak + rows : 0;
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

  forEachKey(fn: (key: Key) => void): void {
    for (const segment of this.segments) {
      if (!segment.group.visible) continue;
      for (const key of segment.keys) fn(key);
    }
  }

  forEachRocket(fn: (rocket: Rocket) => void): void {
    for (const segment of this.segments) {
      if (!segment.group.visible) continue;
      for (const rocket of segment.rockets) fn(rocket);
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

  get activeKeyCount(): number {
    let count = 0;
    this.forEachKey(() => count++);
    return count;
  }

  get activeRocketCount(): number {
    let count = 0;
    this.forEachRocket(() => count++);
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

  /** Destroy obstacles in a radius around the player after a Life Saver revive. */
  clearObstaclesAhead(playerX: number, radiusXZ: number): void {
    for (const segment of this.segments) {
      for (let i = segment.obstacles.length - 1; i >= 0; i--) {
        const ob = segment.obstacles[i];
        if (!ob.active) continue;
        const cz = segment.originZ + ob.localZ;
        if (cz < -14 || cz > 8) continue;
        if (Math.abs(ob.centerX - playerX) > radiusXZ) continue;
        // Only clear ahead + nearby — leave distant pattern intact
        if (cz > -1.5) {
          ob.active = false;
          ob.mesh.removeFromParent();
          const pool = this.obstaclePools.get(ob.kind);
          if (pool) pool.push(ob);
          segment.obstacles.splice(i, 1);
        }
      }
    }
  }

  /**
   * Releases every obstacle whose world z lies in [zFar, zNear] (both
   * negative = ahead of the runner). Used to guarantee an open landing zone
   * for the Diwali rocket. `onCleared` receives each removed obstacle's
   * world position (for a puff effect). Returns how many were removed.
   */
  clearObstaclesInRange(
    zFar: number,
    zNear: number,
    onCleared?: (x: number, y: number, z: number) => void
  ): number {
    let removed = 0;
    for (const segment of this.segments) {
      for (let i = segment.obstacles.length - 1; i >= 0; i--) {
        const ob = segment.obstacles[i];
        if (!ob.active) continue;
        const z = segment.originZ + ob.localZ;
        if (z < zFar || z > zNear) continue;
        onCleared?.(ob.centerX, ob.topY * 0.5, z);
        ob.active = false;
        ob.mesh.removeFromParent();
        const pool = this.obstaclePools.get(ob.kind);
        if (pool) pool.push(ob);
        segment.obstacles.splice(i, 1);
        removed++;
      }
    }
    return removed;
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

    for (const key of segment.keys) {
      key.active = false;
      key.mesh.removeFromParent();
      this.keyPool.push(key);
    }
    segment.keys.length = 0;

    for (const rocket of segment.rockets) {
      rocket.active = false;
      rocket.mesh.removeFromParent();
      this.rocketPool.push(rocket);
    }
    segment.rockets.length = 0;
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

  private spawnPattern(segment: TrackSegment, pattern: PatternDef | null, speed: number): void {
    if (!pattern) return;
    const arrival = arrivalSpeed(speed, -segment.originZ);
    const minGap = rowGapFor(arrival);

    // Work on copies — PATTERNS defs are shared authoring data.
    const obstacles = pattern.obstacles.map((o) => ({ ...o }));
    const coins = pattern.coins.map((c) => ({ ...c }));

    // Group obstacles into rows (same-row multi-lane walls share a z).
    // Coins authored up to this far ahead-near of a row (jump arcs span ±6m)
    // travel with that row when it is stretched farther.
    const ROW_COIN_LEAD = 7;
    const sorted = [...obstacles].sort((a, b) => b.z - a.z);
    const rows: { z: number; shift: number }[] = [];
    for (const o of sorted) {
      const row = rows.find((r) => Math.abs(r.z - o.z) <= ROW_Z_TOLERANCE);
      if (!row) rows.push({ z: o.z, shift: 0 });
    }
    rows.sort((a, b) => b.z - a.z); // nearest row first

    // Stretch rows apart so consecutive rows keep minGap meters. Rows only
    // ever move farther (never nearer), and coins authored around a row
    // (jump arcs span ±6m) travel with their row via ROW_COIN_LEAD.
    for (let i = 1; i < rows.length; i++) {
      const prevShifted = rows[i - 1].z + rows[i - 1].shift;
      const curShifted = rows[i].z + rows[i].shift;
      // How far this row intrudes into the gap the previous row needs.
      const deficit = curShifted - (prevShifted - minGap);
      if (deficit > 0) rows[i].shift -= deficit;
    }

    const rowShiftFor = (z: number): number => {
      for (const row of rows) {
        if (row.z <= z + ROW_COIN_LEAD) return row.shift;
      }
      return 0;
    };

    const applyShifts = (): void => {
      for (const o of obstacles) {
        const row = rows.find((r) => Math.abs(r.z - o.z) <= ROW_Z_TOLERANCE);
        o.z += row ? row.shift : 0;
      }
      for (const c of coins) c.z += rowShiftFor(c.z);
    };
    applyShifts();

    // Speed-scaled jump arcs: at higher speed the runner's jump carries much
    // farther, so arc coins rise higher and spread wider around their lane's
    // obstacle (1.0× at start speed → 1+arcSpeedBoost at max). Ground coin
    // lines are untouched.
    const arcK =
      1 +
      clamp((arrival - SPEED.start) / (SPEED.max - SPEED.start), 0, 1) * PATTERN.arcSpeedBoost;
    if (arcK > 1.01) {
      for (const c of coins) {
        if (!c.arc || c.y === undefined) continue;
        let anchor: number | null = null;
        let bestDz = 9;
        for (const o of obstacles) {
          if (Math.abs(laneIndexToX(o.lane) - c.x) > 0.01) continue;
          const dz = Math.abs(o.z - c.z);
          if (dz < bestDz) {
            bestDz = dz;
            anchor = o.z;
          }
        }
        if (anchor === null) continue;
        c.z = anchor + (c.z - anchor) * arcK;
        c.y = ARC_BASE_Y + (c.y - ARC_BASE_Y) * arcK;
      }
    }

    // Cross-segment fairness: the head must sit at least minGap beyond the
    // farthest obstacle already on the track, so push the whole pattern
    // (coins included) farther when the recycled segment lands too close.
    if (obstacles.length > 0) {
      const farthest = this.farthestObstacleWorldZ();
      if (farthest !== null) {
        let head = -Infinity;
        for (const o of obstacles) head = Math.max(head, o.z);
        const deficit = minGap - (farthest - (segment.originZ + head));
        if (deficit > 0) {
          for (const o of obstacles) o.z -= deficit;
          for (const c of coins) c.z -= deficit;
        }
      }
    }

    // Segment budget: rows pushed past maxTailZ are dropped (their coins
    // stay — free rewards, no threat). Every row that remains honors minGap
    // on both sides, so a pattern may shrink to nothing (a breather) but can
    // never squeeze the runner.
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (obstacles[i].z < PATTERN.maxTailZ) obstacles.splice(i, 1);
    }
    // Coins pushed off the far edge would overlap the next segment's rows.
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].z < -WORLD.segmentLength) coins.splice(i, 1);
    }

    for (const item of obstacles) {
      const obstacle = this.acquireObstacle(item.kind);
      obstacle.prepareSpawn(this.billboardSetIndex, item.variant);
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
    for (const spot of coins) {
      const coin = this.acquireCoin();
      coin.place(spot.x, spot.z, spot.y ?? 0.8);
      segment.group.add(coin.mesh);
      segment.coins.push(coin);
    }
  }

  /** World z of the farthest-ahead obstacle, or null when the track is clear. */
  private farthestObstacleWorldZ(): number | null {
    let farthest: number | null = null;
    for (const segment of this.segments) {
      for (const o of segment.obstacles) {
        const worldZ = segment.originZ + o.localZ;
        if (farthest === null || worldZ < farthest) farthest = worldZ;
      }
    }
    return farthest;
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

  private maybeSpawnKey(segment: TrackSegment): void {
    if (
      this.keyCooldown > 0 ||
      this.distance < 60 ||
      Math.random() > 0.22
    ) {
      return;
    }
    // Avoid stacking key directly on a pickup
    if (segment.pickups.length > 0) return;
    const candidateZs = [-14, -26, -38];
    for (const z of candidateZs) {
      const blocked = segment.obstacles.some(
        (o) => Math.abs(o.localZ - z) < 3.5 && o.collider.maxY > 1.0
      );
      if (blocked) continue;
      const laneFreeX = [-2.5, 0, 2.5].find(
        (x) => !segment.obstacles.some((o) => Math.abs(o.localZ - z) < 3.5 && Math.abs(o.centerX - x) < 1.6)
      );
      if (laneFreeX === undefined) continue;
      // also avoid coin line overlap for visual clarity
      const coinClog = segment.coins.some((c) => Math.abs(c.localZ - z) < 1.2 && Math.abs(c.mesh.position.x - laneFreeX) < 0.9);
      if (coinClog) continue;
      const key = this.acquireKey();
      key.place(laneFreeX, z, 1.0);
      segment.group.add(key.mesh);
      segment.keys.push(key);
      this.keyCooldown = 9;
      return;
    }
  }

  private acquireKey(): Key {
    const reused = this.keyPool.pop();
    if (reused) {
      reused.active = true;
      return reused;
    }
    const created = this.keyFactory.create();
    created.active = true;
    return created;
  }

  private maybeSpawnRocket(segment: TrackSegment): void {
    if (
      this.rocketCooldown > 0 ||
      this.distance < 140 ||
      Math.random() > 0.17
    ) {
      return;
    }
    if (segment.pickups.length > 0 || segment.keys.length > 0) return;
    const candidateZs = [-16, -28, -38];
    for (const z of candidateZs) {
      const blocked = segment.obstacles.some(
        (o) => Math.abs(o.localZ - z) < 3.8 && o.collider.maxY > 1.0
      );
      if (blocked) continue;
      const laneFreeX = [-2.5, 0, 2.5].find(
        (x) => !segment.obstacles.some((o) => Math.abs(o.localZ - z) < 3.8 && Math.abs(o.centerX - x) < 1.7)
      );
      if (laneFreeX === undefined) continue;
      const coinClog = segment.coins.some((c) => Math.abs(c.localZ - z) < 1.4 && Math.abs(c.mesh.position.x - laneFreeX) < 1.0);
      if (coinClog) continue;
      const rocket = this.acquireRocket();
      rocket.place(laneFreeX, z, 1.0);
      segment.group.add(rocket.mesh);
      segment.rockets.push(rocket);
      this.rocketCooldown = 13;
      return;
    }
  }

  private acquireRocket(): Rocket {
    const reused = this.rocketPool.pop();
    if (reused) {
      reused.active = true;
      return reused;
    }
    const created = this.rocketFactory.create();
    created.active = true;
    return created;
  }
}

export function laneIndexToX(lane: number): number {
  return -2.5 + lane * 2.5;
}

/** Distinct obstacle rows (multi-lane walls share a z) in one segment. */
function countRows(obstacles: readonly Obstacle[]): number {
  let rows = 0;
  for (let i = 0; i < obstacles.length; i++) {
    let seen = false;
    for (let j = 0; j < i; j++) {
      if (Math.abs(obstacles[j].localZ - obstacles[i].localZ) <= ROW_Z_TOLERANCE) {
        seen = true;
        break;
      }
    }
    if (!seen) rows++;
  }
  return rows;
}

/** Difficulty ramp: world speed gained per meter travelled (below max). */
const RAMP_PER_METER = (SPEED.max - SPEED.start) / SPEED.rampDistance;

/**
 * World speed expected when the runner reaches content `ahead` meters away.
 * Segments are filled ~300–400 m early and the difficulty ramp keeps
 * accelerating meanwhile; boosted speeds (turbo / JOSH) are kept as-is.
 */
function arrivalSpeed(speed: number, ahead: number): number {
  const ramped = Math.max(speed, SPEED.start) + Math.max(0, ahead) * RAMP_PER_METER;
  return Math.max(speed, Math.min(SPEED.max, ramped));
}

/** Minimum distance between consecutive obstacle rows at `speed`. */
function rowGapFor(speed: number): number {
  const t = clamp((speed - SPEED.start) / (SPEED.max - SPEED.start), 0, 1);
  return Math.max(PATTERN.minDistanceGap, speed * lerp(PATTERN.rowTimeStart, PATTERN.rowTimeEnd, t));
}

/** Obstacles within this z distance form one row (authored rows sit ≥16 m apart). */
const ROW_Z_TOLERANCE = 2;

/** Ground level the authored jump arcs rise from (see patterns.ts arc()). */
const ARC_BASE_Y = 0.75;
