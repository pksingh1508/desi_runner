import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { SharedAssets } from "./SharedAssets";
import type { Obstacle } from "@/game/entities/Obstacle";
import type { Coin } from "@/game/entities/Coin";
import type { Pickup } from "@/game/entities/Pickup";
import type { Key } from "@/game/entities/Key";
import type { Rocket } from "@/game/entities/Rocket";
import { StreetDecor } from "./street/StreetDecor";

/**
 * One recycled 48 m chunk of Indian street. Visuals come from a
 * StreetDecor (street surface + 4 building rows + furniture/overhead set =
 * 6 draw calls) whose geometries are prebuilt at boot; `decorate()` only
 * re-points them. Gameplay entities are parented here by WorldManager.
 */
export class TrackSegment {
  readonly group = new THREE.Group();
  /** Gameplay entities currently parented to this segment (pooled upstream). */
  readonly obstacles: Obstacle[] = [];
  readonly coins: Coin[] = [];
  readonly pickups: Pickup[] = [];
  readonly keys: Key[] = [];
  readonly rockets: Rocket[] = [];

  private decor: StreetDecor;
  private shared: SharedAssets;

  constructor(
    readonly index: number,
    shared: SharedAssets,
    bag: ResourceBag
  ) {
    void bag; // all decor resources are owned by SharedAssets
    this.shared = shared;
    this.group.name = `segment-${index}`;
    this.decor = new StreetDecor(shared.street);
    this.decor.randomize(shared.street, shared.decorBiome);
    this.group.add(this.decor.group);
    shared.rear.register(this);
  }

  /** World z of the segment origin (near edge). Segment spans [origin-L, origin]. */
  get originZ(): number {
    return this.group.position.z;
  }

  set originZ(z: number) {
    this.group.position.z = z;
  }

  /** Per-frame: hide decor that the fog has fully swallowed. */
  updateVisual(delta: number): void {
    void delta;
    this.decor.group.visible = this.shared.isBlockVisible(this.originZ);
  }

  /**
   * Re-dress after recycling. The old look is handed to the rear ghost
   * chain first so the street behind the runner never pops. The biome comes
   * from SharedAssets.decorBiome (look-ahead, kept by BiomeManager);
   * `biomeIndex` is only a fallback.
   */
  decorate(shared: SharedAssets, biomeIndex: number): void {
    shared.rear.retire(this.decor);
    const biome = Number.isFinite(shared.decorBiome) ? shared.decorBiome : biomeIndex;
    this.decor.randomize(shared.street, biome);
  }

  /** Immediate re-dress (run reset / back to menu). */
  redecorate(biome: number): void {
    this.decor.randomize(this.shared.street, biome);
  }
}
