import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";

/**
 * Glowing paper sky lanterns drifting up into the Diwali night. Unlit
 * (self-luminous) instanced lanterns with a gentle per-instance flicker.
 */

interface Lantern {
  x: number;
  y: number;
  z: number;
  rise: number;
  phase: number;
}

export class SkyLanterns {
  readonly mesh: THREE.InstancedMesh;
  private lanterns: Lantern[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private base = new THREE.Color(0xffa24a);
  private time = 0;

  constructor(bag: ResourceBag) {
    const count = AMBIENT.skyLanterns.count;
    const geometry = bag.geo(new THREE.CylinderGeometry(0.42, 0.3, 0.8, 6, 1, false));
    const material = bag.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = "SkyLanterns";
    // Instance buffers live on the mesh: free them when the bag disposes.
    geometry.addEventListener("dispose", () => this.mesh.dispose());
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      const l: Lantern = { x: 0, y: 0, z: 0, rise: 1, phase: Math.random() * 10 };
      this.spawn(l, 0, true);
      this.lanterns.push(l);
      this.mesh.setColorAt(i, this.color.copy(this.base));
    }
    this.mesh.visible = false;
  }

  respawnAll(cameraZ: number): void {
    for (const l of this.lanterns) this.spawn(l, cameraZ, true);
  }

  update(delta: number, worldSpeed: number, weight: number, cameraZ: number): void {
    this.mesh.visible = weight > 0.02;
    if (!this.mesh.visible) return;
    this.time += delta;
    const cfg = AMBIENT.skyLanterns;
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      l.y += l.rise * delta;
      l.z += worldSpeed * delta;
      l.x += Math.sin(this.time * 0.3 + l.phase) * 0.4 * delta;
      if (l.y > cfg.maxHeight || l.z > cameraZ + 160) this.spawn(l, cameraZ, false);
      const d = this.dummy;
      d.position.set(l.x, l.y, l.z);
      d.rotation.set(0, l.phase, Math.sin(this.time + l.phase) * 0.08);
      // Fade in from the rooftops, shrink away at altitude.
      const s = weight * Math.min(1, (l.y - cfg.minHeight + 4) / 8) * (1 - Math.max(0, (l.y - cfg.maxHeight + 20) / 20));
      d.scale.setScalar(Math.max(0, s) * 1.6);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      const flicker = 0.85 + 0.15 * Math.sin(this.time * 7 + l.phase * 13);
      this.color.copy(this.base).multiplyScalar(1.6 * flicker);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private spawn(l: Lantern, cameraZ: number, anywhere: boolean): void {
    const cfg = AMBIENT.skyLanterns;
    l.x = (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 90);
    l.y = anywhere ? cfg.minHeight + Math.random() * (cfg.maxHeight - cfg.minHeight) : cfg.minHeight;
    l.z = cameraZ - 280 + Math.random() * 420;
    l.rise = cfg.riseSpeed[0] + Math.random() * (cfg.riseSpeed[1] - cfg.riseSpeed[0]);
  }
}
