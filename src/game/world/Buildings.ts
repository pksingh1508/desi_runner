import type * as THREE from "three";
import {
  FACE_NY,
  FACE_NZ,
  FACE_PX,
  FACE_PY,
  FACE_PZ,
  GeometryBuilder,
  STEADY_ALPHA,
  catenary,
  type UvRect,
  type Vec3,
} from "./gfx/GeometryBuilder";
import { createRng, rChance, rInt, rPick, rRange, rWeighted, type Rng } from "./gfx/random";
import { bayKey, LIT_BAYS, type FacadeAtlas, type PlasterFamily } from "./textures/FacadeAtlas";
import { buildProp, PROP_RADIUS } from "./street/Props";
import { MASSING, STREET } from "@/game/config/street";
import {
  POSTERS,
  WALL_ADS,
  type BayKind,
  type PropKind,
  type StreetStyle,
} from "@/game/config/buildings";

/**
 * Bakes one 24 m row of Indian shophouses (one street side, half a
 * segment) into a single geometry: plastered facades with windows,
 * chajjas, balconies, jharokhas, grills, AC units, rolling-shutter shops
 * with painted signboards and awnings, parapets with black water tanks and
 * dish antennas, festive lights, galis and footpath props.
 *
 * Local frame: facade plane x = 0 facing +X (the road), footpath props at
 * 0 < x < 2.6, row spans z ∈ [-24, 0]. TrackSegment places/rotates rows so
 * the same geometry serves both street sides.
 */

const TILE_W = MASSING.bayWidth;
const TILE_H = MASSING.upperFloorHeight;
const FOOT_Y = STREET.kerbHeight;
/** Row-local x of the lane-safety line (world |x| = propMinX). */
const PROP_MAX_X = STREET.facadeX - STREET.propMinX;

interface Uvs {
  white: UvRect;
  concrete: UvRect;
  wood: UvRect;
  metal: UvRect;
  tank: UvRect;
  corrugated: UvRect;
  tarp: UvRect;
  lamp: UvRect;
  bulbs: UvRect;
  bulbsWarm: UvRect;
  garland: UvRect;
  toran: UvRect;
  lanterns: UvRect[];
  diya: UvRect;
  ac: UvRect;
  grills: UvRect[];
  rails: UvRect[];
  laundry: UvRect[];
  shutterPanel: UvRect;
  stone: UvRect;
  leaves: UvRect;
}

interface RowCtx {
  b: GeometryBuilder;
  atlas: FacadeAtlas;
  style: StreetStyle;
  rng: Rng;
  festive: boolean;
  uv: Uvs;
}

function commonUvs(atlas: FacadeAtlas): Uvs {
  return {
    white: atlas.uv("white"),
    concrete: atlas.uv("concrete"),
    wood: atlas.uv("wood"),
    metal: atlas.uv("metal"),
    tank: atlas.uv("tank"),
    corrugated: atlas.uv("corrugated"),
    tarp: atlas.uv("tarp"),
    lamp: atlas.uv("lamp"),
    bulbs: atlas.uv("bulbs"),
    bulbsWarm: atlas.uv("bulbsWarm"),
    garland: atlas.uv("garland"),
    toran: atlas.uv("toran"),
    lanterns: [atlas.uv("lantern0"), atlas.uv("lantern1")],
    diya: atlas.uv("diya"),
    ac: atlas.uv("ac"),
    grills: [atlas.uv("grill0"), atlas.uv("grill1")],
    rails: [atlas.uv("rail0"), atlas.uv("rail1"), atlas.uv("rail2")],
    laundry: [atlas.uv("laundry0"), atlas.uv("laundry1")],
    shutterPanel: atlas.uv("shutterPanel"),
    stone: atlas.uv("stone"),
    leaves: atlas.uv("leaves"),
  };
}

export function buildRowGeometry(
  atlas: FacadeAtlas,
  style: StreetStyle,
  festive: boolean,
  seed: number
): THREE.BufferGeometry {
  const ctx: RowCtx = {
    b: new GeometryBuilder(),
    atlas,
    style,
    rng: createRng(seed),
    festive,
    uv: commonUvs(atlas),
  };
  const length = STREET.rowLength;
  let z = 0;
  while (z > -length + 0.3) {
    const remaining = length + z;
    if (remaining > 5 && z < -2 && rChance(ctx.rng, MASSING.galiChance)) {
      const gw = rRange(ctx.rng, MASSING.galiWidth[0], MASSING.galiWidth[1]);
      gali(ctx, z, z - gw);
      z -= gw;
      continue;
    }
    let w = rRange(ctx.rng, style.buildingWidth[0], style.buildingWidth[1]);
    if (remaining - w < style.buildingWidth[0]) w = remaining;
    building(ctx, z, z - w);
    z -= w;
  }
  footpathProps(ctx, length);
  return ctx.b.toGeometry();
}

// ================================================================ helpers

