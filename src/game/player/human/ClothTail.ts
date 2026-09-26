import * as THREE from "three";
import { HUMAN_RIG } from "@/game/config/humanRig";

export interface ClothTailOptions {
  /** Bone the cloth hangs from. */
  bone: THREE.Bone;
  /** Anchor in the bone's local space (bind point × bone inverse). */
  anchorLocal: THREE.Vector3;
  /** Second anchor for the ribbon width direction (bone local). */
  widthLocal: THREE.Vector3;
  length: number;
  width: number;
  material: THREE.Material;
  /** Flutter phase so twin tails don't move in lockstep. */
  phase: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/**
 * A flowing cloth strip (dupatta / gamcha end) simulated as a verlet chain in
 * world space: gravity + relative wind from the runner's forward speed +
 * flutter, with distance constraints and a keep-behind-the-back rule. The
 * ribbon is extruded along the anchor's shoulder axis and rendered as one
 * dynamic mesh. Buffers are allocated once; stepping never allocates.
 */
export class ClothTail {
  readonly mesh: THREE.Mesh;

  private readonly count: number;
  private readonly segmentLength: number;
  private readonly halfWidth: number;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private initialized = false;
  private time = 0;
  private anchor = new THREE.Vector3();
  private widthDir = new THREE.Vector3(1, 0, 0);

  constructor(private readonly options: ClothTailOptions) {
    const segments = HUMAN_RIG.cloth.segments;
    this.count = segments + 1;
    this.segmentLength = options.length / segments;
    this.halfWidth = options.width / 2;
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);

    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 2 * 3);
    this.normals = new Float32Array(this.count * 2 * 3);
    const uvs = new Float32Array(this.count * 2 * 2);
    const indices: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const v = i / segments;
      uvs.set([0, v, 1, v], i * 4);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, options.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = "ClothTail";
  }

  /** Snap the chain to hang from the anchor (after teleports / resets). */
  reset(): void {
    this.initialized = false;
  }

  /**
   * @param origin world position of the object the mesh is parented to
   *   (vertices are written relative to it; it must not rotate/scale)
   * @param worldSpeed forward speed in m/s (relative wind)
   */
  update(delta: number, origin: THREE.Vector3, worldSpeed: number): void {
    const { bone, anchorLocal, widthLocal, phase } = this.options;
    bone.updateWorldMatrix(true, false);
    this.anchor.copy(anchorLocal).applyMatrix4(bone.matrixWorld);
    tmpA.copy(widthLocal).applyMatrix4(bone.matrixWorld);
    this.widthDir.subVectors(tmpA, this.anchor);
    if (this.widthDir.lengthSq() < 1e-8) this.widthDir.set(1, 0, 0);
    this.widthDir.normalize();

    const pos = this.pos;
    const prev = this.prev;
    if (!this.initialized) {
      for (let i = 0; i < this.count; i++) {
        const o = i * 3;
        pos[o] = this.anchor.x;
        pos[o + 1] = this.anchor.y - i * this.segmentLength;
        pos[o + 2] = this.anchor.z + i * 0.01;
        prev[o] = pos[o];
        prev[o + 1] = pos[o + 1];
        prev[o + 2] = pos[o + 2];
      }
      this.initialized = true;
    }

    const dt = Math.min(delta, 1 / 30);
    if (dt <= 0) {
      this.writeMesh(origin);
      return;
    }
    this.time += dt;
    const cfg = HUMAN_RIG.cloth;
    const wind = Math.min(worldSpeed * cfg.windPerSpeed, cfg.windMax);
    const dt2 = dt * dt;
    // Damping expressed per 60 Hz step so 30/60/120 FPS behave alike.
    const damping = Math.pow(cfg.damping, dt * 60);

    // Verlet integrate (skip the pinned anchor).
    for (let i = 1; i < this.count; i++) {
      const o = i * 3;
      const t = i / (this.count - 1);
      const wave = this.time * (7 + wind * 0.5) - i * 0.85 + phase;
      const accX = Math.sin(wave) * (1.5 + wind * 1.1) * t;
      const accY = -cfg.gravity + Math.cos(wave * 1.3) * (0.8 + wind * 0.7) * t;
      const accZ = wind * 3.4;
      const vx = (pos[o] - prev[o]) * damping;
      const vy = (pos[o + 1] - prev[o + 1]) * damping;
      const vz = (pos[o + 2] - prev[o + 2]) * damping;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      pos[o] += vx + accX * dt2;
      pos[o + 1] += vy + accY * dt2;
      pos[o + 2] += vz + accZ * dt2;
    }

    // Distance constraints + stay behind the back and above the road.
    pos[0] = this.anchor.x;
    pos[1] = this.anchor.y;
    pos[2] = this.anchor.z;
    for (let iter = 0; iter < cfg.iterations; iter++) {
      for (let i = 1; i < this.count; i++) {
        const a = (i - 1) * 3;
        const b = i * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (dist - this.segmentLength) / dist;
        if (i === 1) {
          pos[b] -= dx * diff;
          pos[b + 1] -= dy * diff;
          pos[b + 2] -= dz * diff;
        } else {
          pos[a] += dx * diff * 0.5;
          pos[a + 1] += dy * diff * 0.5;
          pos[a + 2] += dz * diff * 0.5;
          pos[b] -= dx * diff * 0.5;
          pos[b + 1] -= dy * diff * 0.5;
          pos[b + 2] -= dz * diff * 0.5;
        }
        // Keep the cloth behind the runner's back (+Z) and off the road.
        const minZ = this.anchor.z + 0.02;
        if (pos[b + 2] < minZ) pos[b + 2] = minZ;
        if (pos[b + 1] < 0.03) pos[b + 1] = 0.03;
      }
    }

    this.writeMesh(origin);
  }

  private writeMesh(origin: THREE.Vector3): void {
    const pos = this.pos;
    const out = this.positions;
    const nrm = this.normals;
    const hw = this.halfWidth;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      // Taper slightly toward the free end.
      const w = hw * (1 - (i / (this.count - 1)) * 0.25);
      const px = pos[o] - origin.x;
      const py = pos[o + 1] - origin.y;
      const pz = pos[o + 2] - origin.z;
      const v = i * 6;
      out[v] = px - this.widthDir.x * w;
      out[v + 1] = py - this.widthDir.y * w;
      out[v + 2] = pz - this.widthDir.z * w;
      out[v + 3] = px + this.widthDir.x * w;
      out[v + 4] = py + this.widthDir.y * w;
      out[v + 5] = pz + this.widthDir.z * w;

      // Normal = width × chain tangent.
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(this.count - 1, i + 1) * 3;
      tmpB.set(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
      tmpC.copy(this.widthDir);
      tmpN.crossVectors(tmpC, tmpB);
      if (tmpN.lengthSq() < 1e-10) tmpN.set(0, 0, 1);
      tmpN.normalize();
      nrm[v] = tmpN.x;
      nrm[v + 1] = tmpN.y;
      nrm[v + 2] = tmpN.z;
      nrm[v + 3] = tmpN.x;
      nrm[v + 4] = tmpN.y;
      nrm[v + 5] = tmpN.z;
    }
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("normal") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
