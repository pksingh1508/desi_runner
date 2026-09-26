import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";

/**
 * Flocks of pigeons / crows circling over the bazaar. Wings flap by
 * flipping the instance's Y scale (V ↔ Λ). One InstancedMesh, no per-frame
 * allocation.
 */

interface Flock {
  x: number;
  y: number;
  z: number;
  drift: number;
  alive: boolean;
}

interface Bird {
  flock: number;
  angle: number;
  radius: number;
  speed: number;
  bob: number;
  flap: number;
  flapSpeed: number;
}

export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private flocks: Flock[] = [];
  private birds: Bird[] = [];
  private dummy = new THREE.Object3D();
  private time = 0;

  constructor(bag: ResourceBag) {
    const cfg = AMBIENT.birds;
    const geometry = bag.geo(buildBirdGeometry());
    const material = bag.mat(new THREE.MeshBasicMaterial({ color: 0x2c2724, side: THREE.DoubleSide }));
    const count = cfg.flocks * cfg.perFlock;
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = "Birds";
    // Instance buffers live on the mesh: free them when the bag disposes.
    geometry.addEventListener("dispose", () => this.mesh.dispose());
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let f = 0; f < cfg.flocks; f++) {
      this.flocks.push({ x: 0, y: 0, z: 0, drift: 0, alive: true });
      for (let i = 0; i < cfg.perFlock; i++) {
        this.birds.push({
          flock: f,
          angle: Math.random() * Math.PI * 2,
          radius: cfg.radius[0] + Math.random() * (cfg.radius[1] - cfg.radius[0]),
          speed: (0.35 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1),
          bob: Math.random() * 10,
          flap: Math.random() * 10,
          flapSpeed: cfg.flapSpeed[0] + Math.random() * (cfg.flapSpeed[1] - cfg.flapSpeed[0]),
        });
      }
    }
    this.respawnAll(1, 0);
  }

  respawnAll(weight: number, cameraZ: number): void {
    const target = Math.round(weight * this.flocks.length);
    this.flocks.forEach((f, i) => {
      this.spawn(f, cameraZ, true);
      f.alive = i < target;
    });
  }

  update(delta: number, worldSpeed: number, weight: number, cameraZ: number): void {
    this.time += delta;
    const target = Math.round(weight * this.flocks.length);
    let alive = 0;
    for (const f of this.flocks) if (f.alive) alive++;
    for (const f of this.flocks) {
      f.z += worldSpeed * delta + f.drift * delta;
      if (f.z > cameraZ + 150 || f.z < cameraZ - 360) {
        if (alive > target && f.alive) {
          f.alive = false;
          alive--;
        } else {
          if (!f.alive && alive < target) {
            f.alive = true;
            alive++;
          }
          this.spawn(f, cameraZ, false);
        }
      }
    }
    // Revive promptly when the biome wants more birds (spawned far away).
    if (alive < target) {
      for (const f of this.flocks) {
        if (f.alive) continue;
        this.spawn(f, cameraZ, false);
        f.alive = true;
        break;
      }
    }
    this.mesh.visible = alive > 0;
    if (!this.mesh.visible) return;
    const scale = AMBIENT.birds.scale;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const f = this.flocks[b.flock];
      const d = this.dummy;
      if (!f.alive) {
        d.scale.setScalar(0);
      } else {
        b.angle += b.speed * delta;
        const x = f.x + Math.cos(b.angle) * b.radius;
        const z = f.z + Math.sin(b.angle) * b.radius;
        d.position.set(x, f.y + Math.sin(this.time * 0.8 + b.bob) * 1.2, z);
        // Face along the circling tangent.
        d.rotation.set(0, -b.angle + (b.speed > 0 ? 0 : Math.PI), Math.sin(this.time * 1.1 + b.bob) * 0.25);
        const flap = Math.sin(this.time * b.flapSpeed + b.flap);
        d.scale.set(scale, scale * (0.25 + 0.75 * flap), scale);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private spawn(f: Flock, cameraZ: number, anywhere: boolean): void {
    const cfg = AMBIENT.birds;
    f.x = (Math.random() - 0.5) * 50;
    f.y = cfg.minHeight + Math.random() * (cfg.maxHeight - cfg.minHeight);
    f.z = anywhere ? cameraZ - 260 + Math.random() * 380 : cameraZ - 300 - Math.random() * 40;
    f.drift = (Math.random() - 0.5) * 3;
  }
}

function buildBirdGeometry(): THREE.BufferGeometry {
  // Two swept wings hinged on the body line (local +Z forward).
  const p = [
    // left wing
    0, 0, 0.16, 0, 0, -0.14, -0.72, 0.22, -0.1,
    // right wing
    0, 0, -0.14, 0, 0, 0.16, 0.72, 0.22, -0.1,
    // body / tail
    0, 0.02, 0.24, -0.06, 0, -0.26, 0.06, 0, -0.26,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
