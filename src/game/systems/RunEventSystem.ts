import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { ObstacleCollider } from "@/game/entities/Obstacle";
import { LANES } from "@/game/config/gameplay";
import { LASER_PATTERNS } from "@/game/world/patterns";
import {
  COIN_STORM,
  DRONE_ATTACK,
  RUN_EVENTS_CFG,
  RUN_EVENT_DEFS,
  type RunEventDef,
  type RunEventKind,
} from "@/game/config/events";
import { ShaadiDroneFactory, type DroneVisual } from "@/game/entities/ShaadiDrone";
import { PaisaRain } from "@/game/entities/PaisaRain";
import type { WorldManager } from "@/game/world/WorldManager";
import type { FeedbackSystem } from "./FeedbackSystem";
import type { AudioSystem } from "./AudioSystem";
import { randRange, weightedIndex } from "@/game/utils/math";

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
 * construction:
 *  - PAISA BAARISH  (coinStorm)  — coin lines + fluttering note confetti
 *  - SHAADI DRONE ATTACK (droneAttack) — wedding camera drones lock onto a
 *    lane (red chevron telegraph + fast REC blink), then charge; one lane
 *    always stays open, on a reserved stretch of obstacle-free road so the
 *    open lane is never blocked by a regular obstacle
 *  - TRAFFIC JAM (laserGrid)     — validated authored vehicle chains on a
 *    reserved stretch; the warning goes up as the jam comes into view
 *
 * Reserved stretches spawn at the far end of the segment ring, so those
 * events wait ("approaching") until their road is just ahead.
 */
export class RunEventSystem {
  /** Drones currently on the field; Game includes their colliders in hit tests. */
  readonly drones: Drone[] = [];

  private activeKind: RunEventKind | null = null;
  private activeDef: RunEventDef | null = null;
  private state: "idle" | "approaching" | "announcing" | "active" | "cooldown" = "cooldown";
  private stateTimer = RUN_EVENTS_CFG.maxInterval * 0.6;
  private lastKind: RunEventKind | null = null;
  private stormTimer = 0;
  private stormLaneCursor = 1;
  private waveIndex = 0;
  private waveTimer = 0;

  /** Every drone ever built; any with state "idle" is free for reuse. */
  private readonly allDrones: Drone[] = [];
  private readonly visuals = new Map<Drone, DroneVisual>();
  private readonly droneFactory: ShaadiDroneFactory;
  private readonly rain: PaisaRain;
  private readonly laneScratch = [0, 1, 2];
  private readonly weightScratch: number[] = [];

  constructor(
    private world: WorldManager,
    bag: ResourceBag,
    private feedback: FeedbackSystem,
    private audio: AudioSystem
  ) {
    // Built at boot so the first event never stalls a frame.
    this.droneFactory = new ShaadiDroneFactory(bag);
    this.rain = new PaisaRain(world.root, bag);
  }

