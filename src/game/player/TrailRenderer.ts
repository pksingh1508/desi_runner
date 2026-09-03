import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { getTrail } from "@/game/config/characters";

const CAPACITY = 220;

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
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/**
 * Cosmetic player trail: a small pooled Points cloud emitted at the runner's
 * feet, drifting backward with the world and fading fast. Color/intensity
 * come from the equipped trail definition; turbo/overdrive multiply emission.
 */
export class TrailRenderer {
  readonly points: THREE.Points;

  private positions = new Float32Array(CAPACITY * 3);
  private colors = new Float32Array(CAPACITY * 3);
  private sizes = new Float32Array(CAPACITY);
  private alphas = new Float32Array(CAPACITY);
  private velocities = new Float32Array(CAPACITY * 3);
  private lives = new Float32Array(CAPACITY);
  private maxLives = new Float32Array(CAPACITY);

  private alive = 0;
  private emitAccumulator = 0;
  private color = new THREE.Color(0xd9de7a);
  private strength = 0.7;
  private intensityBoost = 0;

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

  setTrail(trailId: string): void {
    const def = getTrail(trailId);
    this.color.set(def.colorHex);
    this.strength = def.strength;
  }

  /** Extra intensity from turbo/overdrive (0..2). */
  setIntensityBoost(value: number): void {
    this.intensityBoost = value;
  }

  clear(): void {
    this.alive = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  update(delta: number, x: number, y: number, worldSpeed: number, emitting: boolean): void {
    if (emitting && this.strength > 0) {
      const rate = 34 + this.intensityBoost * 55;
      this.emitAccumulator += delta * rate;
      while (this.emitAccumulator >= 1) {
        this.emitAccumulator -= 1;
        this.emit(x, y, worldSpeed);
      }
    }

    let i = 0;
    while (i < this.alive) {
      this.lives[i] -= delta;
      if (this.lives[i] <= 0) {
        const last = this.alive - 1;
        if (i !== last) this.copyParticle(last, i);
        this.alive--;
        continue;
      }
      const ix = i * 3;
      this.positions[ix] += this.velocities[ix] * delta;
      this.positions[ix + 1] += this.velocities[ix + 1] * delta;
      this.positions[ix + 2] += this.velocities[ix + 2] * delta;
      const lifeT = this.lives[i] / this.maxLives[i];
      this.alphas[i] = lifeT * lifeT;
      this.sizes[i] *= 1 - delta * 0.9;
      i++;
    }

    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.alive);
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
  }

  // ------------------------------------------------------------------ intern

  private emit(x: number, y: number, worldSpeed: number): void {
    if (this.alive >= CAPACITY) return;
    const i = this.alive++;
    const ix = i * 3;
    this.positions[ix] = x + (Math.random() - 0.5) * 0.35;
    this.positions[ix + 1] = Math.max(y + Math.random() * 0.25, 0.06);
    this.positions[ix + 2] = 0.35 + Math.random() * 0.3;
    this.velocities[ix] = (Math.random() - 0.5) * 0.5;
    this.velocities[ix + 1] = 0.4 + Math.random() * 0.6;
    this.velocities[ix + 2] = worldSpeed * (1.02 + Math.random() * 0.15);
    this.colors[ix] = this.color.r;
    this.colors[ix + 1] = this.color.g;
    this.colors[ix + 2] = this.color.b;
    const boostScale = 1 + this.intensityBoost * 0.6;
    this.sizes[i] = (5 + Math.random() * 5) * this.strength * boostScale;
    this.alphas[i] = 0.9;
    this.lives[i] = this.maxLives[i] = (0.42 + Math.random() * 0.25) * (1 + this.intensityBoost * 0.3);
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
  }
}
