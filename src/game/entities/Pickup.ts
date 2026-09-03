import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { POWERUP_DEFS } from "@/game/config/powerups";
import { PICKUP_VISUAL } from "@/game/config/gameplay";
import type { PowerUpType } from "@/types/game";

/**
 * Pooled track pickup for power-ups. Each type gets a distinct core shape +
 * emissive color so it is recognizable long before collection; a slowly
 * rotating wire ring marks all types as "special".
 */
export class Pickup {
  readonly mesh: THREE.Group;
  type: PowerUpType = "magnet";
  active = false;
  localZ = 0;
  baseY = 1.1;

  private age = Math.random() * 10;
  private phase = Math.random() * Math.PI * 2;

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
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
    const kit = this.mesh.userData.kit as Kit;
    // Single-mesh cores swap paint per type; the magnet's multi-mesh
    // horseshoe carries its own materials.
    const core = this.mesh.userData.core as THREE.Object3D;
    if ((core as THREE.Mesh).isMesh) {
      (core as THREE.Mesh).material = kit.cores[type];
    }
    (this.mesh.userData.ring as THREE.Mesh).material = kit.rings[type];
    this.mesh.visible = true;
    this.mesh.position.set(x, this.baseY, localZ);
    this.mesh.scale.setScalar(PICKUP_VISUAL.pickupScale);
  }

  updateVisual(delta: number): void {
    if (!this.active) return;
    this.age += delta;
    this.mesh.rotation.y += 1.6 * delta;
    const ring = this.mesh.userData.ring as THREE.Mesh;
    ring.rotation.x = Math.PI / 2 + Math.sin(this.age * 1.4 + this.phase) * 0.5;
    ring.rotation.z += delta * 1.1;
    this.mesh.position.y = this.baseY + Math.sin(this.age * 2.4 + this.phase) * 0.16;
  }

  /** Scale-out pop on collection. Returns true when finished. */
  playCollection(delta: number): boolean {
    const next = this.mesh.scale.x - delta * 5 * PICKUP_VISUAL.pickupScale;
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

interface Kit {
  cores: Record<PowerUpType, THREE.MeshStandardMaterial>;
  rings: Record<PowerUpType, THREE.MeshBasicMaterial>;
}

const CORE_BUILDERS = {
  shield: () => new THREE.IcosahedronGeometry(0.4),
  scoreMultiplier: () => new THREE.DodecahedronGeometry(0.38),
  turbo: () => new THREE.ConeGeometry(0.32, 0.78, 6),
  // Magnet builds a real horseshoe from shared parts (see factory), not a
  // single geometry.
} as const;

type SingleCoreType = keyof typeof CORE_BUILDERS;

/**
 * Vibrant 3D paint per pickup (blue/red/black arcade combo). UI chips keep
 * the POWERUP_DEFS hex; these drive the in-world core + orbit ring only.
 */
const CORE_PAINT: Record<PowerUpType, { base: number; glow: number; ring: number }> = {
  // Glowing blue horseshoe bend + halo.
  magnet: { base: 0x0d1420, glow: 0x2e9bff, ring: 0x3fa9ff },
  shield: { base: 0x0e1a30, glow: 0x4f8dff, ring: 0x4f8dff },
  scoreMultiplier: { base: 0x2a1e05, glow: 0xe8c96a, ring: 0xe8c96a },
  // Black dart, hot-red charge + halo.
  turbo: { base: 0x140d12, glow: 0xff2d2d, ring: 0xff3b3b },
};

/** Builds shared geometries/materials once per Game session. */
export class PickupFactory {
  private geometries = new Map<SingleCoreType, THREE.BufferGeometry>();
  private ringGeometry: THREE.TorusGeometry;
  private magnetBendGeo: THREE.TorusGeometry;
  private magnetPoleGeo: THREE.CylinderGeometry;
  private magnetPoleMat: THREE.MeshStandardMaterial;
  private kit: Kit;

  constructor(private bag: ResourceBag) {
    const cores = {} as Record<PowerUpType, THREE.MeshStandardMaterial>;
    const rings = {} as Record<PowerUpType, THREE.MeshBasicMaterial>;
    for (const def of Object.values(POWERUP_DEFS)) {
      const paint = CORE_PAINT[def.type];
      if (def.type !== "magnet") {
        const geo = CORE_BUILDERS[def.type as SingleCoreType]();
        if (def.type === "turbo") geo.rotateX(Math.PI / 2);
        this.geometries.set(def.type as SingleCoreType, bag.geo(geo));
      }
      cores[def.type] = bag.mat(
        new THREE.MeshStandardMaterial({
          color: paint.base,
          emissive: new THREE.Color(paint.glow),
          emissiveIntensity: PICKUP_VISUAL.pickupCoreEmissiveIntensity,
          roughness: 0.25,
          metalness: 0.55,
        })
      );
      rings[def.type] = bag.mat(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(paint.ring),
          transparent: true,
          opacity: PICKUP_VISUAL.pickupRingOpacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
    }
    this.ringGeometry = bag.geo(new THREE.TorusGeometry(0.72, 0.045, 8, 40));
    // Horseshoe magnet parts: half-torus bend (opening faces down) + two
    // silver pole shoes. Blue body keeps the magnet's game identity.
    this.magnetBendGeo = bag.geo(new THREE.TorusGeometry(0.3, 0.13, 12, 24, Math.PI));
    this.magnetPoleGeo = bag.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 14));
    this.magnetPoleMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xf2f5fa,
        emissive: 0xbcd2ff,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        metalness: 0.6,
      })
    );
    this.kit = { cores, rings };
  }

  /** Classic U-magnet: glowing blue bend, white pole tips, faces the camera. */
  private buildMagnetCore(): THREE.Group {
    const group = new THREE.Group();
    const bend = new THREE.Mesh(this.magnetBendGeo, this.kit.cores.magnet);
    bend.castShadow = true;
    group.add(bend);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(this.magnetPoleGeo, this.magnetPoleMat);
      pole.position.set(side * 0.3, -0.12, 0);
      pole.castShadow = true;
      group.add(pole);
    }
    return group;
  }

  create(type: PowerUpType): Pickup {
    const group = new THREE.Group();
    const core: THREE.Object3D =
      type === "magnet"
        ? this.buildMagnetCore()
        : new THREE.Mesh(this.geometries.get(type as SingleCoreType)!, this.kit.cores[type]);
    const ring = new THREE.Mesh(this.ringGeometry, this.kit.rings[type]);
    group.add(core, ring);
    group.userData.core = core;
    group.userData.ring = ring;
    group.userData.kit = this.kit;
    group.visible = false;
    return new Pickup(group);
  }
}