function jitter(color: number, rng: Rng, amount: number): number {
  const f = 1 + (rng() - 0.5) * 2 * amount;
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

function scaleColor(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Quad on a plane facing +X at `x`, spanning zNear → zFar (u) and y0 → y1 (v). */
function front(b: GeometryBuilder, x: number, zNear: number, zFar: number, y0: number, y1: number, uv: UvRect): void {
  b.quad([x, y0, zNear], [x, y0, zFar], [x, y1, zFar], [x, y1, zNear], uv);
}

/** Double-sided version of `front` (awning valances, cloth, strings). */
function front2(b: GeometryBuilder, x: number, zNear: number, zFar: number, y0: number, y1: number, uv: UvRect): void {
  b.quad2([x, y0, zNear], [x, y0, zFar], [x, y1, zFar], [x, y1, zNear], uv);
}

/** Seamless plaster over any wall rectangle (tiles the family's wall cell). */
function plaster(
  ctx: RowCtx,
  family: PlasterFamily,
  width: number,
  height: number,
  point: (s: number, t: number) => Vec3
): void {
  const key = bayKey(family, "wall", false);
  for (let s = 0; s < width - 1e-3; s += TILE_W) {
    const sw = Math.min(TILE_W, width - s);
    for (let t = 0; t < height - 1e-3; t += TILE_H) {
      const th = Math.min(TILE_H, height - t);
      const uv = ctx.atlas.sub(key, 0, 1 - th / TILE_H, sw / TILE_W, 1);
      ctx.b.quad(point(s, t), point(s + sw, t), point(s + sw, t + th), point(s, t + th), uv);
    }
  }
}

function plasterFront(ctx: RowCtx, family: PlasterFamily, x: number, zNear: number, zFar: number, y0: number, y1: number): void {
  plaster(ctx, family, zNear - zFar, y1 - y0, (s, t) => [x, y0 + t, zNear - s]);
}

/** Wall in the XY plane at z; `facing` +1 → normal +Z, -1 → normal -Z. */
function plasterSide(ctx: RowCtx, family: PlasterFamily, z: number, xMin: number, xMax: number, y0: number, y1: number, facing: 1 | -1): void {
  if (facing > 0) plaster(ctx, family, xMax - xMin, y1 - y0, (s, t) => [xMin + s, y0 + t, z]);
  else plaster(ctx, family, xMax - xMin, y1 - y0, (s, t) => [xMax - s, y0 + t, z]);
}

function pickBay(ctx: RowCtx): BayKind {
  const entries = Object.entries(ctx.style.bayWeights) as [BayKind, number][];
  return rWeighted(ctx.rng, entries);
}

/** Vertical strip of bulbs hanging from (x, yTop, z) down to yBottom. */
function bulbStrand(ctx: RowCtx, x: number, z: number, yTop: number, yBottom: number, warm: boolean): void {
  const { b, rng, uv } = ctx;
  const cell = warm ? uv.bulbsWarm : uv.bulbs;
  const piece = 2.2;
  b.color = 0xffffff;
  for (let y = yTop; y > yBottom + 0.2; y -= piece) {
    const y2 = Math.max(yBottom, y - piece);
    b.alpha = Math.floor(rng() * 245);
    b.quad([x, y, z + 0.08], [x, y2, z + 0.08], [x, y2, z - 0.08], [x, y, z - 0.08], {
      u0: cell.u0,
      u1: cell.u0 + (cell.u1 - cell.u0) * ((y - y2) / piece),
      v0: cell.v0,
      v1: cell.v1,
    });
  }
  b.alpha = STEADY_ALPHA;
}

/** Catenary string of bulbs along z at x (row-local), cells of ~2.2 m. */
function bulbString(ctx: RowCtx, x: number, zNear: number, zFar: number, y: number, sag: number, warm: boolean): void {
  const { b, rng, uv } = ctx;
  const len = Math.abs(zNear - zFar);
  const pieces = Math.max(1, Math.round(len / 2.2));
  const pts = catenary([x, y, zNear], [x, y, zFar], sag, pieces);
  b.color = 0xffffff;
  for (let i = 0; i < pieces; i++) {
    b.alpha = Math.floor(rng() * 245);
    b.hangingStrip([pts[i], pts[i + 1]], 0.16, warm ? uv.bulbsWarm : uv.bulbs);
  }
  b.alpha = STEADY_ALPHA;
}

function lantern(ctx: RowCtx, x: number, y: number, z: number, size = 0.62): void {
  const { b, rng, uv } = ctx;
  const cell = rPick(rng, uv.lanterns);
  const w = size * 0.66;
  b.color = 0xffffff;
  b.alpha = Math.floor(rng() * 245);
  // Crossed quads read as a round paper lantern from any angle.
  b.quad2([x, y - size, z + w / 2], [x, y - size, z - w / 2], [x, y, z - w / 2], [x, y, z + w / 2], cell);
  b.quad2([x - w / 2, y - size, z], [x + w / 2, y - size, z], [x + w / 2, y, z], [x - w / 2, y, z], cell);
  b.alpha = STEADY_ALPHA;
}

function diya(ctx: RowCtx, x: number, y: number, z: number): void {
  const { b, rng, uv } = ctx;
  b.color = 0xffffff;
  b.alpha = Math.floor(rng() * 245);
  const s = 0.2;
  b.quad2([x, y, z + s / 2], [x, y, z - s / 2], [x, y + s, z - s / 2], [x, y + s, z + s / 2], uv.diya);
  b.alpha = STEADY_ALPHA;
}

// =============================================================== building

function building(ctx: RowCtx, zA: number, zB: number): void {
  const { b, rng, style } = ctx;
  const upper = rInt(rng, style.upperFloors[0], style.upperFloors[1]);
  const gH = MASSING.groundFloorHeight;
  const uH = MASSING.upperFloorHeight * rRange(rng, 0.97, 1.04);
  const H = gH + upper * uH;
  const wall = jitter(rPick(rng, style.wallColors), rng, 0.06);
  const trim = rPick(rng, style.trimColors);
  const family: PlasterFamily = rChance(rng, style.grimyShare) ? "B" : "A";
  const setback = rChance(rng, 0.3) ? rRange(rng, 0.1, 0.4) : 0;

  b.push().translate(-setback, 0, 0);
  groundFloor(ctx, zA, zB, gH, family, wall, trim);
  const shutterColor = rPick(rng, style.shutterColors);
  const railColor = rPick(rng, style.railingColors);
  for (let f = 0; f < upper; f++) {
    upperFloor(ctx, zA, zB, gH + f * uH, uH, family, wall, trim, shutterColor, railColor);
  }
  roof(ctx, zA, zB, H, family, wall, trim);
  sideWalls(ctx, zA, zB, H, family, wall);
  facadeClutter(ctx, zA, zB, gH, H);
  if (ctx.festive && rChance(rng, style.stringLightChance)) festiveFacade(ctx, zA, zB, gH, H);
  b.pop();
}

function groundFloor(ctx: RowCtx, zA: number, zB: number, gH: number, family: PlasterFamily, wall: number, trim: number): void {
  const { b, rng, style, uv, atlas } = ctx;
  const W = zA - zB;
  const n = Math.max(1, Math.round(W / MASSING.shopBayWidth));
  const pillar = 0.3;
  const bayW = (W - (n + 1) * pillar) / n;
  const top = MASSING.shopOpeningTop;
  const recess = MASSING.shopRecess;

  // Stone plinth step along the shop fronts.
  b.color = 0x9d978c;
  b.box(0, FOOT_Y, zB + 0.04, 0.32, FOOT_Y + 0.14, zA - 0.04, uv.concrete, FACE_PX | FACE_PY | FACE_PZ | FACE_NZ);

  // Pillars + lintel band.
  b.color = wall;
  for (let i = 0; i <= n; i++) {
    const zp = zA - i * (bayW + pillar);
    plasterFront(ctx, family, 0, zp, zp - pillar, FOOT_Y, top);
  }
  plasterFront(ctx, family, 0, zA, zB, top, gH);

  const awningAll = rChance(rng, style.awningChance);
  const awning = rPick(rng, style.awnings);
  for (let i = 0; i < n; i++) {
    const z0 = zA - pillar - i * (bayW + pillar);
    const z1 = z0 - bayW;
    const shop = rPick(rng, style.shops);
    b.color = 0xffffff;
    if (shop === "shutter") {
      front(b, -0.1, z0, z1, FOOT_Y, top, atlas.uv("shop.shutter"));
      b.color = scaleColor(wall, 0.75);
      plasterSide(ctx, family, z0, -0.1, 0, FOOT_Y, top, -1);
      plasterSide(ctx, family, z1, -0.1, 0, FOOT_Y, top, 1);
    } else {
      front(b, -recess, z0, z1, FOOT_Y, top, atlas.uv(`shop.${shop}`));
      b.color = scaleColor(wall, 0.72);
      plasterSide(ctx, family, z0, -recess, 0, FOOT_Y, top, -1);
      plasterSide(ctx, family, z1, -recess, 0, FOOT_Y, top, 1);
      // Soffit (faces down into the shop mouth).
      b.color = scaleColor(wall, 0.45);
      b.quad([0, top, z0], [-recess, top, z0], [-recess, top, z1], [0, top, z1], uv.concrete);
    }
    if (awningAll && shop !== "shutter") awningOver(ctx, z0 + 0.12, z1 - 0.12, top, awning);
    else if (rChance(rng, style.toranChance)) toran(ctx, z0, z1, top);
  }

  // Signboard(s): never stretched past ~1.3x the painted aspect.
  const signs = W > 6.4 && n >= 2 ? 2 : 1;
  const span = W / signs;
  for (let s = 0; s < signs; s++) {
    const signId = rPick(rng, style.signs);
    const h = rRange(rng, 0.72, 0.86);
    const w = Math.min(span - 0.35, h * 4.5 * 1.3);
    const zc = zA - span * (s + 0.5);
    const y0 = MASSING.signBottom + rRange(rng, -0.04, 0.06);
    b.color = 0x2c2c2c;
    b.box(0, y0, zc - w / 2, 0.12, y0 + h, zc + w / 2, { all: uv.white, px: atlas.uv(`sign.${signId}`) }, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);
  }

  // Cornice capping the shop floor.
  b.color = trim;
  b.box(0, gH - 0.08, zB, 0.16, gH + 0.07, zA, uv.concrete, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);
}

function awningOver(ctx: RowCtx, zNear: number, zFar: number, top: number, kind: string): void {
  const { b, atlas } = ctx;
  const key = `awning.${kind}`;
  const canopy = atlas.sub(key, 0, 0, 1, 50 / 64);
  const valance = atlas.sub(key, 0, 50 / 64, 1, 1);
  const ext = 1.05;
  const yTop = top + 0.02;
  const yLow = top - 0.34;
  b.color = 0xffffff;
  const pieces = Math.max(1, Math.round((zNear - zFar) / 1.4));
  const step = (zNear - zFar) / pieces;
  for (let i = 0; i < pieces; i++) {
    const za = zNear - i * step;
    const zb = za - step;
    b.quad2([ext, yLow, za], [ext, yLow, zb], [0.02, yTop, zb], [0.02, yTop, za], canopy);
    front2(b, ext, za, zb, yLow - 0.22, yLow, valance);
  }
  b.color = 0x3a3a3a;
  b.tube([[0.02, yTop - 0.5, zNear], [ext, yLow, zNear]], 0.018, ctx.uv.white);
  b.tube([[0.02, yTop - 0.5, zFar], [ext, yLow, zFar]], 0.018, ctx.uv.white);
}

function toran(ctx: RowCtx, zNear: number, zFar: number, top: number): void {
  const { b, uv } = ctx;
  const pieces = Math.max(1, Math.round((zNear - zFar) / 1.5));
  const step = (zNear - zFar) / pieces;
  b.color = 0xffffff;
  for (let i = 0; i < pieces; i++) {
    const za = zNear - i * step;
    front2(b, 0.16, za, za - step, top - 0.36, top + 0.02, uv.toran);
  }
}

function upperFloor(
  ctx: RowCtx,
  zA: number,
  zB: number,
  y0: number,
  uH: number,
  family: PlasterFamily,
  wall: number,
  trim: number,
  shutterColor: number,
  railColor: number
): void {
  const { b, rng, style, uv, atlas } = ctx;
  const W = zA - zB;
  const nb = Math.max(1, Math.round(W / MASSING.bayWidth));
  const bw = W / nb;
  const balcony = rChance(rng, style.balconyChance);

  b.color = trim;
  b.box(0, y0 - 0.07, zB, 0.12, y0 + 0.07, zA, uv.concrete, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);

  for (let i = 0; i < nb; i++) {
    const z0 = zA - i * bw;
    const z1 = z0 - bw;
    let kind = pickBay(ctx);
    if (balcony && kind !== "wall" && kind !== "vent" && rChance(rng, 0.55)) kind = "door";
    const lit = LIT_BAYS.has(kind) && rChance(rng, style.litChance);
    const key = bayKey(family, kind, lit);
    b.color = wall;
    front(b, 0, z0, z1, y0, y0 + uH, atlas.uv(key));

    // Window opening in bay coordinates (see FacadeAtlas WIN layout).
    const winNear = z0 - 0.266 * bw;
    const winFar = z0 - 0.734 * bw;
    const sillY = y0 + uH * (1 - 116 / 160);
    const headY = y0 + uH * (1 - 44 / 160);
    const windowish = kind === "win" || kind === "winB" || kind === "twin";

    if (kind === "arch" || kind === "jali") {
      if (rChance(rng, style.jharokhaChance)) jharokha(ctx, key, family, z0, bw, y0, uH, wall, trim);
      continue;
    }
    if (!balcony && (windowish || kind === "door") && rChance(rng, style.chajjaChance)) {
      b.color = trim;
      b.box(0, headY + 0.1, z0 - 0.15 * bw, 0.46, headY + 0.2, z0 - 0.85 * bw, uv.concrete, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);
    }
    if ((kind === "win" || kind === "winB") && rChance(rng, style.shutterChance)) {
      const pw = (winNear - winFar) / 2;
      b.color = shutterColor;
      front(b, 0.03, winNear + pw, winNear, sillY, headY, uv.shutterPanel);
      front(b, 0.03, winFar, winFar - pw, sillY, headY, uv.shutterPanel);
    }
    if (windowish && !balcony && rChance(rng, style.grillBoxChance)) {
      b.color = railColor;
      const grill = rPick(rng, uv.grills);
      b.box(0, sillY - 0.05, winFar - 0.08, 0.4, headY + 0.06, winNear + 0.08, {
        all: grill,
        py: uv.corrugated,
        ny: uv.concrete,
      }, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);
    } else if (kind !== "door" && rChance(rng, style.acChance)) {
      b.color = rPick(rng, [0xf2f0ea, 0xe7e2d6, 0xd9d4ca]);
      const acNear = kind === "wall" || kind === "vent" ? z0 - bw * 0.3 : winFar + 0.1;
      b.box(0, y0 + 0.25, acNear - 0.82, 0.34, y0 + 0.8, acNear, { all: uv.white, px: uv.ac });
    }
    if (ctx.festive && rChance(rng, style.lanternChance * 0.5)) lantern(ctx, 0.5, headY + 0.18, (winNear + winFar) / 2);
    if (ctx.festive && windowish && rChance(rng, style.diyaChance * 0.6)) {
      diya(ctx, 0.12, sillY + 0.02, winNear - 0.2);
      diya(ctx, 0.12, sillY + 0.02, winFar + 0.2);
    }
  }

  if (balcony) balconyOn(ctx, zA, zB, y0, uH, trim, railColor);
}

function jharokha(ctx: RowCtx, key: string, family: PlasterFamily, z0: number, bw: number, y0: number, uH: number, wall: number, trim: number): void {
  const { b, atlas, uv } = ctx;
  const zN = z0 - 0.14 * bw;
  const zF = z0 - 0.86 * bw;
  const yb = y0 + 0.55;
  const yt = y0 + 2.45;
  const d = 0.62;
  const jaliKey = bayKey(family, "jali", key.endsWith(".lit"));
  b.color = wall;
  b.box(0, yb, zF, d, yt, zN, {
    all: uv.concrete,
    px: atlas.sub(key, 24 / 128, 22 / 160, 104 / 128, 128 / 160),
    pz: atlas.sub(jaliKey, 28 / 128, 36 / 160, 100 / 128, 120 / 160),
    nz: atlas.sub(jaliKey, 28 / 128, 36 / 160, 100 / 128, 120 / 160),
  }, FACE_PX | FACE_PZ | FACE_NZ);
  // Cornice slab, small dome (chhatri top) and a bracket below.
  b.color = trim;
  b.box(-0.02, yt, zF - 0.1, d + 0.12, yt + 0.12, zN + 0.1, uv.concrete);
  b.box(-0.02, yb - 0.1, zF - 0.06, d + 0.08, yb, zN + 0.06, uv.concrete);
  const r = Math.min(0.45, (zN - zF) / 2);
  b.sphere(d / 2, yt + 0.12, (zN + zF) / 2, r, r * 0.9, r, 10, 5, uv.concrete, Math.PI / 2);
  b.cylinder(d / 2, yt + 0.12 + r * 0.9, (zN + zF) / 2, 0.03, 0.01, 0.2, 5, uv.white, false);
  b.push().translate(d / 2, yb - 0.1, (zN + zF) / 2).rotateY(Math.PI / 4);
  b.cylinder(0, -0.42, 0, 0.05, Math.min(0.5, r * 1.1), 0.42, 4, uv.concrete, false);
  b.pop();
}

function balconyOn(ctx: RowCtx, zA: number, zB: number, y0: number, uH: number, trim: number, railColor: number): void {
  const { b, rng, style, uv } = ctx;
  const W = zA - zB;
  const full = W < 5.5 || rChance(rng, 0.5);
  const len = full ? W - 0.5 : rRange(rng, 2.4, Math.max(2.5, W * 0.6));
  const zN = full ? zA - 0.25 : zA - 0.25 - rRange(rng, 0, Math.max(0, W - 0.5 - len));
  const zF = zN - len;
  const depth = 0.95;
  b.color = trim;
  b.box(0, y0 - 0.06, zF, depth, y0 + 0.12, zN, uv.concrete, FACE_PX | FACE_PY | FACE_NY | FACE_PZ | FACE_NZ);
  // Railing: pieces of ~3 m each mapping one railing cell.
  const rail = rPick(rng, uv.rails);
  const yr0 = y0 + 0.12;
  const yr1 = y0 + 1.05;
  b.color = railColor;
  const pieces = Math.max(1, Math.round(len / 3));
  const step = len / pieces;
  for (let i = 0; i < pieces; i++) {
    const za = zN - i * step;
    front2(b, depth - 0.03, za, za - step, yr0, yr1, rail);
  }
  const sideRail = { u0: rail.u0, u1: rail.u0 + (rail.u1 - rail.u0) * (depth / 3), v0: rail.v0, v1: rail.v1 };
  b.quad2([0, yr0, zN], [depth - 0.03, yr0, zN], [depth - 0.03, yr1, zN], [0, yr1, zN], sideRail);
  b.quad2([depth - 0.03, yr0, zF], [0, yr0, zF], [0, yr1, zF], [depth - 0.03, yr1, zF], sideRail);
  b.color = scaleColor(railColor, 1.1);
  b.box(0, yr1, zF, depth, yr1 + 0.05, zN, uv.white, FACE_PX | FACE_PY | FACE_PZ | FACE_NZ);

  // Life on the balcony: laundry, potted plants, festive lamps.
  if (rChance(rng, style.laundryChance)) {
    const cell = rPick(rng, uv.laundry);
    const lz0 = zN - 0.2;
    const lz1 = Math.max(zF + 0.2, lz0 - 2.8);
    b.color = 0xffffff;
    front2(b, depth * 0.72, lz0, lz1, y0 + 1.05, y0 + 2.05, cell);
    b.color = 0x3a3a3a;
    b.tube([[depth * 0.72, y0 + 2.05, zN], [depth * 0.72, y0 + 2.05, zF]], 0.01, uv.white);
  }
  const plants = rInt(rng, 0, 3);
  for (let i = 0; i < plants; i++) {
    const pz = zN - rRange(rng, 0.3, len - 0.3);
    b.color = 0xb5623a;
    b.cylinder(0.55, y0 + 0.12, pz, 0.14, 0.11, 0.26, 7, uv.concrete, true);
    b.color = rPick(rng, [0x4f8a3a, 0x3f7a34, 0x6a9a44]);
    b.sphere(0.55, y0 + 0.5, pz, 0.24, 0.22, 0.24, 7, 5, uv.leaves);
  }
  if (ctx.festive) {
    if (rChance(rng, style.stringLightChance)) bulbString(ctx, depth + 0.02, zN, zF, yr1 + 0.02, 0.12, rChance(rng, 0.5));
    if (rChance(rng, style.lanternChance)) lantern(ctx, depth * 0.6, y0 + uH - 0.12, (zN + zF) / 2, 0.7);
    if (rChance(rng, style.diyaChance)) {
      for (let z = zN - 0.3; z > zF + 0.2; z -= rRange(rng, 0.5, 0.8)) diya(ctx, depth - 0.02, yr1 + 0.05, z);
    }
  }
}

function roof(ctx: RowCtx, zA: number, zB: number, H: number, family: PlasterFamily, wall: number, trim: number): void {
  const { b, rng, style, uv } = ctx;
  const W = zA - zB;
  const D = MASSING.buildingDepth;
  const P = MASSING.parapetHeight;
  // Roof deck (visible from the rocket camera).
  b.color = scaleColor(wall, 0.62);
  b.quad([0, H, zA], [0, H, zB], [-D, H, zB], [-D, H, zA], uv.concrete);

  b.color = wall;
  if (style.crenellated) {
    plasterFront(ctx, family, 0, zA, zB, H, H + P * 0.55);
    b.color = trim;
    b.box(-0.24, H + P * 0.55, zB, 0.04, H + P * 0.62, zA, uv.concrete);
    b.color = wall;
    for (let z = zA - 0.15; z > zB + 0.3; z -= 0.62) {
      b.box(-0.2, H + P * 0.62, z - 0.34, 0.02, H + P * 1.15, z, uv.concrete, FACE_PX | FACE_PY | FACE_PZ | FACE_NZ);
    }
  } else {
    plasterFront(ctx, family, 0, zA, zB, H, H + P);
    b.color = trim;
    b.box(-0.26, H + P, zB, 0.05, H + P + 0.08, zA, uv.concrete);
  }
  b.color = scaleColor(wall, 0.85);
  b.box(-D, H, zA - 0.2, 0, H + P, zA, uv.concrete, FACE_PY | FACE_PZ | FACE_NZ);
  b.box(-D, H, zB, 0, H + P, zB + 0.2, uv.concrete, FACE_PY | FACE_PZ | FACE_NZ);

  // Rooftop life: black water tanks, dish antennas, stair rooms, tarps.
  const tanks = rChance(rng, style.tankChance) ? rInt(rng, 1, W > 5 ? 2 : 1) : 0;
  for (let i = 0; i < tanks; i++) {
    const tx = -rRange(rng, 1.3, 3.8);
    const tz = zA - rRange(rng, 0.9, Math.max(1, W - 0.9));
    const r = rRange(rng, 0.52, 0.72);
    const h = rRange(rng, 1.0, 1.35);
    b.color = 0x8a877f;
    b.box(tx - r, H, tz - r, tx + r, H + 0.32, tz + r, uv.concrete, FACE_PX | FACE_PY | FACE_PZ | FACE_NZ);
    b.color = rChance(rng, 0.8) ? 0x1d1d1d : rPick(rng, [0xdedad0, 0x2a5fa8]);
    b.cylinder(tx, H + 0.32, tz, r, r * 0.96, h, 12, uv.tank, true);
    b.cylinder(tx, H + 0.32 + h, tz, r * 0.4, r * 0.36, 0.1, 10, uv.tank, true);
  }
  if (rChance(rng, style.dishChance)) {
    const dx = -rRange(rng, 0.5, 2.2);
    const dz = zA - rRange(rng, 0.6, Math.max(0.7, W - 0.6));
    b.color = 0x8a8a8a;
    b.box(dx - 0.03, H, dz - 0.03, dx + 0.03, H + 1.3, dz + 0.03, uv.white);
    b.push().translate(dx + 0.1, H + 1.35, dz).rotateZ(-1.05).rotateY(rRange(rng, -0.6, 0.6));
    b.color = rPick(rng, [0xe9e9e6, 0xd7d9dc, 0x2b2b2b]);
    b.sphere(0, 0, 0, 0.42, 0.14, 0.42, 10, 3, uv.metal, Math.PI / 2);
    b.pop();
  }
  if (W > 4.4 && rChance(rng, 0.35)) {
    const sx0 = -rRange(rng, 2.4, 3.2);
    const sz0 = zA - rRange(rng, 0.4, W - 3);
    b.color = wall;
    plasterFront(ctx, family, sx0, sz0, sz0 - 2.4, H, H + 2.5);
    b.color = scaleColor(wall, 0.8);
    b.box(sx0 - 2.4, H, sz0 - 2.4, sx0, H + 2.5, sz0, uv.concrete, FACE_PZ | FACE_NZ);
    b.color = scaleColor(wall, 0.6);
    b.box(sx0 - 2.5, H + 2.5, sz0 - 2.5, sx0 + 0.1, H + 2.62, sz0 + 0.1, uv.concrete);
    b.color = 0x5a4632;
    front(b, sx0 + 0.01, sz0 - 0.7, sz0 - 1.6, H, H + 2.0, uv.wood);
  }
  if (rChance(rng, 0.3)) {
    // TV antenna.
    const ax = -rRange(rng, 0.6, 2.4);
    const az = zA - rRange(rng, 0.5, Math.max(0.6, W - 0.5));
    b.color = 0x6a6a6a;
    b.tube([[ax, H, az], [ax, H + 2.6, az]], 0.02, uv.white);
    for (let k = 0; k < 4; k++) b.tube([[ax - 0.5, H + 1.6 + k * 0.25, az], [ax + 0.5, H + 1.6 + k * 0.25, az]], 0.012, uv.white);
  }
  if (rChance(rng, style.tarpChance)) {
    const tz0 = zA - rRange(rng, 0.2, W * 0.4);
    const tz1 = Math.max(zB + 0.2, tz0 - rRange(rng, 2, 4));
    b.color = 0xffffff;
    b.quad2([-0.6, H + 2.3, tz0], [-0.6, H + 2.3, tz1], [-4.2, H + 1.5, tz1], [-4.2, H + 1.5, tz0], uv.tarp);
    b.color = 0x6a5a44;
    b.tube([[-0.6, H, tz0], [-0.6, H + 2.3, tz0]], 0.03, uv.white);
    b.tube([[-0.6, H, tz1], [-0.6, H + 2.3, tz1]], 0.03, uv.white);
  }
  if (rChance(rng, style.chhatriChance)) {
    const cz = rChance(rng, 0.5) ? zA - 0.9 : zB + 0.9;
    const cx = -0.9;
    const s = 0.62;
    b.color = trim;
    for (const [px, pz] of [
      [-s, -s],
      [s, -s],
      [-s, s],
      [s, s],
    ]) {
      b.box(cx + px - 0.07, H + P, cz + pz - 0.07, cx + px + 0.07, H + P + 1.3, cz + pz + 0.07, uv.concrete);
    }
    b.box(cx - s - 0.2, H + P + 1.3, cz - s - 0.2, cx + s + 0.2, H + P + 1.42, cz + s + 0.2, uv.concrete);
    b.color = wall;
    b.sphere(cx, H + P + 1.42, cz, s + 0.1, s * 0.95, s + 0.1, 10, 5, uv.concrete, Math.PI / 2);
    b.color = 0xd9a23a;
    b.cylinder(cx, H + P + 1.42 + s * 0.95, cz, 0.05, 0.01, 0.35, 5, uv.white, false);
  }
  if (ctx.festive && rChance(rng, style.stringLightChance)) {
    bulbString(ctx, 0.1, zA - 0.1, zB + 0.1, H + P + 0.12, 0.18, rChance(rng, 0.5));
    if (rChance(rng, style.diyaChance)) {
      for (let z = zA - 0.3; z > zB + 0.2; z -= rRange(rng, 0.7, 1.1)) diya(ctx, -0.1, H + P + 0.08, z);
    }
  }
}

function sideWalls(ctx: RowCtx, zA: number, zB: number, H: number, family: PlasterFamily, wall: number): void {
  const { b, rng, style } = ctx;
  const D = MASSING.buildingDepth;
  const top = H + MASSING.parapetHeight;
  b.color = scaleColor(wall, 0.92);
  plasterSide(ctx, family, zA, -D, 0, 0, top, 1);
  plasterSide(ctx, family, zB, -D, 0, 0, top, -1);
  const gH = MASSING.groundFloorHeight;
  if (H > gH + 4 && rChance(rng, style.wallAdChance)) {
    const ad = ctx.atlas.uv(`wallAd${rInt(rng, 0, WALL_ADS.length - 1)}`);
    const y0 = gH + rRange(rng, 0.6, 1.4);
    const w = rRange(rng, 3.4, 4.6);
    const x1 = -rRange(rng, 0.5, 1.2);
    const x0 = x1 - w;
    b.color = 0xffffff;
    if (rChance(rng, 0.5)) b.quad([x0, y0, zA + 0.02], [x1, y0, zA + 0.02], [x1, y0 + w * 0.5, zA + 0.02], [x0, y0 + w * 0.5, zA + 0.02], ad);
    else b.quad([x1, y0, zB - 0.02], [x0, y0, zB - 0.02], [x0, y0 + w * 0.5, zB - 0.02], [x1, y0 + w * 0.5, zB - 0.02], ad);
  }
  if (rChance(rng, style.posterChance)) {
    const poster = ctx.atlas.uv(`poster${rInt(rng, 0, POSTERS.length - 1)}`);
    const y0 = rRange(rng, 1.0, 1.5);
    const x1 = -rRange(rng, 0.3, 1.6);
    b.color = 0xffffff;
    b.quad([x1 - 0.45, y0, zA + 0.02], [x1, y0, zA + 0.02], [x1, y0 + 0.66, zA + 0.02], [x1 - 0.45, y0 + 0.66, zA + 0.02], poster);
  }
}

/** Drain pipes and sagging cables that make facades feel lived-in. */
function facadeClutter(ctx: RowCtx, zA: number, zB: number, gH: number, H: number): void {
  const { b, rng, uv } = ctx;
  if (rChance(rng, 0.55)) {
    const pz = rChance(rng, 0.5) ? zA - 0.14 : zB + 0.14;
    b.color = rPick(rng, [0x5a5a58, 0x3a3a3a, 0x7a746a]);
    b.box(0.02, 0.2, pz - 0.05, 0.12, H + 0.3, pz + 0.05, uv.white, FACE_PX | FACE_PZ | FACE_NZ);
  }
  b.color = 0x161616;
  const cables = rInt(rng, 1, 3);
  for (let i = 0; i < cables; i++) {
    const y = gH + 0.15 + i * 0.12;
    b.tube(catenary([0.22, y, zA], [0.22, y, zB], rRange(rng, 0.08, 0.25), 6), 0.014, uv.white);
  }
}

/** Diwali: bulb cascades down the facade + lanterns. */
function festiveFacade(ctx: RowCtx, zA: number, zB: number, gH: number, H: number): void {
  const { rng } = ctx;
  const warm = rChance(rng, 0.45);
  const top = H + MASSING.parapetHeight;
  for (let z = zA - rRange(rng, 0.25, 0.6); z > zB + 0.2; z -= rRange(rng, 0.45, 0.8)) {
    bulbStrand(ctx, 0.08, z, top, Math.max(gH + 0.4, top - rRange(rng, 4, 9)), warm);
  }
  if (rChance(rng, ctx.style.lanternChance)) lantern(ctx, 1.1, gH + 0.2, (zA + zB) / 2, 0.8);
}

// =================================================================== gali

function gali(ctx: RowCtx, zA: number, zB: number): void {
  const { b, rng, uv } = ctx;
  const depth = 6.5;
  // Alley floor continuing the footpath inward.
  b.color = 0x6a645a;
  b.quad([-1.2, FOOT_Y + 0.005, zA], [-1.2, FOOT_Y + 0.005, zB], [-depth, FOOT_Y + 0.005, zB], [-depth, FOOT_Y + 0.005, zA], uv.concrete);
  // Dim back wall.
  b.color = 0x5c554b;
  plasterFront(ctx, "B", -depth, zA, zB, 0, 11);
  b.color = 0x161616;
  for (let i = 0; i < rInt(rng, 2, 4); i++) {
    const x = -rRange(rng, 0.5, depth - 1);
    const y = rRange(rng, 4, 9);
    b.tube(catenary([x, y, zA], [x + rRange(rng, -1, 1), y + rRange(rng, -0.6, 0.6), zB], rRange(rng, 0.1, 0.35), 5), 0.014, uv.white);
  }
  if (rChance(rng, 0.6)) {
    b.color = 0xffffff;
    front2(b, -rRange(rng, 1.5, 4), zA, zB, 4.2, 5.2, rPick(rng, uv.laundry));
  }
}

// ================================================================== props

function footpathProps(ctx: RowCtx, length: number): void {
  const { b, rng, style, atlas } = ctx;
  const entries = Object.entries(style.props) as [PropKind, number][];
  const spacing = 10 / style.propDensity;
  let z = -rRange(rng, 0.9, spacing);
  while (z > -length + 0.9) {
    const kind = rWeighted(rng, entries);
    const radius = PROP_RADIUS[kind];
    const blocked = STREET.furnitureSlots.some((slot) => Math.abs(z - slot) < radius + STREET.furnitureClearance);
    if (blocked || z - radius < -length + 0.2) {
      z -= 0.7;
      continue;
    }
    let x: number;
    let rot: number;
    switch (kind) {
      case "scooter":
      case "cycle":
        // Parked nose-to-road with a casual angle.
        x = Math.min(PROP_MAX_X - radius, 1.45);
        rot = Math.PI / 2 + rRange(rng, -0.35, 0.35);
        break;
      case "cart":
      case "cow":
      case "umbrella":
        x = Math.min(PROP_MAX_X - radius, rRange(rng, 1.2, 1.5));
        rot = (rChance(rng, 0.5) ? 0 : Math.PI) + rRange(rng, -0.25, 0.25);
        break;
      case "shrine":
        x = 0.02;
        rot = 0;
        break;
      default:
        x = radius + 0.2;
        rot = rRange(rng, -0.3, 0.3);
        break;
    }
    b.push().translate(x, FOOT_Y, z).rotateY(rot);
    buildProp(b, atlas, kind, rng, ctx.festive);
    b.pop();
    z -= radius * 2 + rRange(rng, 0.3, spacing);
  }
}
