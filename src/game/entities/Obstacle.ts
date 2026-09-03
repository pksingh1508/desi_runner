import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { OBSTACLE_COLORS } from "@/game/config/gameplay";

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

/** Gameplay metadata + pooled mesh for one obstacle instance. */
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

  /** Moving obstacles oscillate around localX. */
  private baseX = 0;
  private amplitude = 0;
  private phase = 0;
  private angularSpeed = 0;

  /** World-space AABB, refreshed every frame by the WorldManager. */
  readonly collider: ObstacleCollider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  // Half extents by kind [x, yCenter, yHalf, zHalf]
  private static readonly DIMENSIONS: Record<
    ObstacleKind,
    { hx: number; cy: number; hy: number; hz: number }
  > = {
    barrier: { hx: 1.05, cy: 0.48, hy: 0.48, hz: 0.22 },
    moving: { hx: 1.0, cy: 0.52, hy: 0.52, hz: 0.24 },
    block: { hx: 1.1, cy: 1.35, hy: 1.35, hz: 1.05 },
    overhead1: { hx: 1.15, cy: 1.88, hy: 0.43, hz: 0.28 },
    overhead3: { hx: 3.85, cy: 1.88, hy: 0.43, hz: 0.28 },
  };

  constructor(kind: ObstacleKind, mesh: THREE.Group) {
    this.kind = kind;
    this.mesh = mesh;
    // Reinforced full-width gates cannot be smashed; everything else can.
    this.destructible = kind !== "overhead3";
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
  }

  /**
   * Sync world-space collider + moving-obstacle motion.
   * @param segmentOriginZ world z of the owning segment's origin
   */
  refresh(delta: number, segmentOriginZ: number): void {
    if (this.kind === "moving") {
      this.phase += this.angularSpeed * delta;
      this.mesh.position.x = this.baseX + Math.sin(this.phase) * this.amplitude;
    }
    const d = Obstacle.DIMENSIONS[this.kind];
    const cx = this.mesh.position.x;
    const cz = segmentOriginZ + this.localZ;
    this.collider.minX = cx - d.hx;
    this.collider.maxX = cx + d.hx;
    this.collider.minY = d.cy - d.hy;
    this.collider.maxY = d.cy + d.hy;
    this.collider.minZ = cz - d.hz;
    this.collider.maxZ = cz + d.hz;
  }
}

export interface SharedMats {
  bag: ResourceBag;
}

