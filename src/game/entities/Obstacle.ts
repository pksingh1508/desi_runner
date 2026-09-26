import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import {
  MOVER_ANIM,
  type ApproachCue,
  type ObstacleColliderDims,
  type ObstacleVariantId,
} from "@/game/config/obstacles";
import { ObstacleKit, rigFor, type ObstacleRig, type VariantRig } from "./obstacles/ObstacleKit";
import type { VariantAnimState } from "./obstacles/types";
import { damp } from "@/game/utils/math";

export type ObstacleKind =
  | "barrier"
  | "block"
  | "moving"
  | "overhead1"
  | "overhead3";

export interface ObstacleCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Gameplay metadata + pooled mesh for one obstacle instance.
 *
 * The mesh is a rig holding every Indian-street variant of its kind (cow /
 * cycle-rickshaw, truck / chai tapri …). `prepareSpawn` picks one per
 * placement — zero allocation, just visibility — and the collider box comes
 * from that variant so what the runner sees is exactly what it hits.
 */
export class Obstacle {
  readonly mesh: THREE.Group;
  readonly kind: ObstacleKind;

  active = false;
  /** Local placement inside the owning segment (x from lane, z negative). */
  localX = 0;
  localZ = 0;
  /** Overdrive / Turbo can shatter destructible obstacles instead of killing. */
  readonly destructible: boolean;

  // Skill-event bookkeeping (reset on acquire).
  /** Set once the obstacle's skill outcome has been judged after passing. */
  skillEvaluated = false;
  nearArmed = false;
  jumpSkim = false;
  slideUnder = false;

  /**
   * Optional audio cue when this obstacle approaches the runner
   * (auto-rickshaw honk, cow moo, cycle bell). Set per visual variant.
   */
  approachCue: ApproachCue | null = null;
  /** Game plays the approach cue once per spawn. */
  cuePlayed = false;
  /** Visual variant shown for the current spawn (null for rig-less meshes). */
  variantId: ObstacleVariantId | null = null;

  /** Moving obstacles oscillate around localX. */
  private baseX = 0;
  private amplitude = 0;
  private phase = 0;
  private angularSpeed = 0;

  private readonly rig: ObstacleRig | null;
  private variant: VariantRig | null = null;
  private dims: ObstacleColliderDims;
  /** Mover facing (0 = +X, -π = -X); turns through facing the runner. */
  private yaw = 0;
  private snapYaw = true;
  private readonly anim: VariantAnimState = { time: 0, delta: 0, speed: 0, travel: 0 };

  /** World-space AABB, refreshed every frame by the WorldManager. */
  readonly collider: ObstacleCollider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  /** Fallback boxes for meshes built without a variant rig. */
  private static readonly DIMENSIONS: Record<ObstacleKind, ObstacleColliderDims> = {
    barrier: { hx: 1.05, minY: 0, maxY: 0.96, hz: 0.22 },
    moving: { hx: 1.0, minY: 0, maxY: 1.04, hz: 0.24 },
    block: { hx: 1.1, minY: 0, maxY: 2.7, hz: 1.05 },
    overhead1: { hx: 1.15, minY: 1.45, maxY: 2.31, hz: 0.28 },
    overhead3: { hx: 3.85, minY: 1.45, maxY: 2.31, hz: 0.28 },
  };

  constructor(kind: ObstacleKind, mesh: THREE.Group) {
    this.kind = kind;
    this.mesh = mesh;
    // Reinforced full-width gates cannot be smashed; everything else can.
    this.destructible = kind !== "overhead3";
    this.dims = Obstacle.DIMENSIONS[kind];
    this.rig = rigFor(mesh);
    if (this.rig) this.applyVariant(this.rig.variants[0]);
  }

