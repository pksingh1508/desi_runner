import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COIN } from "@/game/config/gameplay";

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
  /** Seconds spent homing (drives the chase acceleration). */
  magnetTime = 0;

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
    this.magnetTime = 0;
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

  /**
   * Magnet homing in WORLD space: moves toward (targetX, targetY, z=0) at
   * `chaseSpeed` (+ acceleration over time), compensating for the parent
   * segment's scroll so the pursuit is exact. Never overshoots the target.
   */
  home(targetX: number, targetY: number, chaseSpeed: number, accel: number, delta: number): void {
    this.magnetTime += delta;
    const parentZ = this.mesh.parent?.position.z ?? 0;
    const p = this.mesh.position;
    const worldZ = this.localZ + parentZ;
    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const dz = -worldZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 1e-4) {
      const speed = chaseSpeed + this.magnetTime * accel;
      const step = Math.min(dist, speed * delta) / dist;
      p.x += dx * step;
      p.y += dy * step;
      this.localZ = worldZ + dz * step - parentZ;
      p.z = this.localZ;
    }
    this.mesh.rotation.y += COIN.spinSpeed * 3 * delta;
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

/**
 * Shares ONE merged geometry + material across every coin: rim, both faces
 * and the bright edge ring are baked into a single vertex-colored mesh, so a
 * coin costs one draw call (plus one in the shadow pass) instead of four.
 */
export class CoinFactory {
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshStandardMaterial;

  constructor(bag: ResourceBag) {
    // Pure-gold disc — large and sign-free for outdoor readability.
    const r = COIN.radius;
    const half = COIN.thickness / 2;
    const paint = (geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
      const color = new THREE.Color(hex);
      const count = geometry.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return geometry;
    };
    const side = paint(new THREE.CylinderGeometry(r, r, COIN.thickness, 26, 1, true), 0xd99a00);
    side.rotateX(Math.PI / 2); // axis → Z: the disc faces the runner
    const front = paint(new THREE.CircleGeometry(r - 0.015, 26), 0xfdd013);
    front.translate(0, 0, half + 0.001);
    const back = paint(new THREE.CircleGeometry(r - 0.015, 26), 0xf5c400);
    back.rotateY(Math.PI);
    back.translate(0, 0, -(half + 0.001));
    const edge = paint(new THREE.TorusGeometry(r, 0.02, 10, 28), 0xffe27a);
    const parts = [side, front, back, edge];
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error("[DESI RUN] coin geometry merge failed");
    this.geometry = bag.geo(merged);
    this.material = bag.mat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: 0x6f4f00,
        emissiveIntensity: 0.36,
        metalness: 0.72,
        roughness: 0.28,
      })
    );
  }

  create(): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    group.add(mesh);
    return group;
  }
}
