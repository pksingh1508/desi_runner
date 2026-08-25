import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { COIN, COLORS } from "@/game/config/gameplay";

/**
 * Collectible energy token. Visuals are code-driven (spin + bob); collection
 * state is owned here so the pool can recycle instances cheaply.
 */
export class Coin {
  readonly mesh: THREE.Mesh;
  active = false;
  collected = false;

  lane = 1;
  localZ = 0;
  baseY = COIN.baseY;
  bobOffset = 0;

  private phase = Math.random() * Math.PI * 2;
  private age = Math.random() * 10;

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
  }

  get worldX(): number {
    return this.mesh.position.x;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  place(lane: number, localZ: number, y: number): void {
    this.lane = lane;
    this.localZ = localZ;
    this.baseY = y;
    this.active = true;
    this.collected = false;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.position.set(laneToX(lane), y, localZ);
  }

  updateVisual(delta: number): void {
    if (!this.active || this.collected) return;
    this.age += delta;
    this.mesh.rotation.y += COIN.spinSpeed * delta;
    this.bobOffset = Math.sin(this.age * COIN.bobSpeed + this.phase) * COIN.bobAmplitude;
    this.mesh.position.y = this.baseY + this.bobOffset;
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

export function laneToX(lane: number): number {
  // Lanes are indexed 0..2 mapping to [-2.5, 0, 2.5]; fractional lanes allowed for coins.
  return -2.5 + lane * 2.5;
}

/** Shares one geometry/material across every coin instance for a Game session. */
export class CoinFactory {
  private geometry: THREE.CylinderGeometry;
  private material: THREE.MeshStandardMaterial;

  constructor(bag: ResourceBag) {
    this.geometry = bag.geo(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 22));
    this.geometry.rotateX(Math.PI / 2); // faces toward the camera
    this.material = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x8a5a00,
        emissive: COLORS.coinGold,
        emissiveIntensity: 1.7,
        metalness: 0.65,
        roughness: 0.28,
      })
    );
  }

  create(): THREE.Mesh {
    return new THREE.Mesh(this.geometry, this.material);
  }
}
