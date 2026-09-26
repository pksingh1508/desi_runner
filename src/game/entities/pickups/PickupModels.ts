import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { PowerUpType } from "@/types/game";
import {
  ModelBuilder,
  instantiateModel,
  withVertexColorEmissive,
  type BuiltModel,
  type MaterialLayer,
  type Vec3,
} from "@/game/entities/obstacles/ModelBuilder";

/**
 * Desi power-up models, built once per Game and shared by every pooled
 * pickup: CHUMBAK horseshoe magnet, NIMBU-MIRCHI charm, DOUBLE DHAMAKA
 * "anar" firework and a CHAI BOOST cutting-chai glass. All art is procedural.
 *
 * ModelBuilder layers are re-used with pickup meanings:
 *   paint → glossy self-lit body   metal → chrome   glow → unlit accents
 *   glass → fluted glass           art → anar paper wrap
 *   cloth → soft additive (steam)  clothArt → additive shield bubble
 */

export interface PickupVisual {
  readonly type: PowerUpType;
  readonly root: THREE.Group;
  /** Randomize phases for a fresh placement. */
  reset(): void;
  /** Per-frame animation (allocation-free). */
  update(time: number, delta: number): void;
}

/** Halo tint per power-up (matches the HUD chip colors). */
const HALO: Record<PowerUpType, number> = {
  magnet: 0x2e9bff,
  shield: 0xb5e61d,
  scoreMultiplier: 0xffb300,
  turbo: 0xff6b35,
};

const BODY_EMISSIVE = 0.42;
const SPARK_COUNT = 26;

// --------------------------------------------------------------- textures

function canvasTexture(bag: ResourceBag, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx);
  const texture = bag.tex(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(bag: ResourceBag): THREE.CanvasTexture {
  return canvasTexture(bag, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function sparkTexture(bag: ResourceBag): THREE.CanvasTexture {
  return canvasTexture(bag, 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(15, 1, 2, 30);
    ctx.fillRect(1, 15, 30, 2);
  });
}

function badgeTexture(bag: ResourceBag): THREE.CanvasTexture {
  return canvasTexture(bag, 128, 96, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 72px 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
    ctx.shadowColor = "rgba(255, 190, 40, 0.95)";
    ctx.shadowBlur = 14;
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#8e0000";
    ctx.strokeText("×2", 64, 50);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, 18, 0, 82);
    g.addColorStop(0, "#fff59d");
    g.addColorStop(0.5, "#ffca28");
    g.addColorStop(1, "#ff8f00");
    ctx.fillStyle = g;
    ctx.fillText("×2", 64, 50);
  });
}

