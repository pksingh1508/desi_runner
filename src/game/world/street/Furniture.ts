import type * as THREE from "three";
import { GeometryBuilder, STEADY_ALPHA, catenary, resample, polylineLength, type UvRect, type Vec3 } from "../gfx/GeometryBuilder";
import { createRng, rChance, rInt, rPick, rRange, type Rng } from "../gfx/random";
import type { FacadeAtlas } from "../textures/FacadeAtlas";
import type { FurnitureStyle } from "@/game/config/buildings";
import { STREET } from "@/game/config/street";
import { WORLD } from "@/game/config/gameplay";

/**
 * Street furniture + overhead life for one 48 m segment: electric poles
 * with crossarms, transformers and street lamps, tangled wires (along and
 * across the street), service drops, bunting, marigold garlands, festive
 * bulb strings with lanterns, painted-trunk trees, milestones, kerb diyas.
 *
 * Poles/trees use fixed slots (z = -6/-30 left, -18/-42 right) in every
 * variant, so wires always meet the neighbouring segment's poles. Anything
 * spanning the lanes stays above STREET.overheadMinY.
 */

const L = WORLD.segmentLength;
const LEFT_POLES = [-6, -30];
const LEFT_TREES = [-18, -42];
const ARM_Y = 9.05;
/** Crossarm anchor offsets (x) shared by every variant. */
const ANCHORS = [-0.58, -0.22, 0.22, 0.58];

interface Uvs {
  white: UvRect;
  concrete: UvRect;
  metal: UvRect;
  wood: UvRect;
  lamp: UvRect;
  transformer: UvRect;
  danger: UvRect;
  leaves: UvRect;
  brick: UvRect;
  garland: UvRect;
  bulbs: UvRect;
  bulbsWarm: UvRect;
  lanterns: UvRect[];
  diya: UvRect;
  milestone: UvRect;
  posters: UvRect[];
}

interface Ctx {
  b: GeometryBuilder;
  rng: Rng;
  style: FurnitureStyle;
  festive: boolean;
  uv: Uvs;
}

export function buildFurnitureGeometry(
  atlas: FacadeAtlas,
  style: FurnitureStyle,
  biomeIndex: number,
  festive: boolean,
  seed: number
): THREE.BufferGeometry {
  const uv: Uvs = {
    white: atlas.uv("white"),
    concrete: atlas.uv("concrete"),
    metal: atlas.uv("metal"),
    wood: atlas.uv("wood"),
    lamp: atlas.uv("lamp"),
    transformer: atlas.uv("transformer"),
    danger: atlas.uv("danger"),
    leaves: atlas.uv("leaves"),
    brick: atlas.uv("brick"),
    garland: atlas.uv("garland"),
    bulbs: atlas.uv("bulbs"),
    bulbsWarm: atlas.uv("bulbsWarm"),
    lanterns: [atlas.uv("lantern0"), atlas.uv("lantern1")],
    diya: atlas.uv("diya"),
    milestone: atlas.uv(`milestone${Math.min(3, Math.max(0, biomeIndex))}`),
    posters: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => atlas.uv(`poster${i}`)),
  };
  const ctx: Ctx = { b: new GeometryBuilder(), rng: createRng(seed), style, festive, uv };
  const { b } = ctx;

  // Left side, then the same recipe rotated 180° about the segment center
  // becomes the right side (poles land on -18/-42, text stays readable).
  streetSide(ctx);
  b.push().translate(0, 0, -L / 2).rotateY(Math.PI).translate(0, 0, L / 2);
  streetSide(ctx);
  b.pop();

  crossStreet(ctx);
  return b.toGeometry();
}

// ------------------------------------------------------------------- side

