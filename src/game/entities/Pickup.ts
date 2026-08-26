import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { POWERUP_DEFS } from "@/game/config/powerups";
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
    (this.mesh.userData.core as THREE.Mesh).material = kit.cores[type];
    (this.mesh.userData.ring as THREE.Mesh).material = kit.rings[type];
    this.mesh.visible = true;
    this.mesh.position.set(x, this.baseY, localZ);
    this.mesh.scale.setScalar(1);
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
    const next = this.mesh.scale.x - delta * 5;
    if (next <= 0.02) {
      this.active = false;
      this.mesh.visible = false;
      this.mesh.scale.setScalar(1);
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
  magnet: () => new THREE.OctahedronGeometry(0.42),
  shield: () => new THREE.IcosahedronGeometry(0.4),
  scoreMultiplier: () => new THREE.DodecahedronGeometry(0.38),
  turbo: () => new THREE.ConeGeometry(0.32, 0.78, 6),
} as const;

/** Builds shared geometries/materials once per Game session. */
export class PickupFactory {
  private geometries = new Map<PowerUpType, THREE.BufferGeometry>();
  private ringGeometry: THREE.TorusGeometry;
  private kit: Kit;

  constructor(private bag: ResourceBag) {
    const cores = {} as Record<PowerUpType, THREE.MeshStandardMaterial>;
    const rings = {} as Record<PowerUpType, THREE.MeshBasicMaterial>;
    for (const def of Object.values(POWERUP_DEFS)) {
      const geo = CORE_BUILDERS[def.type]();
      if (def.type === "turbo") geo.rotateX(Math.PI / 2);
      this.geometries.set(def.type, bag.geo(geo));
      cores[def.type] = bag.mat(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(def.colorHex).multiplyScalar(0.35),
          emissive: new THREE.Color(def.colorHex),
          emissiveIntensity: 1.9,
          roughness: 0.25,
          metalness: 0.3,
        })
      );
      rings[def.type] = bag.mat(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(def.colorHex),
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
    }
    this.ringGeometry = bag.geo(new THREE.TorusGeometry(0.62, 0.03, 8, 40));
    this.kit = { cores, rings };
  }

  create(type: PowerUpType): Pickup {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.geometries.get(type)!, this.kit.cores[type]);
    const ring = new THREE.Mesh(this.ringGeometry, this.kit.rings[type]);
    group.add(core, ring);
    group.userData.core = core;
    group.userData.ring = ring;
    group.userData.kit = this.kit;
    group.visible = false;
    return new Pickup(group);
  }
}