/** Festive firecracker paper: gold-starred red body with green/yellow bands. */
function anarWrapTexture(bag: ResourceBag): THREE.CanvasTexture {
  return canvasTexture(bag, 128, 128, (ctx) => {
    // v runs bottom (canvas bottom) → top along the lathe profile.
    ctx.fillStyle = "#d81b60";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#ffc400";
    ctx.fillRect(0, 104, 128, 24);
    ctx.fillStyle = "#1b9e4b";
    ctx.fillRect(0, 92, 128, 10);
    ctx.fillRect(0, 30, 128, 8);
    ctx.fillStyle = "#ffeb3b";
    ctx.fillRect(0, 0, 128, 28);
    ctx.fillStyle = "#fff176";
    for (let i = 0; i < 8; i++) {
      const cx = 8 + i * 16;
      const cy = i % 2 === 0 ? 56 : 74;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const r = k % 2 === 0 ? 7 : 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#b71c1c";
    for (let x = 0; x < 128; x += 8) ctx.fillRect(x, 112, 4, 8);
  });
}

// --------------------------------------------------------------- geometry

/** Curved, tapered green chilli (thick stem end at local +y, tip curling at -y). */
function chilliGeometry(length: number, radius: number, curl: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius * 0.15, length, 8, 8);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const u = 0.5 - y / length; // 0 at the stem, 1 at the tip
    pos.setX(i, pos.getX(i) + curl * u * u);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- factory

interface SharedPickupAssets {
  materials: Record<MaterialLayer, THREE.Material>;
  halo: Record<PowerUpType, THREE.SpriteMaterial>;
  badge: THREE.SpriteMaterial;
  sparks: THREE.PointsMaterial;
  models: Record<PowerUpType, BuiltModel>;
}

const _e = new THREE.Euler();
const _v = new THREE.Vector3();

function buildMagnet(): BuiltModel {
  const b = new ModelBuilder(null);
  const red = 0xe0231c;
  const silver = 0xe9eef3;
  b.add("paint", new THREE.TorusGeometry(0.24, 0.095, 12, 22, Math.PI), red, { p: [0, 0.05, 0] });
  for (const s of [-1, 1]) {
    b.cyl("paint", red, 0.095, 0.095, 0.22, { p: [s * 0.24, -0.06, 0] }, 16);
    b.cyl("paint", 0x8c0f0b, 0.1, 0.1, 0.018, { p: [s * 0.24, -0.17, 0] }, 16);
    b.cyl("metal", silver, 0.097, 0.097, 0.15, { p: [s * 0.24, -0.255, 0] }, 16);
  }
  // Glossy highlight streak on the bend.
  b.torus("glow", 0xffd2cc, 0.24, 0.017, { p: [0, 0.05, 0.085], r: [0, 0, 0.35] }, 4, 14, Math.PI * 0.42);
  // Sparkle ring (rotates as one part).
  b.part("sparkles");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p: Vec3 = [Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.05, 0.02];
    const size = i % 2 === 0 ? 0.075 : 0.05;
    b.add("glow", new THREE.OctahedronGeometry(size), 0xd8f1ff, { p, s: [0.35, 1, 0.35] });
    b.add("glow", new THREE.OctahedronGeometry(size), 0xd8f1ff, { p, s: [1, 0.35, 0.35] });
  }
  // Cartoon field "zaps" under the pole tips.
  b.part("zaps", 0, -0.42, 0);
  for (const s of [-1, 1]) {
    b.torus("glow", 0x7fd4ff, 0.09, 0.013, { p: [s * 0.24, -0.4, 0], r: [0, 0, Math.PI * 1.05] }, 4, 12, Math.PI * 0.9);
  }
  b.base();
  return b.build();
}

function buildCharm(): BuiltModel {
  const b = new ModelBuilder(null);
  b.part("charm", 0, 0.47, 0);
  const thread = 0x151515;
  b.rod("paint", thread, [0, 0.47, 0], [0, -0.4, 0], 0.009, 4);
  b.torus("paint", thread, 0.04, 0.009, { p: [0, 0.51, 0] }, 4, 12);
  // Lemon with its pointed nubs.
  const lemon = 0xf5e01e;
  b.sphere("paint", lemon, 1, { p: [0, 0.3, 0], s: [0.155, 0.125, 0.125] }, 16, 12);
  for (const s of [-1, 1]) b.cone("paint", lemon, 0.035, 0.07, { p: [s * 0.175, 0.3, 0], r: [0, 0, -s * Math.PI / 2] }, 8);
  // Five green chillies strung in a zig-zag column below.
  const green = 0x1f9e34;
  for (let i = 0; i < 5; i++) {
    const y = 0.09 - i * 0.1;
    const tilt = (i % 2 === 0 ? 1 : -1) * 0.5;
    const yaw = i * 1.1;
    b.add("paint", chilliGeometry(0.25, 0.05, 0.06 * (i % 2 === 0 ? 1 : -1)), green, { p: [0, y, 0], r: [0, yaw, tilt] });
    // Calyx cap at the stem end (same transform, offset along local +y).
    _e.set(0, yaw, tilt, "XYZ");
    _v.set(0, 0.13, 0).applyEuler(_e);
    b.sphere("paint", 0x2f5e1a, 0.036, { p: [_v.x, y + _v.y, _v.z], s: [1, 0.65, 1] }, 7, 5);
  }
  b.ico("paint", 0x2b2b2b, 0.045, { p: [0, -0.43, 0] }, 0);
  b.base();
  // Protective bubble (static, pulses via scale).
  b.part("bubble");
  b.sphere("clothArt", 0xc6ff4d, 0.56, undefined, 22, 14);
  b.base();
  return b.build();
}

