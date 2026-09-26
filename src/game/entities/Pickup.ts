import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { PICKUP_VISUAL } from "@/game/config/gameplay";
import type { PowerUpType } from "@/types/game";
import {
  createPickupAssets,
  createPickupVisuals,
  type PickupVisual,
  type SharedPickupAssets,
} from "./pickups/PickupModels";

/** Float height amplitude / speed for the idle bob. */
const BOB_AMPLITUDE = 0.16;
const BOB_SPEED = 2.4;
/** Seconds of the scale-out pop when collected. */
const COLLECT_SPEED = 5;

/**
 * Pooled track pickup for power-ups. Every instance carries all four desi
 * models (CHUMBAK magnet, NIMBU-MIRCHI charm, DOUBLE DHAMAKA anar, CHAI
 * BOOST glass) and shows the one matching its current type, so the pool can
 * re-type instances freely without allocating.
 */
export class Pickup {
  readonly mesh: THREE.Group;
  type: PowerUpType = "magnet";
  active = false;
  localZ = 0;
  baseY = 1.1;

  private age = Math.random() * 10;
  private phase = Math.random() * Math.PI * 2;
  private readonly visuals: Record<PowerUpType, PickupVisual>;
  private current: PickupVisual;

  constructor(mesh: THREE.Group, visuals: Record<PowerUpType, PickupVisual>) {
    this.mesh = mesh;
    this.visuals = visuals;
    this.current = visuals.magnet;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  place(type: PowerUpType, x: number, localZ: number): void {
    this.type = type;
    this.localZ = localZ;
    this.active = true;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    for (const key in this.visuals) {
      const visual = this.visuals[key as PowerUpType];
      visual.root.visible = visual.type === type;
    }
    this.current = this.visuals[type];
    this.current.reset();
    this.mesh.visible = true;
    this.mesh.position.set(x, this.baseY, localZ);
    this.mesh.scale.setScalar(PICKUP_VISUAL.pickupScale);
  }

  updateVisual(delta: number): void {
    if (!this.active) return;
    this.age += delta;
    this.mesh.position.y = this.baseY + Math.sin(this.age * BOB_SPEED + this.phase) * BOB_AMPLITUDE;
    this.current.update(this.age, delta);
  }

  /** Scale-out pop on collection. Returns true when finished. */
  playCollection(delta: number): boolean {
    const next = this.mesh.scale.x - delta * COLLECT_SPEED * PICKUP_VISUAL.pickupScale;
    if (next <= 0.02) {
      this.active = false;
      this.mesh.visible = false;
      this.mesh.scale.setScalar(PICKUP_VISUAL.pickupScale);
      return true;
    }
    this.mesh.scale.setScalar(next);
    return false;
  }
}

/** Builds shared geometries/materials once per Game session. */
export class PickupFactory {
  private readonly assets: SharedPickupAssets;

  constructor(private readonly bag: ResourceBag) {
    this.assets = createPickupAssets(bag);
  }

  create(type: PowerUpType): Pickup {
    const group = new THREE.Group();
    group.name = "PowerUpPickup";
    const visuals = createPickupVisuals(this.assets, this.bag);
    for (const visual of Object.values(visuals)) {
      visual.root.visible = visual.type === type;
      group.add(visual.root);
    }
    group.visible = false;
    const pickup = new Pickup(group, visuals);
    pickup.type = type;
    return pickup;
  }
}