function streetSide(ctx: Ctx): void {
  const { b, rng, style, uv } = ctx;
  const px = -STREET.poleX;
  for (const z of LEFT_POLES) pole(ctx, px, z);

  // Wires along the street: pole → next pole (the second span reaches the
  // next segment's first pole at z = -54).
  for (const [z0, z1] of [
    [LEFT_POLES[0], LEFT_POLES[1]],
    [LEFT_POLES[1], LEFT_POLES[0] - L],
  ]) {
    const count = rInt(rng, style.wiresPerSpan[0], style.wiresPerSpan[1]);
    b.color = 0x151515;
    for (let k = 0; k < count; k++) {
      const ax = px + ANCHORS[k % ANCHORS.length];
      const sag = rRange(rng, 0.35, 1.2);
      b.tube(catenary([ax, ARM_Y + 0.08, z0], [ax, ARM_Y + 0.08, z1], sag, 12), 0.018, uv.white);
    }
  }
  // Service drops to the facades on this side (outside the lanes).
  for (const z of LEFT_POLES) {
    const drops = rInt(rng, style.serviceDrops[0], style.serviceDrops[1]);
    b.color = 0x181818;
    for (let k = 0; k < drops; k++) {
      const end: Vec3 = [-STREET.facadeX + 0.05, rRange(rng, 5.6, 7.8), z + rRange(rng, -7, 7)];
      b.tube(catenary([px + rRange(rng, -0.4, 0.4), ARM_Y, z], end, rRange(rng, 0.15, 0.55), 8), 0.013, uv.white);
    }
    // A cable coil hanging on the pole (iconic tangle).
    if (rChance(rng, 0.55)) {
      const cy = rRange(rng, 6.8, 8.2);
      const pts: Vec3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        pts.push([px + Math.cos(a) * 0.32, cy + Math.sin(a) * 0.32, z + 0.18]);
      }
      b.tube(pts, 0.016, uv.white);
    }
  }

  // Trees (painted trunks, brick guards) on the free slots.
  for (const z of LEFT_TREES) {
    if (rChance(rng, style.treeChance)) tree(ctx, -STREET.treeX, z + rRange(rng, -0.6, 0.6));
  }

  // Milestone at the kerb.
  if (rChance(rng, style.milestoneChance)) {
    const z = rPick(rng, [-12, -24, -36]) + rRange(rng, -1.5, 1.5);
    const x0 = -6.62;
    b.color = 0xf4f1ea;
    b.box(x0, STREET.kerbHeight, z - 0.2, x0 + 0.22, STREET.kerbHeight + 0.6, z + 0.2, { all: uv.white, px: uv.milestone });
    b.color = 0xf2b21b;
    b.sphere(x0 + 0.11, STREET.kerbHeight + 0.6, z, 0.11, 0.12, 0.2, 8, 3, uv.white, Math.PI / 2);
  }

  if (ctx.festive && style.kerbDiyas) {
    // Just behind the kerb on the footpath (outside the |x| < 6.2 zone).
    const x = -6.3;
    for (let z = -0.6; z > -L; z -= 1.15) {
      b.color = 0xffffff;
      b.alpha = Math.floor(rng() * 245);
      b.quad2([x, STREET.kerbHeight, z + 0.1], [x, STREET.kerbHeight, z - 0.1], [x, STREET.kerbHeight + 0.2, z - 0.1], [x, STREET.kerbHeight + 0.2, z + 0.1], uv.diya);
    }
    b.alpha = STEADY_ALPHA;
  }
}

function pole(ctx: Ctx, x: number, z: number): void {
  const { b, rng, style, uv } = ctx;
  const H = STREET.poleHeight;
  // Tapered concrete pole.
  b.color = rPick(rng, [0x9c988e, 0x8f8b82, 0xa7a297]);
  b.cylinder(x, 0, z, 0.17, 0.1, H, 8, uv.concrete, true);
  // Crossarm (across the street) with insulators.
  b.color = 0x4a4a48;
  b.box(x - 0.72, ARM_Y - 0.06, z - 0.05, x + 0.72, ARM_Y + 0.02, z + 0.05, uv.metal);
  b.color = 0xe8e4dc;
  for (const a of ANCHORS) b.cylinder(x + a, ARM_Y + 0.02, z, 0.035, 0.03, 0.1, 6, uv.white, true);
  // Street lamp arm reaching over the road edge.
  const lampX = x + 1.3;
  b.color = 0x5a5a58;
  b.tube([[x + 0.05, 8.2, z], [x + 0.7, 8.62, z], [lampX, 8.72, z]], 0.035, uv.white);
  b.color = 0x3a3a3a;
  b.box(lampX - 0.3, 8.6, z - 0.13, lampX + 0.3, 8.74, z + 0.13, { all: uv.metal, ny: uv.lamp });
  // Transformer + danger plate.
  if (rChance(rng, style.transformerChance)) {
    const tx = x - 0.5;
    b.color = 0x8f9c95;
    b.box(tx - 0.35, 3.2, z - 0.4, tx + 0.25, 4.35, z + 0.4, { all: uv.transformer, py: uv.metal });
    b.color = 0x6a6a68;
    b.box(tx - 0.05, 3.0, z - 0.45, x - 0.1, 3.2, z + 0.45, uv.metal);
    b.color = 0xd8d4c8;
    for (const dz of [-0.22, 0, 0.22]) b.cylinder(tx - 0.05, 4.35, z + dz, 0.05, 0.04, 0.24, 6, uv.white, true);
    b.color = 0x151515;
    for (const dz of [-0.22, 0, 0.22]) b.tube(catenary([tx - 0.05, 4.59, z + dz], [x + ANCHORS[1], ARM_Y, z], -0.3, 6), 0.012, uv.white);
  }
  b.color = 0xffffff;
  const plateX = x + 0.18;
  b.quad([plateX, 2.2, z + 0.16], [plateX, 2.2, z - 0.16], [plateX, 2.52, z - 0.16], [plateX, 2.52, z + 0.16], uv.danger);
  if (rChance(rng, 0.4)) {
    b.quad([plateX, 1.3, z + 0.14], [plateX, 1.3, z - 0.14], [plateX, 1.72, z - 0.14], [plateX, 1.72, z + 0.14], rPick(rng, uv.posters));
  }
}

