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
  /** When magnetized, visual bobbing is suspended so attraction stays smooth. */
  attracted = false;

  localZ = 0;
  baseY: number = COIN.baseY;
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
