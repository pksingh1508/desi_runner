import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { ObstacleCollider } from "@/game/entities/Obstacle";
import { LANES } from "@/game/config/gameplay";
import { LASER_PATTERN_COUNT } from "@/game/world/patterns";
import {
  COIN_STORM,
  DRONE_ATTACK,
  RUN_EVENTS_CFG,
} from "@/game/config/events";
import type { WorldManager } from "@/game/world/WorldManager";
import type { FeedbackSystem } from "./FeedbackSystem";
import type { AudioSystem } from "./AudioSystem";
import type { DifficultySystem } from "./DifficultySystem";
import { randRange, weightedIndex } from "@/game/utils/math";

type EventKind = "coinStorm" | "droneAttack" | "laserGrid";

const EVENT_DEFS: { kind: EventKind; label: string; weight: number }[] = [
  { kind: "coinStorm", label: "🪙 COIN STORM", weight: 0.4 },
  { kind: "droneAttack", label: "⚠ DRONE ATTACK", weight: 0.33 },
  { kind: "laserGrid", label: "⚠ LASER GRID AHEAD", weight: 0.27 },
];

export interface Drone {
  group: THREE.Group;
  collider: ObstacleCollider;
  laneX: number;
  state: "idle" | "warning" | "charging";
  timer: number;
}

/**
 * Occasional special moments during a run. All events announce themselves
 * first, respect cooldowns and distance gates, and are survivable by
 * construction. Drones are self-managed entities with a fair warning phase;
 * laser grids inject validated authored patterns into upcoming segments.
 */
export class RunEventSystem {
  /** Drones currently on the field; Game includes their colliders in hit tests. */
  readonly drones: Drone[] = [];

  private activeKind: EventKind | null = null;
  private state: "idle" | "announcing" | "active" | "cooldown" = "cooldown";
  private stateTimer = RUN_EVENTS_CFG.maxInterval * 0.6;
  private cooldown = 20;
  private lastKind: EventKind | null = null;
  private stormTimer = 0;
  private stormLaneCursor = 1;
  private waveIndex = 0;
  private waveTimer = 0;

  private dronePool: Drone[] = [];

  constructor(
    private world: WorldManager,
    private bag: ResourceBag,
    private feedback: FeedbackSystem,
    private audio: AudioSystem
  ) {}