function tree(ctx: Ctx, x: number, z: number): void {
  const { b, rng, style, uv } = ctx;
  const y0 = STREET.kerbHeight;
  // Brick tree guard.
  b.color = 0xffffff;
  b.cylinder(x, y0, z, 0.52, 0.52, 0.5, 10, uv.brick, true);
  // Trunk with the white + red painted bands every Indian street tree wears.
  const trunkH = rRange(rng, 3.6, 4.4);
  b.color = 0x6e5b49;
  b.cylinder(x, y0, z, 0.2, 0.15, trunkH, 7, uv.wood, false);
  b.color = 0xf2efe8;
  b.cylinder(x, y0 + 0.5, z, 0.212, 0.206, 0.62, 7, uv.white, false);
  b.color = 0xc0301e;
  b.cylinder(x, y0 + 1.12, z, 0.206, 0.204, 0.22, 7, uv.white, false);
  // Leafy canopy (kept at |x| ≥ 5.4 so it never hangs over the lanes).
  const blobs = rInt(rng, 4, 6);
  const side = Math.sign(x);
  for (let i = 0; i < blobs; i++) {
    const r = rRange(rng, 0.85, 1.3);
    const cx = side * Math.max(5.45 + r, Math.abs(x) + rRange(rng, -0.2, 0.7));
    const cy = y0 + trunkH + rRange(rng, -0.4, 1.8);
    const cz = z + rRange(rng, -1.5, 1.5);
    b.color = rPick(rng, style.leafColors);
    b.sphere(cx, cy, cz, r, r * 0.85, r, 8, 6, uv.leaves);
  }
}

// ----------------------------------------------------------------- across