  /**
   * Called by WorldManager right after the obstacle is acquired for a new
   * row. Visual variants (cow vs auto, barricade vs thela…) are chosen here.
   * @param biomeIndex dominant biome (BIOMES index) for themed variants
   * @param variantHint optional authored variant (patterns may request one)
   */
  prepareSpawn(biomeIndex: number, variantHint?: ObstacleVariantId): void {
    this.cuePlayed = false;
    this.snapYaw = true;
    this.anim.time = Math.random() * 20;
    this.anim.travel = Math.random() * 3;
    this.anim.speed = 0;
    const rig = this.rig;
    if (!rig) return;
    const chosen = rig.kit.pick(rig, biomeIndex, variantHint);
    this.applyVariant(chosen);
    chosen.spec.spawn?.(chosen.parts, biomeIndex);
    // Mirrored props for free variety (colliders are symmetric in x).
    if (chosen.def.mirrorable && Math.random() < 0.5) chosen.root.scale.x = -1;
  }

  resetRuntimeFlags(): void {
    this.skillEvaluated = false;
    this.nearArmed = false;
    this.jumpSkim = false;
    this.slideUnder = false;
    this.amplitude = 0;
    this.angularSpeed = 0;
  }

  /** Top surface world y of the collider — used by perfect-jump skims. */
  get topY(): number {
    return this.collider.maxY;
  }

  get centerX(): number {
    return this.mesh.position.x;
  }

  configureMoving(amplitude: number, speed: number): void {
    this.amplitude = amplitude;
    this.angularSpeed = speed;
    this.phase = Math.random() * Math.PI * 2;
    this.baseX = this.localX;
    this.snapYaw = true;
  }

  /**
   * Sync world-space collider, moving-obstacle motion and variant animation.
   * Allocation-free; runs for every pooled obstacle on the track each frame.
   * @param segmentOriginZ world z of the owning segment's origin
   */
  refresh(delta: number, segmentOriginZ: number): void {
    const d = this.dims;
    const anim = this.anim;
    anim.delta = delta;
    anim.time += delta;
    let hx = d.hx;
    let hz = d.hz;

    if (this.kind === "moving") {
      this.phase += this.angularSpeed * delta;
      this.mesh.position.x = this.baseX + Math.sin(this.phase) * this.amplitude;
      const velocity = Math.cos(this.phase) * this.amplitude * this.angularSpeed;
      anim.speed = Math.abs(velocity);
      anim.travel += anim.speed * delta;
      // Face the travel direction; turning passes through facing the runner.
      const target = velocity >= 0 ? 0 : -Math.PI;
      if (this.snapYaw) {
        this.yaw = target;
        this.snapYaw = false;
      } else {
        this.yaw = damp(this.yaw, target, MOVER_ANIM.turnLambda, delta);
      }
      if (this.variant) this.variant.root.rotation.y = this.yaw;
      // Re-project the body box (length along facing) into world axes.
      const c = Math.abs(Math.cos(this.yaw));
      const s = Math.abs(Math.sin(this.yaw));
      hx = c * d.hx + s * d.hz;
      hz = s * d.hx + c * d.hz;
    }

    const variant = this.variant;
    if (variant && variant.spec.animate) variant.spec.animate(variant.parts, anim);

    const cx = this.mesh.position.x;
    const cz = segmentOriginZ + this.localZ;
    this.collider.minX = cx - hx;
    this.collider.maxX = cx + hx;
    this.collider.minY = d.minY;
    this.collider.maxY = d.maxY;
    this.collider.minZ = cz - hz;
    this.collider.maxZ = cz + hz;
  }

  private applyVariant(chosen: VariantRig): void {
    const rig = this.rig;
    if (rig) {
      for (const v of rig.variants) v.root.visible = v === chosen;
    }
    this.variant = chosen;
    this.variantId = chosen.def.id;
    this.dims = chosen.def.dims;
    this.approachCue = chosen.def.cue;
    chosen.root.rotation.set(0, 0, 0);
    chosen.root.scale.set(1, 1, 1);
    this.yaw = 0;
  }
}

/**
 * Builds the pooled visual for an obstacle kind: a rig with every street
 * variant of that kind (merged, shared geometries + shared materials).
 */
export function createObstacleMesh(kind: ObstacleKind, bag: ResourceBag): THREE.Group {
  return ObstacleKit.for(bag).createRig(kind).group;
}
