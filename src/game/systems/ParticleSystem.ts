import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { randRange } from "@/game/utils/math";

const CAPACITY = 640;

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (140.0 / max(-mv.z, 0.1));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.06, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/**
 * Single pooled Points cloud for all effects (coin pops, crashes, landing
 * dust, ambient speed streaks). Buffers are written in place; no allocation
 * happens per frame.
 */
export class ParticleSystem {
  readonly points: THREE.Points;

  private positions = new Float32Array(CAPACITY * 3);
  private colors = new Float32Array(CAPACITY * 3);
  private sizes = new Float32Array(CAPACITY);
  private alphas = new Float32Array(CAPACITY);
  private velocities = new Float32Array(CAPACITY * 3);
  private gravities = new Float32Array(CAPACITY);
  private lives = new Float32Array(CAPACITY);
  private maxLives = new Float32Array(CAPACITY);

  private alive = 0;
  private streakAccumulator = 0;

  constructor(scene: THREE.Scene, bag: ResourceBag) {
    const geometry = bag.geo(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    geometry.setDrawRange(0, 0);

    const material = bag.mat(
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  clear(): void {
    this.alive = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  emitCoinBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 12 && this.alive < CAPACITY; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(1.5, 4);
      this.push(
        x, y, z,
        Math.cos(angle) * speed, randRange(2.5, 5.5), Math.sin(angle) * speed,
        randRange(0.35, 0.6), randRange(7, 12),
        1.0, 0.82, 0.25,
        16
      );
    }
  }

  emitCrash(x: number, y: number, z: number): void {
    for (let i = 0; i < 26 && this.alive < CAPACITY; i++) {
      const angle = Math.random() * Math.PI * 2;
      const pitch = randRange(-0.4, 1.2);
      const speed = randRange(3, 9);
      this.push(
        x, y, z,
        Math.cos(angle) * speed, pitch * speed * 0.8, Math.sin(angle) * speed * 0.5,
        randRange(0.5, 0.9), randRange(9, 16),
        1.0, randRange(0.25, 0.55), randRange(0.15, 0.3),
        20
      );
    }
  }

  emitDust(x: number, y: number, count: number): void {
    for (let i = 0; i < count && this.alive < CAPACITY; i++) {
      this.push(
        x + randRange(-0.3, 0.3), y + 0.06, randRange(-0.2, 0.4),
        randRange(-0.8, 0.8), randRange(0.6, 1.8), randRange(1.5, 3.5),
        randRange(0.25, 0.45), randRange(4, 7),
        0.6, 0.72, 0.5,
        7
      );
    }
  }

  update(delta: number, worldSpeed: number, speedRatio: number): void {
    // Ambient speed streaks ahead of the runner.
    this.streakAccumulator += delta * (26 + speedRatio * 70);
    while (this.streakAccumulator >= 1) {
      this.streakAccumulator -= 1;
      if (this.alive >= CAPACITY) break;
      this.push(
        randRange(-6.5, 6.5), randRange(0.3, 5.5), randRange(-85, -45),
        0, 0, worldSpeed * randRange(1.05, 1.35),
        randRange(0.7, 1.1), randRange(6, 11),
        0.45, 0.6, 0.32,
        0
      );
    }

    // Integrate alive particles (swap-remove the dead).
    let i = 0;
    while (i < this.alive) {
      this.lives[i] -= delta;
      if (this.lives[i] <= 0) {
        const last = this.alive - 1;
        if (i !== last) {
          this.copyParticle(last, i);
        }
        this.alive--;
        continue;
      }
      const ix = i * 3;
      this.velocities[ix + 1] -= this.gravities[i] * delta;
      this.positions[ix] += this.velocities[ix] * delta;
      this.positions[ix + 1] += this.velocities[ix + 1] * delta;
      this.positions[ix + 2] += this.velocities[ix + 2] * delta;
      if (this.positions[ix + 1] < 0.02 && this.gravities[i] > 0) {
        this.positions[ix + 1] = 0.02;
        this.velocities[ix + 1] *= -0.35;
      }
      const lifeT = this.lives[i] / this.maxLives[i];
      this.alphas[i] = lifeT * lifeT;
      i++;
    }

    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.alive);
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
  }

  // ------------------------------------------------------------------ intern

  private push(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
    r: number, g: number, b: number,
    gravity: number
  ): void {
    if (this.alive >= CAPACITY) return;
    const i = this.alive++;
    const ix = i * 3;
    this.positions[ix] = x;
    this.positions[ix + 1] = y;
    this.positions[ix + 2] = z;
    this.velocities[ix] = vx;
    this.velocities[ix + 1] = vy;
    this.velocities[ix + 2] = vz;
    this.colors[ix] = r;
    this.colors[ix + 1] = g;
    this.colors[ix + 2] = b;
    this.sizes[i] = size;
    this.alphas[i] = 1;
    this.lives[i] = life;
    this.maxLives[i] = life;
    this.gravities[i] = gravity;
  }

  private copyParticle(from: number, to: number): void {
    const f = from * 3;
    const t = to * 3;
    for (let k = 0; k < 3; k++) {
      this.positions[t + k] = this.positions[f + k];
      this.velocities[t + k] = this.velocities[f + k];
      this.colors[t + k] = this.colors[f + k];
    }
    this.sizes[to] = this.sizes[from];
    this.alphas[to] = this.alphas[from];
    this.lives[to] = this.lives[from];
    this.maxLives[to] = this.maxLives[from];
    this.gravities[to] = this.gravities[from];
  }
}