  update(delta: number, distance: number, worldSpeed: number, difficultyTier: number): void {
    this.updateDrones(delta, worldSpeed);

    switch (this.state) {
      case "cooldown":
        this.stateTimer -= delta;
        if (
          this.stateTimer <= 0 &&
          distance >= RUN_EVENTS_CFG.minDistance
        ) {
          this.beginAnnounce();
        }
        break;
      case "announcing":
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) this.beginActive(difficultyTier);
        break;
      case "active":
        this.tickActive(delta, worldSpeed, difficultyTier);
        break;
      case "idle":
        break;
    }
  }

  reset(): void {
    for (const drone of this.drones) this.releaseDrone(drone);
    this.activeKind = null;
    this.state = "cooldown";
    this.stateTimer = randRange(RUN_EVENTS_CFG.minInterval, RUN_EVENTS_CFG.maxInterval) * 0.7;
    this.stormTimer = 0;
    this.waveIndex = 0;
  }

  // ------------------------------------------------------------------ intern

  private beginAnnounce(): void {
    const weights = EVENT_DEFS.map((e) => (e.kind === this.lastKind ? 0 : e.weight));
    const def = EVENT_DEFS[weightedIndex(weights)];
    this.activeKind = def.kind;
    this.lastKind = def.kind;
    this.state = "announcing";
    this.stateTimer = RUN_EVENTS_CFG.announceDuration;
    this.feedback.showBanner(def.label, RUN_EVENTS_CFG.announceDuration + COIN_STORM.duration * 0.4);
    if (def.kind !== "coinStorm") this.audio.playWarn();
    else this.audio.playPowerup();
  }

  private beginActive(tier: number): void {
    this.state = "active";
    switch (this.activeKind) {
      case "coinStorm":
        this.stateTimer = COIN_STORM.duration;
        this.stormTimer = 0;
        break;
      case "droneAttack":
        this.stateTimer = Number.POSITIVE_INFINITY;
        this.waveIndex = 0;
        this.waveTimer = 0;
        this.spawnWave(tier);
        break;
      case "laserGrid":
        this.world.queueAuthoredPatterns(LASER_PATTERN_COUNT);
        this.stateTimer = 0.5;
        break;
      default:
        this.stateTimer = 0;
    }
  }

  private tickActive(delta: number, worldSpeed: number, tier: number): void {
    switch (this.activeKind) {
      case "coinStorm": {
        this.stateTimer -= delta;
        this.stormTimer -= delta;
        if (this.stormTimer <= 0 && this.stateTimer > 2) {
          this.stormTimer = COIN_STORM.lineInterval;
          const lane = [0, 1, 2, 1][this.stormLaneCursor++ % 4];
          this.world.spawnDynamicCoinLine(
            LANES[lane],
            COIN_STORM.spawnZ,
            COIN_STORM.coinsPerLine,
            COIN_STORM.coinSpacing
          );
          void worldSpeed;
        }
        if (this.stateTimer <= 0) this.finish();
        break;
      }
      case "droneAttack": {
        this.waveTimer -= delta;
        const aliveDrones = this.drones.length > 0;
        if (this.waveIndex < DRONE_ATTACK.waves && this.waveTimer <= 0) {
          this.spawnWave(tier);
        } else if (this.waveIndex >= DRONE_ATTACK.waves && !aliveDrones) {
          this.finish();
        }
        break;
      }
      case "laserGrid":
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) this.finish();
        break;
      default:
        this.finish();
    }
  }

  private finish(): void {
    this.activeKind = null;
    this.state = "cooldown";
    this.stateTimer = randRange(RUN_EVENTS_CFG.minInterval, RUN_EVENTS_CFG.maxInterval);
  }

  private spawnWave(tier: number): void {
    this.waveIndex++;
    this.waveTimer = DRONE_ATTACK.waveGap;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const count = tier >= DRONE_ATTACK.doubleWaveTier ? Math.min(2, lanes.length - 1) : 1;
    for (let i = 0; i < count; i++) {
      this.spawnDrone(lanes[i]);
    }
  }

  private spawnDrone(lane: number): void {
    const drone = this.acquireDrone();
    drone.laneX = LANES[lane];
    drone.state = "warning";
    drone.timer = DRONE_ATTACK.warnTime;
    drone.group.position.set(drone.laneX, 1.15, DRONE_ATTACK.hoverZ);
    drone.group.visible = true;
    this.drones.push(drone);
    this.audio.playCountdownBeep(false);
  }

  private updateDrones(delta: number, worldSpeed: number): void {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];
      const mesh = drone.group;
      mesh.rotation.y += delta * 3;
      if (drone.state === "warning") {
        drone.timer -= delta;
        // Pulsing red warning glow.
        const pulse = 0.5 + Math.sin(drone.timer * 18) * 0.5;
        const eye = mesh.userData.eye as THREE.Mesh;
        const mat = eye.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.35 + pulse * 0.65;
        mesh.position.z += worldSpeed * delta; // drifts closer with the world
        if (drone.timer <= 0) drone.state = "charging";
      } else if (drone.state === "charging") {
        mesh.position.z += worldSpeed * (DRONE_ATTACK.speedFactor - 1) * delta;
        const eye = mesh.userData.eye as THREE.Mesh;
        (eye.material as THREE.MeshBasicMaterial).opacity = 1;
      }

      // Collider sync (player sits near z=0).
      const z = mesh.position.z;
      drone.collider.minX = mesh.position.x - 0.55;
      drone.collider.maxX = mesh.position.x + 0.55;
      drone.collider.minY = mesh.position.y - 0.55;
      drone.collider.maxY = mesh.position.y + 0.55;
      drone.collider.minZ = z - 0.55;
      drone.collider.maxZ = z + 0.55;

      if (z > 8) {
        this.releaseDrone(drone);
        this.drones.splice(i, 1);
      }
    }
  }

  private acquireDrone(): Drone {
    const pooled = this.dronePool.pop();
    if (pooled) return pooled;
    return this.buildDrone();
  }

  private releaseDrone(drone: Drone): void {
    drone.group.visible = false;
    drone.state = "idle";
    this.dronePool.push(drone);
  }

  private buildDrone(): Drone {
    const group = new THREE.Group();
    const bodyMat = this.bag.mat(
      new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.4, metalness: 0.7 })
    );
    const eyeMat = this.bag.mat(
      new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true })
    );
    const bodyGeo = this.bag.geo(new THREE.ConeGeometry(0.42, 0.85, 6));
    const eyeGeo = this.bag.geo(new THREE.SphereGeometry(0.16, 8, 8));
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI;
    body.castShadow = true;
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 0.12, 0.3);
    const ringGeo = this.bag.geo(new THREE.TorusGeometry(0.5, 0.04, 6, 24));
    const ringMat = this.bag.mat(
      new THREE.MeshBasicMaterial({ color: 0xef5350, transparent: true, opacity: 0.6 })
    );
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(body, eye, ring);
    group.userData.eye = eye;
    group.visible = false;
    this.world.root.add(group);
    return {
      group,
      collider: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      laneX: 0,
      state: "idle",
      timer: 0,
    };
  }
}