function crossStreet(ctx: Ctx): void {
  const { b, rng, style, uv } = ctx;
  const minY = STREET.overheadMinY;
  const fx = STREET.facadeX - 0.05;

  // Power lines crossing between opposite poles.
  const crosses = rInt(rng, style.crossWires[0], style.crossWires[1]);
  b.color = 0x141414;
  const pairs: [number, number][] = [
    [-6, -18],
    [-30, -18],
    [-30, -42],
    [-6 - L, -18],
  ];
  for (let i = 0; i < crosses; i++) {
    const [zl, zr] = pairs[i % pairs.length];
    const a0: Vec3 = [-STREET.poleX + rPick(rng, ANCHORS), ARM_Y + 0.08, zl];
    const a1: Vec3 = [STREET.poleX + rPick(rng, ANCHORS), ARM_Y + 0.08, zr];
    const sag = Math.min(rRange(rng, 0.3, 0.7), ARM_Y + 0.08 - minY - 0.05);
    b.tube(catenary(a0, a1, sag, 14), 0.017, uv.white);
  }

  // Bunting.
  const buntings = rInt(rng, style.buntingStrings[0], style.buntingStrings[1]);
  for (let i = 0; i < buntings; i++) bunting(ctx, fx, rRange(rng, 4, L - 4), minY);

  // Marigold garlands.
  const garlands = rInt(rng, style.garlands[0], style.garlands[1]);
  for (let i = 0; i < garlands; i++) {
    const z0 = -rRange(rng, 3, L - 3);
    const z1 = z0 + rRange(rng, -3, 3);
    const y0 = rRange(rng, 9.6, 10.2);
    const pts = catenary([-fx, y0, z0], [fx, y0 + rRange(rng, -0.2, 0.2), z1], Math.min(0.9, y0 - minY - 0.3), 18);
    stripAlong(ctx, pts, 0.22, uv.garland, 1.7, false);
    b.color = 0x3a3a3a;
    b.tube(pts, 0.01, uv.white);
  }

  // Festive bulb strings + lanterns.
  const strings = rInt(rng, style.stringLights[0], style.stringLights[1]);
  for (let i = 0; i < strings; i++) {
    const z0 = -((i + 0.5) * (L / Math.max(1, strings))) + rRange(rng, -3, 3);
    const z1 = z0 + rRange(rng, -4, 4);
    const y0 = rRange(rng, 9.8, 10.4);
    const carriesLantern = i < style.lanterns;
    // Lantern strings sag less so the paper lantern stays above minY.
    const sag = Math.min(rRange(rng, 0.5, 0.9), y0 - minY - (carriesLantern ? 0.95 : 0.25));
    const pts = catenary([-fx, y0, z0], [fx, y0, z1], sag, 18);
    stripAlong(ctx, pts, 0.16, rChance(rng, 0.5) ? uv.bulbs : uv.bulbsWarm, 2.2, true);
    b.color = 0x1a1a1a;
    b.tube(pts, 0.009, uv.white);
    if (carriesLantern) {
      const mid = pts[Math.floor(pts.length / 2)];
      const size = 0.8;
      const cell = rPick(rng, uv.lanterns);
      b.color = 0xffffff;
      b.alpha = Math.floor(rng() * 245);
      const top = mid[1] - 0.05;
      const w = size * 0.66;
      b.quad2([mid[0], top - size, mid[2] + w / 2], [mid[0], top - size, mid[2] - w / 2], [mid[0], top, mid[2] - w / 2], [mid[0], top, mid[2] + w / 2], cell);
      b.quad2([mid[0] - w / 2, top - size, mid[2]], [mid[0] + w / 2, top - size, mid[2]], [mid[0] + w / 2, top, mid[2]], [mid[0] - w / 2, top, mid[2]], cell);
      b.alpha = STEADY_ALPHA;
    }
  }
}

/** Triangle-flag bunting between the two facades. */
function bunting(ctx: Ctx, fx: number, zDist: number, minY: number): void {
  const { b, rng, style, uv } = ctx;
  const z0 = -zDist;
  const z1 = z0 + rRange(rng, -5, 5);
  const y0 = rRange(rng, 9.7, 10.5);
  const y1 = rRange(rng, 9.7, 10.5);
  const flagH = 0.34;
  const sag = Math.min(rRange(rng, 0.6, 1.1), Math.min(y0, y1) - minY - flagH - 0.1);
  const rope = catenary([-fx, y0, z0], [fx, y1, z1], sag, 24);
  b.color = 0xe8e0d0;
  b.tube(rope, 0.01, uv.white);
  const length = polylineLength(rope);
  const count = Math.floor(length / 0.42);
  const pts = resample(rope, count);
  const cu = (uv.white.u0 + uv.white.u1) / 2;
  const cv = (uv.white.v0 + uv.white.v1) / 2;
  const c: [number, number] = [cu, cv];
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const n = pts[i + 1];
    const tip: Vec3 = [a[0] + (n[0] - a[0]) * 0.45, (a[1] + n[1]) / 2 - flagH, a[2] + (n[2] - a[2]) * 0.45];
    const end: Vec3 = [a[0] + (n[0] - a[0]) * 0.85, a[1] + (n[1] - a[1]) * 0.85, a[2] + (n[2] - a[2]) * 0.85];
    b.color = style.buntingColors[i % style.buntingColors.length];
    b.tri(a, end, tip, c, c, c, true);
  }
}

/** Double-sided strip hanging under a polyline, one atlas cell per piece. */
function stripAlong(ctx: Ctx, pts: readonly Vec3[], height: number, cell: UvRect, cellLength: number, twinkle: boolean): void {
  const { b, rng } = ctx;
  const pieces = Math.max(1, Math.round(polylineLength(pts) / cellLength));
  const even = resample(pts, pieces);
  b.color = 0xffffff;
  for (let i = 0; i < pieces; i++) {
    if (twinkle) b.alpha = Math.floor(rng() * 245);
    b.hangingStrip([even[i], even[i + 1]], height, cell);
  }
  b.alpha = STEADY_ALPHA;
}
