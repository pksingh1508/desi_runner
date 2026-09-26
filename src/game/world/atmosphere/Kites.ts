import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";

/**
 * Patang (paper kites) dancing high over the rooftops. One InstancedMesh;
 * kites drift with the world scroll and respawn far ahead, so the sky
 * stays alive in both the gameplay view (-Z) and the menu view (+Z).
 * Count follows the biome weight: kites retire only when far away or
 * behind the camera, and new ones fade in from the haze.
 */

interface KiteState {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  phase: number;
  sway: number;
  scale: number;
}

const COLORS = [0xff2d6f, 0xffc400, 0x00b86b, 0xff6a00, 0x2f6bff, 0xe01e37, 0xa23cff, 0x00b3c7, 0xffffff];

export class Kites {
  readonly mesh: THREE.InstancedMesh;
  private kites: KiteState[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private time = 0;
  private reviveTimer = 0;

  constructor(bag: ResourceBag) {
    const geometry = bag.geo(buildKiteGeometry());
    const material = bag.mat(
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    const count = AMBIENT.kites.count;
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = "Kites";
    // Instance buffers live on the mesh: free them when the bag disposes.
    geometry.addEventListener("dispose", () => this.mesh.dispose());
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.kites.push({ alive: true, x: 0, y: 0, z: 0, phase: 0, sway: 0, scale: 1 });
      this.mesh.setColorAt(i, this.color.setHex(COLORS[i % COLORS.length]));
    }
    this.respawnAll(1, 0);
  }

  /** Re-seed every kite around the camera (fresh run / back to menu). */
  respawnAll(weight: number, cameraZ: number): void {
    const target = Math.round(weight * this.kites.length);
    for (let i = 0; i < this.kites.length; i++) {
      this.spawn(this.kites[i], cameraZ, true);
      this.kites[i].alive = i < target;
    }
  }

  update(delta: number, worldSpeed: number, weight: number, cameraZ: number): void {
    this.time += delta;
    const cfg = AMBIENT.kites;
    const target = Math.round(weight * this.kites.length);
    let alive = 0;
    for (const k of this.kites) if (k.alive) alive++;
    this.reviveTimer -= delta;
    if (alive < target && this.reviveTimer <= 0) {
      for (const dead of this.kites) {
        if (dead.alive) continue;
        this.spawn(dead, cameraZ, false);
        dead.alive = true;
        break;
      }
      this.reviveTimer = 0.4;
    }
    let retireOne = alive > target;
    const dz = worldSpeed * delta;
    // Skip the draw call entirely once every kite has retired.
    this.mesh.visible = alive > 0 || target > 0;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.kites.length; i++) {
      const k = this.kites[i];
      if (k.alive) {
        k.z += dz;
        if (k.z > cameraZ + cfg.behindWrap) {
          if (retireOne) {
            k.alive = false;
            retireOne = false;
          } else this.spawn(k, cameraZ, false);
        } else if (retireOne && Math.abs(k.z - cameraZ) > cfg.retireDistance) {
          k.alive = false;
          retireOne = false;
        }
      }
      const t = this.time + k.phase;
      const d = this.dummy;
      if (!k.alive) {
        d.scale.setScalar(0);
      } else {
        d.position.set(
          k.x + Math.sin(t * 0.37) * k.sway,
          k.y + Math.sin(t * 0.61) * k.sway * 0.45,
          k.z + Math.sin(t * 0.23) * 1.5
        );
        d.rotation.set(Math.sin(t * 1.3) * 0.18, Math.sin(t * 0.5) * 0.35, Math.sin(t * 0.9) * 0.32);
        d.scale.setScalar(k.scale);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private spawn(k: KiteState, cameraZ: number, anywhere: boolean): void {
    const cfg = AMBIENT.kites;
    const side = Math.random() < 0.5 ? -1 : 1;
    k.x = side * (cfg.minLateral + Math.random() * (cfg.maxLateral - cfg.minLateral));
    k.y = cfg.minHeight + Math.random() * (cfg.maxHeight - cfg.minHeight);
    k.z = anywhere
      ? cameraZ - cfg.spawnFar + Math.random() * (cfg.spawnFar + cfg.behindWrap)
      : cameraZ - cfg.spawnFar + Math.random() * 60;
    k.phase = Math.random() * 100;
    k.sway = 1.5 + Math.random() * 3.5;
    k.scale = cfg.minScale + Math.random() * (cfg.maxScale - cfg.minScale);
  }
}

function buildKiteGeometry(): THREE.BufferGeometry {
  // Diamond sail (two-tone halves) + three tail bows, in the XY plane.
  const p: number[] = [];
  const c: number[] = [];
  const tri = (a: number[], b: number[], d: number[], shade: number): void => {
    p.push(...a, ...b, ...d);
    c.push(shade, shade, shade, shade, shade, shade, shade, shade, shade);
  };
  const top = [0, 1, 0];
  const bottom = [0, -0.85, 0];
  const left = [-0.62, 0.18, 0];
  const right = [0.62, 0.18, 0];
  tri(top, left, bottom, 1);
  tri(top, bottom, right, 0.72);
  // Spars (thin dark cross).
  tri([-0.62, 0.2, 0.01], [0.62, 0.2, 0.01], [0, 0.16, 0.01], 0.15);
  let y = -0.95;
  for (let i = 0; i < 3; i++) {
    const x = Math.sin(i * 1.7) * 0.12;
    tri([x, y, 0], [x - 0.16, y - 0.08, 0], [x - 0.16, y + 0.08, 0], 0.9);
    tri([x, y, 0], [x + 0.16, y + 0.08, 0], [x + 0.16, y - 0.08, 0], 0.9);
    y -= 0.34;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}
