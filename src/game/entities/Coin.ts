import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { COIN, COLORS } from "@/game/config/gameplay";

/**
 * Collectible energy token. Visuals are code-driven (spin + bob); collection
 * state is owned here so the pool can recycle instances cheaply.
 * A pure-gold disc (beveled rim + bright caps, no emblem) for maximum
 * outdoor readability.
 */
export class Coin {
  readonly mesh: THREE.Group;
  active = false;
  collected = false;
  /** When magnetized, visual bobbing is suspended so attraction stays smooth. */
  attracted = false;

  localZ = 0;
  baseY: number = COIN.baseY;
  bobOffset = 0;

  private phase = Math.random() * Math.PI * 2;
  private age = Math.random() * 10;

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
  }

  get worldX(): number {
    return this.mesh.position.x;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  /** x is a world-space lateral coordinate (fractional lanes allowed for curves). */
  place(x: number, localZ: number, y: number): void {
    this.localZ = localZ;
    this.baseY = y;
    this.active = true;
    this.collected = false;
    this.attracted = false;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.position.set(x, y, localZ);
  }

  updateVisual(delta: number): void {
    if (!this.active || this.collected) return;
    this.age += delta;
    if (this.attracted) return; // magnet owns the position while pulling
    this.mesh.rotation.y += COIN.spinSpeed * delta;
    this.bobOffset = Math.sin(this.age * COIN.bobSpeed + this.phase) * COIN.bobAmplitude;
    this.mesh.position.y = this.baseY + this.bobOffset;
  }

  /**
   * Smoothly accelerates toward the target (magnet pull). Frame-rate
   * independent damping; never teleports.
   */
  pullTowards(targetX: number, targetY: number, lambda: number, delta: number): void {
    const k = 1 - Math.exp(-lambda * delta);
    this.mesh.position.x += (targetX - this.mesh.position.x) * k;
    this.mesh.position.y += (targetY - this.mesh.position.y) * k;
    this.mesh.rotation.y += COIN.spinSpeed * 2.2 * delta;
  }

  /** Quick scale-out pop when collected; returns true once shrink finished. */
  playCollection(delta: number): boolean {
    const next = this.mesh.scale.x - delta * 6;
    if (next <= 0.02) {
      this.mesh.visible = false;
      this.mesh.scale.setScalar(1);
      this.collected = false;
      this.active = false;
      return true;
    }
    this.mesh.scale.setScalar(next);
    return false;
  }
}

/** Shares geometries/materials across every coin instance for a Game session. */
export class CoinFactory {
  private sideGeometry: THREE.CylinderGeometry;
  private capGeometry: THREE.CircleGeometry;
  private edgeGeometry: THREE.TorusGeometry;
  private sideMaterial: THREE.MeshStandardMaterial;
  private capMaterial: THREE.MeshStandardMaterial;
  private capMaterialBack: THREE.MeshStandardMaterial;
  private edgeMaterial: THREE.MeshStandardMaterial;
  private capOffset: number;

  constructor(bag: ResourceBag) {
    // Pure-gold disc — slightly larger than the old token for readability.
    const r = COIN.radius;
    const half = COIN.thickness / 2;
    this.sideGeometry = bag.geo(new THREE.CylinderGeometry(r, r, COIN.thickness, 26));
    this.capGeometry = bag.geo(new THREE.CircleGeometry(r - 0.015, 26));
    this.edgeGeometry = bag.geo(new THREE.TorusGeometry(r, 0.02, 10, 28));
    this.capOffset = half + 0.001;

    // Solid gold, no texture/emblem: bright face that survives daylight.
    this.sideMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xd99a00,
        emissive: 0x6b4a00,
        emissiveIntensity: 0.35,
        metalness: 0.75,
        roughness: 0.3,
      })
    );
    this.capMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0x7a5c00,
        emissiveIntensity: 0.35,
        metalness: 0.7,
        roughness: 0.26,
      })
    );
    this.capMaterialBack = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0x7a5c00,
        emissiveIntensity: 0.35,
        metalness: 0.7,
        roughness: 0.26,
      })
    );
    this.edgeMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xffe27a,
        emissive: 0x8c6a00,
        emissiveIntensity: 0.4,
        metalness: 0.65,
        roughness: 0.3,
      })
    );
  }

  create(): THREE.Group {
    const group = new THREE.Group();

    const rim = new THREE.Mesh(this.sideGeometry, this.sideMaterial);
    // Cylinder default axis is Y — rotate to face the camera (axis -> Z)
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);

    const top = new THREE.Mesh(this.capGeometry, this.capMaterial);
    top.position.z = this.capOffset;
    // Circle faces +Z by default — no rotation needed
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(this.capGeometry, this.capMaterialBack);
    bottom.position.z = -this.capOffset;
    bottom.rotation.y = Math.PI;
    group.add(bottom);

    // Bright outer rim torus for extra outdoor edge contrast (ring in XY)
    const edge = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial);
    // Torus already lies in XY, perfect for a vertical disc facing Z
    group.add(edge);

    // Coins face the runner; group rotates around world Y for spin, but
    // keep the cylinder axis aligned to camera (layout matches original
    // rotateX(PI/2) → now handled by orientation of rim/top).
    // Keep group upright; WorldManager places via position only.
    return group;
  }
}