function buildAnar(): BuiltModel {
  const b = new ModelBuilder(null);
  b.lathe("art", 0xffffff, [
    [0.001, -0.3],
    [0.19, -0.3],
    [0.205, -0.27],
    [0.2, -0.2],
    [0.155, 0.06],
    [0.1, 0.16],
    [0.055, 0.2],
    [0.001, 0.21],
  ], undefined, 18);
  b.torus("metal", 0xffc400, 0.198, 0.016, { p: [0, -0.285, 0], r: [Math.PI / 2, 0, 0] }, 4, 20);
  b.rod("paint", 0x3e2723, [0, 0.2, 0], [0.03, 0.3, 0], 0.012, 5);
  b.sphere("glow", 0xffb74d, 0.028, { p: [0.032, 0.31, 0] }, 6, 4);
  return b.build();
}

function buildChai(): BuiltModel {
  const b = new ModelBuilder(null);
  // Fluted cutting-chai glass (flat-shaded lathe = facets).
  b.lathe("glass", 0xe6f7ff, [
    [0.001, -0.2],
    [0.118, -0.2],
    [0.126, -0.19],
    [0.162, 0.19],
    [0.168, 0.21],
  ], undefined, 12);
  b.torus("glow", 0xffffff, 0.166, 0.006, { p: [0, 0.21, 0], r: [Math.PI / 2, 0, 0] }, 3, 24);
  // Milky tea, three-quarters full, with a foamy top.
  b.lathe("paint", 0xc27a34, [
    [0.001, -0.188],
    [0.116, -0.188],
    [0.148, 0.1],
    [0.001, 0.1],
  ], undefined, 16);
  b.add("paint", new THREE.CircleGeometry(0.147, 20), 0xe3ad72, { p: [0, 0.101, 0], r: [-Math.PI / 2, 0, 0] });
  // Steam wisps (one animated part).
  b.part("steam", 0, 0.12, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x0 = Math.cos(a) * 0.06;
    const z0 = Math.sin(a) * 0.06;
    b.tube("cloth", 0xffffff, [
      [x0, 0.13, z0],
      [x0 + 0.05, 0.24, z0 + 0.02],
      [x0 - 0.04, 0.36, z0 - 0.02],
      [x0 + 0.03, 0.48, z0],
      [x0 - 0.01, 0.58, z0],
    ], 0.016, 14, 5);
  }
  b.base();
  return b.build();
}