/** Builds the visual mesh for an obstacle kind. Geometries/materials are shared via the bag. */
export function createObstacleMesh(
  kind: ObstacleKind,
  bag: ResourceBag
): THREE.Group {
  const group = new THREE.Group();
  group.castShadow = true;

  // High-visibility arcade palette — one saturated, self-lit hue per
  // threat type so obstacles read instantly against the bright daylight
  // road (pastel bodies washed out under the 3.15 sun). Bodies carry
  // emissive so they glow instead of flattening; warning strips are unlit
  // MeshBasicMaterial so they stay full-bright at any distance/fog.
  const barrierBodyMat = bag.mat(
    new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLORS.barrierBody,
      emissive: OBSTACLE_COLORS.barrierBodyEmissive,
      emissiveIntensity: OBSTACLE_COLORS.barrierBodyEmissiveIntensity,
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  const barrierLegMat = bag.mat(
    new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.barrierLeg, roughness: 0.6, metalness: 0.3 })
  );
  const movingBodyMat = bag.mat(
    new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLORS.movingBody,
      emissive: OBSTACLE_COLORS.movingBodyEmissive,
      emissiveIntensity: OBSTACLE_COLORS.movingBodyEmissiveIntensity,
      roughness: 0.42,
      metalness: 0.1,
    })
  );
  const movingSkidMat = bag.mat(
    new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.movingSkid, roughness: 0.55, metalness: 0.35 })
  );
  const blockBodyMat = bag.mat(
    new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLORS.blockBody,
      emissive: OBSTACLE_COLORS.blockBodyEmissive,
      emissiveIntensity: OBSTACLE_COLORS.blockBodyEmissiveIntensity,
      roughness: 0.5,
      metalness: 0.05,
    })
  );
  const gateBeamMat = bag.mat(
    new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLORS.gateBeam,
      emissive: OBSTACLE_COLORS.gateBeamEmissive,
      emissiveIntensity: OBSTACLE_COLORS.gateBeamEmissiveIntensity,
      roughness: 0.45,
      metalness: 0.1,
    })
  );
  const gatePostMat = bag.mat(
    new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.gatePost, roughness: 0.55, metalness: 0.3 })
  );
  const dangerGlow = bag.mat(
    new THREE.MeshBasicMaterial({ color: OBSTACLE_COLORS.dangerUnder })
  );
  const warnGlow = bag.mat(
    new THREE.MeshBasicMaterial({ color: OBSTACLE_COLORS.warnStrip })
  );
  const footGlow = bag.mat(
    new THREE.MeshBasicMaterial({ color: OBSTACLE_COLORS.footGlow })
  );
  const stripeGlow = bag.mat(new THREE.MeshBasicMaterial({ color: OBSTACLE_COLORS.warnStrip }));
  const blockEdgeMat = bag.mat(
    new THREE.LineBasicMaterial({ color: OBSTACLE_COLORS.blockEdge })
  );

  switch (kind) {
    case "barrier": {
      const barGeo = bag.geo(new THREE.BoxGeometry(2.1, 0.34, 0.3));
      const bar = new THREE.Mesh(barGeo, barrierBodyMat);
      bar.position.y = 0.72;
      bar.castShadow = true;
      bar.receiveShadow = true;
      const stripGeo = bag.geo(new THREE.BoxGeometry(2.1, 0.08, 0.32));
      const strip = new THREE.Mesh(stripGeo, warnGlow);
      strip.position.y = 0.72;
      const legGeo = bag.geo(new THREE.BoxGeometry(0.14, 0.62, 0.26));
      const legL = new THREE.Mesh(legGeo, barrierLegMat);
      legL.position.set(-0.85, 0.31, 0);
      legL.castShadow = true;
      const legR = new THREE.Mesh(legGeo, barrierLegMat);
      legR.position.set(0.85, 0.31, 0);
      legR.castShadow = true;
      const footGeo = bag.geo(new THREE.BoxGeometry(2.16, 0.06, 0.42));
      const foot = new THREE.Mesh(footGeo, footGlow);
      foot.position.y = 0.03;
      group.add(bar, strip, legL, legR, foot);
      break;
    }
    case "moving": {
      const shellGeo = bag.geo(new THREE.BoxGeometry(2.0, 0.5, 0.34));
      const shell = new THREE.Mesh(shellGeo, movingBodyMat);
      shell.position.y = 0.62;
      shell.castShadow = true;
      shell.receiveShadow = true;
      const stripeGeo = bag.geo(new THREE.BoxGeometry(2.02, 0.12, 0.36));
      const stripe = new THREE.Mesh(stripeGeo, stripeGlow);
      stripe.position.y = 0.62;
      const skidGeo = bag.geo(new THREE.BoxGeometry(0.5, 0.34, 0.3));
      const skidL = new THREE.Mesh(skidGeo, movingSkidMat);
      skidL.position.set(-0.65, 0.17, 0);
      const skidR = new THREE.Mesh(skidGeo, movingSkidMat);
      skidR.position.set(0.65, 0.17, 0);
      group.add(shell, stripe, skidL, skidR);
      break;
    }
    case "block": {
      const crateGeo = bag.geo(new THREE.BoxGeometry(2.2, 2.7, 2.1));
      const crate = new THREE.Mesh(crateGeo, blockBodyMat);
      crate.position.y = 1.35;
      crate.castShadow = true;
      crate.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(crateGeo), blockEdgeMat);
      edges.position.y = 1.35;
      const coreGeo = bag.geo(new THREE.BoxGeometry(0.9, 0.9, 0.08));
      const core = new THREE.Mesh(coreGeo, dangerGlow);
      core.position.set(0, 1.5, -1.06);
      // Second warning core on the player-facing side — walls read as
      // danger from the front, not just from behind.
      const faceGeo = bag.geo(new THREE.BoxGeometry(0.9, 0.9, 0.08));
      const face = new THREE.Mesh(faceGeo, warnGlow);
      face.position.set(0, 1.5, 1.06);
      group.add(crate, edges, core, face);
      break;
    }
    case "overhead1":
    case "overhead3": {
      const width = kind === "overhead3" ? 7.7 : 2.3;
      const beamGeo = bag.geo(new THREE.BoxGeometry(width, 0.86, 0.56));
      const beam = new THREE.Mesh(beamGeo, gateBeamMat);
      beam.position.y = 1.88;
      beam.castShadow = true;
      beam.receiveShadow = true;
      const warnGeo = bag.geo(new THREE.BoxGeometry(width * 0.96, 0.14, 0.58));
      const warn = new THREE.Mesh(warnGeo, warnGlow);
      warn.position.y = 1.52;
      const underGeo = bag.geo(new THREE.BoxGeometry(width * 0.98, 0.06, 0.5));
      const under = new THREE.Mesh(underGeo, dangerGlow);
      under.position.y = 1.46;
      group.add(beam, warn, under);
      if (kind === "overhead3") {
        const postGeo = bag.geo(new THREE.BoxGeometry(0.28, 2.32, 0.34));
        const postL = new THREE.Mesh(postGeo, gatePostMat);
        postL.position.set(-3.75, 1.16, 0);
        postL.castShadow = true;
        const postR = new THREE.Mesh(postGeo, gatePostMat);
        postR.position.set(3.75, 1.16, 0);
        postR.castShadow = true;
        group.add(postL, postR);
      }
      break;
    }
  }

  return group;
}