  update(delta: number, distance: number, worldSpeed: number, difficultyTier: number): void {
    this.updateDrones(delta, worldSpeed);
    this.rain.update(delta, worldSpeed, this.isStormLive());

    switch (this.state) {
      case "cooldown":
        this.stateTimer -= delta;
        if (this.stateTimer <= 0 && distance >= RUN_EVENTS_CFG.minDistance) {
          this.beginEvent();
        }
        break;
      case "approaching": {
        this.stateTimer -= delta;
        const z = this.world.reservedStretchZ;
        if (z !== null && z > -worldSpeed * RUN_EVENTS_CFG.stretchLeadSeconds) {
          this.beginAnnounce();
        } else if (this.stateTimer <= 0) {
          this.finish();
        }
        break;
      }
      case "announcing":
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) this.beginActive(difficultyTier);
        break;
      case "active":
        this.tickActive(delta, difficultyTier);
        break;
      case "idle":
        break;
    }
  }

  reset(): void {
    for (const drone of this.drones) this.hideDrone(drone);
    this.drones.length = 0;
    this.rain.clear();
    this.activeKind = null;
    this.activeDef = null;
    this.state = "cooldown";
    this.stateTimer = randRange(RUN_EVENTS_CFG.minInterval, RUN_EVENTS_CFG.maxInterval) * 0.7;
    this.stormTimer = 0;
    this.waveIndex = 0;
  }

  // ------------------------------------------------------------------ intern

  /** Notes flutter from the announcement until the storm's last line. */
  private isStormLive(): boolean {
    return this.activeKind === "coinStorm" && (this.state === "announcing" || this.state === "active");
  }

  /** Picks the next event; road events first reserve their stretch. */
  private beginEvent(): void {
    const weights = this.weightScratch;
    weights.length = 0;
    for (const def of RUN_EVENT_DEFS) weights.push(def.kind === this.lastKind ? 0 : def.weight);
    const def = RUN_EVENT_DEFS[weightedIndex(weights)];
    this.activeKind = def.kind;
    this.activeDef = def;
    this.lastKind = def.kind;
    switch (def.kind) {
      case "droneAttack":
        this.world.reserveOpenRoad(DRONE_ATTACK.openRoadSeconds);
        break;
      case "laserGrid":
        this.world.reserveStretch(LASER_PATTERNS);
        break;
      default:
        this.beginAnnounce();
        return;
    }
    this.state = "approaching";
    this.stateTimer = RUN_EVENTS_CFG.approachTimeout;
  }

  private beginAnnounce(): void {
    const def = this.activeDef;
    if (!def) {
      this.finish();
      return;
    }
    this.state = "announcing";
    this.stateTimer = RUN_EVENTS_CFG.announceDuration;
    this.feedback.showBanner(def.label, RUN_EVENTS_CFG.announceDuration + COIN_STORM.duration * 0.4);
    switch (def.kind) {
      case "coinStorm":
        this.audio.playPowerup();
        this.audio.playMeme("coinStorm");
        break;
      case "droneAttack":
        this.audio.playWarn();
        this.audio.playMeme("danger");
        break;
      case "laserGrid":
        this.audio.playWarn();
        this.audio.playHonk();
        this.audio.playMeme("danger");
        break;
    }
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
        // The jam is already on the road (reserved stretch) — just clear the flag.
        this.stateTimer = 0.5;
        break;
      default:
        this.stateTimer = 0;
    }
  }

  private tickActive(delta: number, tier: number): void {
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
        }
        if (this.stateTimer <= 0) this.finish();
        break;
      }
      case "droneAttack": {
        this.waveTimer -= delta;
        if (this.waveIndex < DRONE_ATTACK.waves && this.waveTimer <= 0) {
          this.spawnWave(tier);
        } else if (this.waveIndex >= DRONE_ATTACK.waves && this.drones.length === 0) {
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
    if (this.activeKind === "droneAttack" || this.activeKind === "laserGrid") this.world.releaseStretch();
    this.activeKind = null;
    this.activeDef = null;
    this.state = "cooldown";
    this.stateTimer = randRange(RUN_EVENTS_CFG.minInterval, RUN_EVENTS_CFG.maxInterval);
  }

  private spawnWave(tier: number): void {
    this.waveIndex++;
    this.waveTimer = DRONE_ATTACK.waveGap;
    // Fisher–Yates on a reused lane list; at most two lanes, one stays open.
    const lanes = this.laneScratch;
    lanes[0] = 0;
    lanes[1] = 1;
    lanes[2] = 2;
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = lanes[i];
      lanes[i] = lanes[j];
      lanes[j] = tmp;
    }
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
    drone.group.position.set(drone.laneX, DRONE_ATTACK.hoverY, DRONE_ATTACK.hoverZ);
    drone.group.rotation.set(0, 0, 0);
    drone.group.visible = true;
    this.visuals.get(drone)?.reset();
    this.syncCollider(drone);
    this.drones.push(drone);
    this.audio.playCountdownBeep(false);
  }

  private updateDrones(delta: number, worldSpeed: number): void {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];
      const mesh = drone.group;
      if (drone.state === "warning") {
        drone.timer -= delta;
        mesh.position.z += worldSpeed * delta; // drifts closer with the world
        if (drone.timer <= 0) drone.state = "charging";
      } else if (drone.state === "charging") {
        mesh.position.z += worldSpeed * (DRONE_ATTACK.speedFactor - 1) * delta;
      }
      this.visuals.get(drone)?.update(delta, drone.state);
      this.syncCollider(drone);

      if (mesh.position.z > 8) {
        this.hideDrone(drone);
        this.drones.splice(i, 1);
      }
    }
  }

  private syncCollider(drone: Drone): void {
    const p = drone.group.position;
    const h = DRONE_ATTACK.halfSize;
    drone.collider.minX = p.x - h;
    drone.collider.maxX = p.x + h;
    drone.collider.minY = p.y - h;
    drone.collider.maxY = p.y + h;
    drone.collider.minZ = p.z - h;
    drone.collider.maxZ = p.z + h;
  }

  private acquireDrone(): Drone {
    // Game may also release drones (smash / shield / revive) by splicing
    // them out and marking them idle — idle means free, whoever released it.
    for (const drone of this.allDrones) {
      if (drone.state === "idle" && !this.drones.includes(drone)) return drone;
    }
    return this.buildDrone();
  }

  private hideDrone(drone: Drone): void {
    drone.group.visible = false;
    drone.state = "idle";
  }

  private buildDrone(): Drone {
    const visual = this.droneFactory.create();
    this.world.root.add(visual.group);
    const drone: Drone = {
      group: visual.group,
      collider: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      laneX: 0,
      state: "idle",
      timer: 0,
    };
    this.allDrones.push(drone);
    this.visuals.set(drone, visual);
    return drone;
  }
}