/** Builds and caches every shared pickup resource for one Game session. */
export function createPickupAssets(bag: ResourceBag): SharedPickupAssets {
  const glowTex = glowTexture(bag);
  const sparkTex = sparkTexture(bag);
  const badgeTex = badgeTexture(bag);
  const wrapTex = anarWrapTexture(bag);

  const body = withVertexColorEmissive(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12, emissive: 0xffffff, emissiveIntensity: BODY_EMISSIVE })
  );
  const chrome = withVertexColorEmissive(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.75, emissive: 0xffffff, emissiveIntensity: 0.32 })
  );
  const glass = withVertexColorEmissive(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.36,
      roughness: 0.05,
      metalness: 0.05,
      flatShading: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
    })
  );
  const wrap = withVertexColorEmissive(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: wrapTex,
      emissiveMap: wrapTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.45,
    })
  );
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const soft = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bubble = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const materials: Record<MaterialLayer, THREE.Material> = {
    paint: bag.mat(body),
    metal: bag.mat(chrome),
    glass: bag.mat(glass),
    art: bag.mat(wrap),
    glow: bag.mat(glow),
    cloth: bag.mat(soft),
    clothArt: bag.mat(bubble),
  };

  const halo = {} as Record<PowerUpType, THREE.SpriteMaterial>;
  for (const type of Object.keys(HALO) as PowerUpType[]) {
    halo[type] = bag.mat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: HALO[type],
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
  }
  const badge = bag.mat(new THREE.SpriteMaterial({ map: badgeTex, transparent: true, depthWrite: false }));
  const sparks = bag.mat(
    new THREE.PointsMaterial({
      map: sparkTex,
      size: 0.13,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );

  const models: Record<PowerUpType, BuiltModel> = {
    magnet: buildMagnet(),
    shield: buildCharm(),
    scoreMultiplier: buildAnar(),
    turbo: buildChai(),
  };
  for (const model of Object.values(models)) {
    for (const part of model.parts) for (const mesh of part.meshes) bag.geo(mesh.geometry);
  }
  return { materials, halo, badge, sparks, models };
}

// ---------------------------------------------------------------- visuals

function haloSprite(assets: SharedPickupAssets, type: PowerUpType, scale: number): THREE.Sprite {
  const sprite = new THREE.Sprite(assets.halo[type]);
  sprite.scale.setScalar(scale);
  sprite.renderOrder = -1;
  return sprite;
}

function instantiate(assets: SharedPickupAssets, type: PowerUpType): { root: THREE.Group; parts: Map<string, THREE.Object3D> } {
  return instantiateModel(
    assets.models[type],
    (layer) => assets.materials[layer],
    (mesh, layer) => {
      mesh.castShadow = layer === "paint" || layer === "metal" || layer === "art";
    }
  );
}

function part(parts: Map<string, THREE.Object3D>, name: string, fallback: THREE.Object3D): THREE.Object3D {
  return parts.get(name) ?? fallback;
}

class MagnetVisual implements PickupVisual {
  readonly type = "magnet" as const;
  readonly root = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly sparkles: THREE.Object3D;
  private readonly zaps: THREE.Object3D;
  private phase = 0;

  constructor(assets: SharedPickupAssets) {
    const { root, parts } = instantiate(assets, "magnet");
    this.body = root;
    this.sparkles = part(parts, "sparkles", root);
    this.zaps = part(parts, "zaps", root);
    this.root.add(haloSprite(assets, "magnet", 1.55), this.body);
  }

  reset(): void {
    this.phase = Math.random() * Math.PI * 2;
  }

  update(t: number, delta: number): void {
    // Sways around facing the runner so the horseshoe always reads.
    this.body.rotation.y = Math.sin(t * 1.6 + this.phase) * 0.55;
    this.body.rotation.z = 0.28 + Math.sin(t * 1.1 + this.phase) * 0.08;
    this.sparkles.rotation.z += delta * 1.7;
    const zap = 0.75 + Math.abs(Math.sin(t * 7 + this.phase)) * 0.4;
    this.zaps.scale.set(zap, zap, zap);
  }
}

class CharmVisual implements PickupVisual {
  readonly type = "shield" as const;
  readonly root = new THREE.Group();
  private readonly charm: THREE.Object3D;
  private readonly bubble: THREE.Object3D;
  private phase = 0;

  constructor(assets: SharedPickupAssets) {
    const { root, parts } = instantiate(assets, "shield");
    this.charm = part(parts, "charm", root);
    this.bubble = part(parts, "bubble", root);
    this.root.add(haloSprite(assets, "shield", 1.3), root);
  }

  reset(): void {
    this.phase = Math.random() * Math.PI * 2;
    this.charm.rotation.set(0, this.phase, 0);
  }

  update(t: number, delta: number): void {
    // Hanging charm swings like it's tied to a shop door.
    this.charm.rotation.z = Math.sin(t * 2.2 + this.phase) * 0.17;
    this.charm.rotation.y += delta * 0.9;
    const pulse = 1 + Math.sin(t * 3 + this.phase) * 0.045;
    this.bubble.scale.set(pulse, pulse, pulse);
  }
}

class AnarVisual implements PickupVisual {
  readonly type = "scoreMultiplier" as const;
  readonly root = new THREE.Group();
  private readonly pot: THREE.Group;
  private readonly badge: THREE.Sprite;
  private readonly positions: Float32Array;
  private readonly sparkAttr: THREE.BufferAttribute;
  private readonly seeds: Float32Array;
  private phase = 0;

  constructor(assets: SharedPickupAssets, bag: ResourceBag) {
    const { root } = instantiate(assets, "scoreMultiplier");
    this.pot = root;
    this.badge = new THREE.Sprite(assets.badge);
    this.badge.scale.set(0.62, 0.465, 1);
    this.badge.position.y = 0.72;

    // Per-instance fountain of sparks (pooled with the pickup).
    this.positions = new Float32Array(SPARK_COUNT * 3);
    this.seeds = new Float32Array(SPARK_COUNT * 3);
    const colors = new Float32Array(SPARK_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.seeds[i * 3] = Math.random();
      this.seeds[i * 3 + 1] = Math.random() * Math.PI * 2;
      this.seeds[i * 3 + 2] = 0.7 + Math.random() * 0.6;
      c.setHex(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd54f : 0xff8f00);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = bag.geo(new THREE.BufferGeometry());
    this.sparkAttr = new THREE.BufferAttribute(this.positions, 3);
    this.sparkAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.sparkAttr);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.45, 0), 0.9);
    const sparks = new THREE.Points(geo, assets.sparks);

    this.root.add(haloSprite(assets, "scoreMultiplier", 1.6), this.pot, sparks, this.badge);
  }

  reset(): void {
    this.phase = Math.random() * Math.PI * 2;
  }

  update(t: number, delta: number): void {
    this.pot.rotation.y += delta * 1.1;
    const pulse = 1 + Math.sin(t * 4.2 + this.phase) * 0.08;
    this.badge.scale.set(0.62 * pulse, 0.465 * pulse, 1);
    this.badge.position.y = 0.72 + Math.sin(t * 2.1 + this.phase) * 0.04;
    // Anar fountain: each spark flies a short parabola from the nozzle.
    const pos = this.positions;
    const seeds = this.seeds;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const life = (t * 1.25 * seeds[i * 3 + 2] + seeds[i * 3]) % 1;
      const a = seeds[i * 3 + 1] + t * 0.6;
      const spread = 0.34 * life * seeds[i * 3 + 2];
      pos[i * 3] = Math.cos(a) * spread;
      pos[i * 3 + 1] = 0.24 + life * 1.05 - life * life * 0.95;
      pos[i * 3 + 2] = Math.sin(a) * spread;
    }
    this.sparkAttr.needsUpdate = true;
  }
}

