import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { makeCanvas } from "../gfx/canvas";
import { createRng, rChance, rRange, type Rng } from "../gfx/random";

/**
 * Distant Indian skyline: two camera-centered rings (near city band, far
 * monuments) sharing one silhouette texture. The texture holds two sets —
 * old city (temple shikharas, domes + minarets, chhatris, hill forts, water
 * tanks) and modern Mumbai (high-rises, chawls, cranes, a cable-stayed
 * bridge) — and `uModern` dissolves between them per biome. One draw call,
 * alpha-tested, no fog (the shader hazes toward the horizon color itself).
 * Texture: A = silhouette, R = window lights (night glow).
 */

const TEX_W = 2048;
const TEX_H = 1024;
const BAND_H = 256;

const LAYERS = [
  { radius: 235, height: 62, repeats: 3, base: -5 },
  { radius: 340, height: 96, repeats: 3, base: -7 },
] as const;

const VERT = /* glsl */ `
attribute float aLayer;
attribute float aHeight;
varying vec2 vUv;
varying float vLayer;
varying float vHeight;
void main() {
  vUv = uv;
  vLayer = aLayer;
  vHeight = aHeight;
  vec3 wp = position + vec3(cameraPosition.x, 0.0, cameraPosition.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uHaze;
uniform vec3 uWindow;
uniform float uWindowGlow;
uniform float uHazeAmount;
uniform float uModern;
varying vec2 vUv;
varying float vLayer;
varying float vHeight;
void main() {
  vec4 tOld = texture2D(uMap, vUv);
  vec4 tNew = texture2D(uMap, vUv + vec2(0.0, 0.5));
  float a = mix(tOld.a, tNew.a, uModern);
  if (a < 0.5) discard;
  float lights = mix(tOld.r, tNew.r, uModern);
  vec3 base = mix(uNear, uFar, vLayer);
  float haze = clamp(mix(0.12, 0.5, vLayer) + (1.0 - vHeight) * 0.35, 0.0, 1.0) * uHazeAmount;
  vec3 col = mix(base, uHaze, haze);
  col += uWindow * lights * uWindowGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Skyline {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uMap: { value: null as THREE.Texture | null },
    uNear: { value: new THREE.Color() },
    uFar: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() },
    uWindow: { value: new THREE.Color() },
    uWindowGlow: { value: 0 },
    uHazeAmount: { value: 0.6 },
    /** 0 = old-city silhouettes, 1 = modern Mumbai high-rises. */
    uModern: { value: 0 },
  };

  constructor(bag: ResourceBag) {
    const texture = bag.tex(new THREE.CanvasTexture(paintSkyline()));
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    this.uniforms.uMap.value = texture;

    const geometry = bag.geo(buildRings());
    const material = bag.mat(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        // Ring faces point inward (the camera is always inside).
        side: THREE.FrontSide,
        fog: false,
      })
    );
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "Skyline";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.matrixAutoUpdate = false;
  }
}

function buildRings(): THREE.BufferGeometry {
  const segments = 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const layers: number[] = [];
  const heights: number[] = [];
  const indices: number[] = [];
  LAYERS.forEach((layer, li) => {
    const start = positions.length / 3;
    // Canvas band: layer 0 → rows [0, 256), layer 1 → [256, 512). flipY=false.
    const vTop = (li * BAND_H + 1) / TEX_H;
    const vBottom = ((li + 1) * BAND_H - 1) / TEX_H;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * layer.radius;
      const z = Math.sin(a) * layer.radius;
      const u = (i / segments) * layer.repeats + li * 0.37;
      positions.push(x, layer.base, z, x, layer.base + layer.height, z);
      uvs.push(u, vBottom, u, vTop);
      layers.push(li, li);
      heights.push(0, 1);
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2;
      const b = a + 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aLayer", new THREE.Float32BufferAttribute(layers, 1));
  g.setAttribute("aHeight", new THREE.Float32BufferAttribute(heights, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ paint

function paintSkyline(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(TEX_W, TEX_H);
  const rng = createRng(31337);
  paintNearBand(ctx, rng, 0);
  paintFarBand(ctx, rng, BAND_H);
  paintModernNear(ctx, rng, BAND_H * 2);
  paintModernFar(ctx, rng, BAND_H * 3);
  return canvas;
}

const SIL = "rgb(0,0,0)";
const LIT = "rgb(255,0,0)";

/** Draw at x and its horizontal wrap copy so the band tiles seamlessly. */
function wrapX(x: number, width: number, fn: (ox: number) => void): void {
  fn(0);
  if (x + width > TEX_W) fn(-TEX_W);
  if (x < 0) fn(TEX_W);
}

function windows(ctx: CanvasRenderingContext2D, rng: Rng, x: number, top: number, w: number, bottom: number, density: number): void {
  for (let y = top + 5; y < bottom - 6; y += 7) {
    for (let wx = x + 3; wx < x + w - 4; wx += 6) {
      if (!rChance(rng, density)) continue;
      ctx.fillStyle = LIT;
      ctx.fillRect(wx, y, 3, 3);
    }
  }
}

function block(ctx: CanvasRenderingContext2D, rng: Rng, x: number, baseY: number, w: number, h: number, lit: number): void {
  wrapX(x, w, (ox) => {
    ctx.fillStyle = SIL;
    ctx.fillRect(x + ox, baseY - h, w, h);
    // Rooftop clutter: water tanks, stair rooms, antennas.
    if (rChance(rng, 0.7)) {
      const tw = rRange(rng, 5, 9);
      const tx = x + ox + rRange(rng, 2, Math.max(3, w - tw - 2));
      ctx.fillRect(tx, baseY - h - 6, tw, 6);
      ctx.fillRect(tx + 1, baseY - h - 8, tw - 2, 2);
    }
    if (rChance(rng, 0.4)) ctx.fillRect(x + ox + w * 0.6, baseY - h - 12, 1.5, 12);
    if (rChance(rng, 0.3)) ctx.fillRect(x + ox + 2, baseY - h - 9, w * 0.35, 9);
    windows(ctx, rng, x + ox, baseY - h, w, baseY, lit);
  });
}

function mobileTower(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number): void {
  wrapX(x, 24, (ox) => {
    const cx = x + ox;
    ctx.strokeStyle = SIL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, baseY);
    ctx.lineTo(cx - 2, baseY - h);
    ctx.moveTo(cx + 9, baseY);
    ctx.lineTo(cx + 2, baseY - h);
    for (let y = baseY; y > baseY - h + 10; y -= 12) {
      const t = (baseY - y) / h;
      const half = 9 - 7 * t;
      const t2 = (baseY - (y - 12)) / h;
      const half2 = 9 - 7 * t2;
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx + half2, y - 12);
      ctx.moveTo(cx + half, y);
      ctx.lineTo(cx - half2, y - 12);
    }
    ctx.stroke();
    ctx.fillStyle = SIL;
    ctx.fillRect(cx - 7, baseY - h + 6, 3, 12);
    ctx.fillRect(cx + 4, baseY - h + 6, 3, 12);
    ctx.fillRect(cx - 1, baseY - h - 10, 2, 12);
    ctx.fillStyle = LIT;
    ctx.fillRect(cx - 1.5, baseY - h - 12, 3, 3);
  });
}

function shikhara(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  wrapX(x - w, w * 2, (ox) => {
    const cx = x + ox;
    ctx.fillStyle = SIL;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, baseY);
    ctx.lineTo(cx - w / 2, baseY - h * 0.25);
    ctx.bezierCurveTo(cx - w / 2, baseY - h * 0.75, cx - w * 0.2, baseY - h * 0.95, cx, baseY - h);
    ctx.bezierCurveTo(cx + w * 0.2, baseY - h * 0.95, cx + w / 2, baseY - h * 0.75, cx + w / 2, baseY - h * 0.25);
    ctx.lineTo(cx + w / 2, baseY);
    ctx.closePath();
    ctx.fill();
    // Amalaka disc, kalash, flag.
    ctx.beginPath();
    ctx.ellipse(cx, baseY - h - 2, w * 0.18, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 1.5, baseY - h - 12, 3, 10);
    ctx.fillRect(cx, baseY - h - 22, 1.2, 10);
    ctx.beginPath();
    ctx.moveTo(cx + 1, baseY - h - 22);
    ctx.lineTo(cx + 9, baseY - h - 19);
    ctx.lineTo(cx + 1, baseY - h - 16);
    ctx.fill();
    // Smaller subsidiary spires.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      const sx = cx + s * w * 0.62;
      ctx.moveTo(sx - w * 0.22, baseY);
      ctx.lineTo(sx - w * 0.22, baseY - h * 0.3);
      ctx.quadraticCurveTo(sx, baseY - h * 0.62, sx + w * 0.22, baseY - h * 0.3);
      ctx.lineTo(sx + w * 0.22, baseY);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function domeWithMinarets(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  wrapX(x - w, w * 2.2, (ox) => {
    const cx = x + ox;
    ctx.fillStyle = SIL;
    // Hall + onion dome.
    ctx.fillRect(cx - w * 0.55, baseY - h * 0.35, w * 1.1, h * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.36, baseY - h * 0.35);
    ctx.bezierCurveTo(cx - w * 0.5, baseY - h * 0.7, cx - w * 0.1, baseY - h * 0.8, cx, baseY - h * 0.95);
    ctx.bezierCurveTo(cx + w * 0.1, baseY - h * 0.8, cx + w * 0.5, baseY - h * 0.7, cx + w * 0.36, baseY - h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 1, baseY - h, 2, h * 0.08);
    for (const s of [-1, 1]) {
      const mx = cx + s * w * 0.72;
      ctx.fillRect(mx - 3, baseY - h * 0.9, 6, h * 0.9);
      ctx.fillRect(mx - 5, baseY - h * 0.55, 10, 3);
      ctx.fillRect(mx - 5, baseY - h * 0.78, 10, 3);
      ctx.beginPath();
      ctx.arc(mx, baseY - h * 0.9, 5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(mx - 0.8, baseY - h - 4, 1.6, h * 0.1);
    }
    // Two smaller domes.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * w * 0.34, baseY - h * 0.35, w * 0.14, Math.PI, 0);
      ctx.fill();
    }
  });
}

function chhatri(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number): void {
  wrapX(x - w, w * 2, (ox) => {
    const cx = x + ox;
    ctx.fillStyle = SIL;
    ctx.fillRect(cx - w / 2, baseY - 6, w, 6);
    ctx.fillRect(cx - w / 2, baseY - w * 0.7, 2, w * 0.7);
    ctx.fillRect(cx + w / 2 - 2, baseY - w * 0.7, 2, w * 0.7);
    ctx.fillRect(cx - w * 0.6, baseY - w * 0.75, w * 1.2, 3);
    ctx.beginPath();
    ctx.arc(cx, baseY - w * 0.75, w * 0.45, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 0.8, baseY - w * 1.3, 1.6, w * 0.2);
  });
}

function trees(ctx: CanvasRenderingContext2D, rng: Rng, x: number, baseY: number, w: number): void {
  wrapX(x, w, (ox) => {
    ctx.fillStyle = SIL;
    for (let k = 0; k < w / 8; k++) {
      ctx.beginPath();
      ctx.arc(x + ox + rng() * w, baseY - rRange(rng, 8, 22), rRange(rng, 6, 12), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintNearBand(ctx: CanvasRenderingContext2D, rng: Rng, top: number): void {
  const baseY = top + BAND_H;
  // Continuous low old-city fabric: 2-5 storey blocks with tanks.
  let x = 0;
  while (x < TEX_W) {
    const w = rRange(rng, 16, 58);
    const h = rRange(rng, 26, 70);
    block(ctx, rng, x, baseY, w + 1, h, 0.28);
    x += w;
  }
  // Landmarks: temples, mosques, chhatris, trees, one slim mobile tower.
  const kinds = ["shikhara", "dome", "shikhara", "trees", "chhatri", "dome", "trees", "tower", "shikhara", "trees"];
  kinds.forEach((kind, i) => {
    const lx = (i + rng() * 0.7) * (TEX_W / kinds.length);
    if (kind === "tower") mobileTower(ctx, lx, baseY - rRange(rng, 50, 70), rRange(rng, 60, 80));
    else if (kind === "shikhara") shikhara(ctx, lx, baseY, rRange(rng, 30, 44), rRange(rng, 95, 140));
    else if (kind === "dome") domeWithMinarets(ctx, lx, baseY, rRange(rng, 38, 54), rRange(rng, 90, 130));
    else if (kind === "chhatri") chhatri(ctx, lx, baseY - rRange(rng, 55, 70), rRange(rng, 16, 22));
    else trees(ctx, rng, lx, baseY - 30, rRange(rng, 50, 100));
  });
}

function paintFarBand(ctx: CanvasRenderingContext2D, rng: Rng, top: number): void {
  const baseY = top + BAND_H;
  // Rolling hills crowned by a fort wall along one stretch.
  const hillAt = (x: number): number => Math.max(0, Math.sin((x / TEX_W) * Math.PI * 2 * 2 + 1.3)) * 64 + Math.sin(x * 0.02) * 6 + 16;
  ctx.fillStyle = SIL;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= TEX_W; x += 16) ctx.lineTo(x, baseY - hillAt(x));
  ctx.lineTo(TEX_W, baseY);
  ctx.closePath();
  ctx.fill();
  for (let x = 200; x < 760; x += 14) {
    const hill = hillAt(x);
    ctx.fillRect(x, baseY - hill - 16, 9, 18);
    if (x % 70 < 14) ctx.fillRect(x - 3, baseY - hill - 28, 15, 30);
  }
  // Low city band.
  let x = 0;
  while (x < TEX_W) {
    const w = rRange(rng, 22, 70);
    const h = rRange(rng, 18, 46);
    block(ctx, rng, x, baseY, w + 1, h, 0.18);
    x += w;
  }
  // Monuments.
  const kinds = ["dome", "shikhara", "clock", "dome", "chhatri", "shikhara", "dome", "chhatri"];
  kinds.forEach((kind, i) => {
    const lx = (i + 0.2 + rng() * 0.6) * (TEX_W / kinds.length);
    if (kind === "dome") domeWithMinarets(ctx, lx, baseY, rRange(rng, 60, 90), rRange(rng, 140, 200));
    else if (kind === "shikhara") shikhara(ctx, lx, baseY, rRange(rng, 44, 60), rRange(rng, 150, 210));
    else if (kind === "chhatri") chhatri(ctx, lx, baseY - rRange(rng, 40, 80), rRange(rng, 18, 28));
    else clockTower(ctx, lx, baseY);
  });
}

function clockTower(ctx: CanvasRenderingContext2D, lx: number, baseY: number): void {
  wrapX(lx, 22, (ox) => {
    ctx.fillStyle = SIL;
    ctx.fillRect(lx + ox, baseY - 170, 18, 170);
    ctx.beginPath();
    ctx.moveTo(lx + ox - 3, baseY - 170);
    ctx.lineTo(lx + ox + 9, baseY - 196);
    ctx.lineTo(lx + ox + 21, baseY - 170);
    ctx.fill();
    ctx.fillStyle = LIT;
    ctx.beginPath();
    ctx.arc(lx + ox + 9, baseY - 150, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Mumbai: chawls in front of stacked high-rises and cranes. */
function paintModernNear(ctx: CanvasRenderingContext2D, rng: Rng, top: number): void {
  const baseY = top + BAND_H;
  let x = 0;
  while (x < TEX_W) {
    const w = rRange(rng, 30, 80);
    const h = rRange(rng, 40, 90);
    block(ctx, rng, x, baseY, w + 1, h, 0.35);
    x += w;
  }
  for (let i = 0; i < 16; i++) {
    const lx = rng() * TEX_W;
    const w = rRange(rng, 24, 46);
    const h = rRange(rng, 110, 200);
    tower(ctx, rng, lx, baseY, w, h);
  }
  crane(ctx, rng() * TEX_W, baseY - 60, 140);
  mobileTower(ctx, rng() * TEX_W, baseY - 80, 70);
}

function paintModernFar(ctx: CanvasRenderingContext2D, rng: Rng, top: number): void {
  const baseY = top + BAND_H;
  let x = 0;
  while (x < TEX_W) {
    const w = rRange(rng, 20, 60);
    const h = rRange(rng, 30, 80);
    block(ctx, rng, x, baseY, w + 1, h, 0.2);
    x += w;
  }
  for (let i = 0; i < 22; i++) tower(ctx, rng, rng() * TEX_W, baseY, rRange(rng, 26, 52), rRange(rng, 120, 236));
  // Generic cable-stayed bridge low on the horizon.
  const bx = rng() * (TEX_W - 700);
  ctx.fillStyle = SIL;
  ctx.fillRect(bx, baseY - 34, 640, 6);
  for (const px of [bx + 190, bx + 450]) {
    ctx.fillRect(px - 5, baseY - 150, 10, 150);
    ctx.strokeStyle = SIL;
    ctx.lineWidth = 1.2;
    for (let k = 1; k <= 9; k++) {
      ctx.beginPath();
      ctx.moveTo(px, baseY - 150 + k * 6);
      ctx.lineTo(px - k * 18, baseY - 32);
      ctx.moveTo(px, baseY - 150 + k * 6);
      ctx.lineTo(px + k * 18, baseY - 32);
      ctx.stroke();
    }
  }
}

function tower(ctx: CanvasRenderingContext2D, rng: Rng, x: number, baseY: number, w: number, h: number): void {
  wrapX(x, w + 4, (ox) => {
    ctx.fillStyle = SIL;
    ctx.fillRect(x + ox, baseY - h, w, h);
    if (rChance(rng, 0.5)) ctx.fillRect(x + ox + w * 0.2, baseY - h - 10, w * 0.6, 10);
    if (rChance(rng, 0.4)) ctx.fillRect(x + ox + w * 0.5, baseY - h - 24, 1.5, 14);
    windows(ctx, rng, x + ox, baseY - h, w, baseY, 0.4);
  });
}

function crane(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number): void {
  wrapX(x - 60, 160, (ox) => {
    const cx = x + ox;
    ctx.strokeStyle = SIL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(cx, baseY - h);
    ctx.moveTo(cx - 40, baseY - h + 8);
    ctx.lineTo(cx + 110, baseY - h + 8);
    ctx.moveTo(cx, baseY - h - 12);
    ctx.lineTo(cx - 40, baseY - h + 8);
    ctx.moveTo(cx, baseY - h - 12);
    ctx.lineTo(cx + 110, baseY - h + 8);
    ctx.moveTo(cx + 90, baseY - h + 8);
    ctx.lineTo(cx + 90, baseY - h + 50);
    ctx.stroke();
  });
}
