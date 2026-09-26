import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";

/**
 * Diwali fireworks: a fixed pool of bursts simulated entirely on the GPU
 * (one Points draw call). Spawning a burst rewrites that burst's slice of
 * attributes (origin, velocities, start time, colors); the vertex shader
 * integrates the rocket rise, the drag-slowed explosion and gravity.
 */

const CFG = AMBIENT.fireworks;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uIntensity;
attribute vec3 aVel;
attribute float aStart;
attribute vec3 aColor;
attribute float aSeed;
attribute float aKind;
varying vec3 vColor;
varying float vAlpha;
const float LIFE = ${CFG.life.toFixed(2)};
const float RISE = ${CFG.rise.toFixed(2)};
void main() {
  float t = uTime - aStart;
  vec3 p = position;
  float alpha = 0.0;
  float size = 0.0;
  if (aKind > 0.5) {
    if (t > -RISE && t < 0.0) {
      float k = (t + RISE) / RISE;
      p = position - vec3(0.0, (1.0 - k) * (1.0 - k) * 58.0, 0.0);
      alpha = 0.95;
      size = 2.6;
    }
  } else if (t > 0.0 && t < LIFE) {
    float drag = (1.0 - exp(-t * 2.3)) / 2.3;
    p = position + aVel * drag - vec3(0.0, 3.8 * t * t, 0.0);
    float life = t / LIFE;
    alpha = pow(1.0 - life, 1.4) * (0.72 + 0.28 * sin(t * 34.0 + aSeed * 60.0));
    size = mix(4.4, 2.2, life);
  }
  vColor = mix(vec3(1.0, 0.96, 0.82), aColor, clamp(t * 2.5, 0.0, 1.0));
  vAlpha = alpha * uIntensity;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = vAlpha > 0.001 ? size * uScale * 60.0 / max(-mv.z, 1.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  // Additive with alpha 1: brightness is linear in the spark's fade.
  gl_FragColor = vec4(vColor * a * 2.2, 1.0);
}
`;

const PALETTES: readonly (readonly [number, number])[] = [
  [0xffd36b, 0xff8a2a],
  [0xff4d5e, 0xffd36b],
  [0x5cff8a, 0xffffff],
  [0x6fa8ff, 0xd08cff],
  [0xff6ad5, 0xffd36b],
  [0xffffff, 0xffb347],
  [0xb18cff, 0x5cffea],
];

export class Fireworks {
  readonly points: THREE.Points;
  private readonly uniforms = {
    uTime: { value: 0 },
    uScale: { value: 4 },
    uIntensity: { value: 0 },
  };
  private origin: Float32Array;
  private vel: Float32Array;
  private start: Float32Array;
  private colors: Float32Array;
  private seeds: Float32Array;
  private kinds: Float32Array;
  private time = 0;
  private timer = 0;
  private nextBurst = 0;
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private cA = new THREE.Color();
  private cB = new THREE.Color();

  constructor(bag: ResourceBag, private renderer: THREE.WebGLRenderer) {
    const count = CFG.bursts * CFG.particlesPerBurst;
    this.origin = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.start = new Float32Array(count).fill(-1000);
    this.colors = new Float32Array(count * 3);
    this.seeds = new Float32Array(count);
    this.kinds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.seeds[i] = Math.random();
      this.kinds[i] = i % CFG.particlesPerBurst === 0 ? 1 : 0;
    }
    const g = bag.geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(this.origin, 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(this.vel, 3));
    g.setAttribute("aStart", new THREE.BufferAttribute(this.start, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));
    g.setAttribute("aKind", new THREE.BufferAttribute(this.kinds, 1));
    const m = bag.mat(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.points = new THREE.Points(g, m);
    this.points.name = "Fireworks";
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.visible = false;
  }

  clear(): void {
    this.start.fill(-1000);
    (this.points.geometry.getAttribute("aStart") as THREE.BufferAttribute).needsUpdate = true;
  }

  update(delta: number, intensity: number, camera: THREE.Camera): void {
    this.time += delta;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uScale.value = 4.2 * this.renderer.getPixelRatio();
    this.points.visible = intensity > 0.02;
    if (!this.points.visible) return;
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = (CFG.interval[0] + Math.random() * (CFG.interval[1] - CFG.interval[0])) / Math.max(0.35, intensity);
    this.spawnBurst(camera);
  }

  private spawnBurst(camera: THREE.Camera): void {
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);
    const dist = CFG.distance[0] + Math.random() * (CFG.distance[1] - CFG.distance[0]);
    const lateral = (Math.random() - 0.5) * 2 * CFG.lateral;
    const ox = camera.position.x + this.forward.x * dist + this.right.x * lateral;
    const oz = camera.position.z + this.forward.z * dist + this.right.z * lateral;
    const oy = CFG.height[0] + Math.random() * (CFG.height[1] - CFG.height[0]);
    const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this.cA.setHex(pal[0]);
    this.cB.setHex(pal[1]);
    const speed = CFG.speed[0] + Math.random() * (CFG.speed[1] - CFG.speed[0]);
    const startTime = this.time + CFG.rise;
    const ring = Math.random() < 0.25;
    const base = this.nextBurst * CFG.particlesPerBurst;
    this.nextBurst = (this.nextBurst + 1) % CFG.bursts;
    for (let k = 0; k < CFG.particlesPerBurst; k++) {
      const i = base + k;
      this.origin[i * 3] = ox;
      this.origin[i * 3 + 1] = oy;
      this.origin[i * 3 + 2] = oz;
      // Uniform sphere (or a tilted ring) of velocities.
      let vx: number;
      let vy: number;
      let vz: number;
      if (ring) {
        const a = (k / CFG.particlesPerBurst) * Math.PI * 2;
        vx = Math.cos(a);
        vy = Math.sin(a) * 0.55;
        vz = Math.sin(a) * 0.8;
      } else {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        vx = r * Math.cos(a);
        vy = u;
        vz = r * Math.sin(a);
      }
      const s = speed * (0.85 + Math.random() * 0.3);
      this.vel[i * 3] = vx * s;
      this.vel[i * 3 + 1] = vy * s;
      this.vel[i * 3 + 2] = vz * s;
      this.start[i] = startTime;
      const c = k % 2 === 0 ? this.cA : this.cB;
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
    }
    const g = this.points.geometry;
    (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aVel") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aStart") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
  }
}