class ChaiVisual implements PickupVisual {
  readonly type = "turbo" as const;
  readonly root = new THREE.Group();
  private readonly glass: THREE.Group;
  private readonly steam: THREE.Object3D;
  private phase = 0;

  constructor(assets: SharedPickupAssets) {
    const { root, parts } = instantiate(assets, "turbo");
    this.glass = root;
    this.steam = part(parts, "steam", root);
    this.root.add(haloSprite(assets, "turbo", 1.55), this.glass);
  }

  reset(): void {
    this.phase = Math.random() * Math.PI * 2;
  }

  update(t: number, delta: number): void {
    this.glass.rotation.y += delta * 0.8;
    this.glass.rotation.z = Math.sin(t * 1.8 + this.phase) * 0.08;
    this.steam.rotation.y += delta * 1.4;
    const rise = 0.9 + Math.sin(t * 2.4 + this.phase) * 0.14;
    this.steam.scale.set(1, rise, 1);
    this.steam.position.y = 0.12 + Math.sin(t * 3.1 + this.phase) * 0.015;
  }
}

/** All four desi visuals for one pooled pickup (only one visible at a time). */
export function createPickupVisuals(assets: SharedPickupAssets, bag: ResourceBag): Record<PowerUpType, PickupVisual> {
  return {
    magnet: new MagnetVisual(assets),
    shield: new CharmVisual(assets),
    scoreMultiplier: new AnarVisual(assets, bag),
    turbo: new ChaiVisual(assets),
  };
}

export type { SharedPickupAssets };
