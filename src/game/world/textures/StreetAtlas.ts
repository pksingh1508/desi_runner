import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { UvRect } from "../gfx/GeometryBuilder";
import { blotches, crack, makeCanvas, rgba, speckles } from "../gfx/canvas";
import { createRng, rPick, rRange, type Rng } from "../gfx/random";
import { STREET } from "@/game/config/street";

/**
 * Street atlas: vertical strips that tile along the street (v repeats every
 * `STREET.texturePeriod` meters) plus a decal column (manholes, zebra bars,
 * speed-breaker paint, rangoli). A half-res companion map stores dry
 * roughness in G and a puddle mask in B for the monsoon wetness shader.
 */

const W = 1024;
const H = 2048;
/** Strip columns in texels [start, end). */
const COLS = {
  road: [0, 640],
  kerbFace: [648, 680],
  kerbTop: [688, 720],
  footpath: [728, 936],
  decal: [944, 1024],
} as const;

type DecalKey = "manhole" | "grate" | "zebra" | "speed" | "rangoli0" | "rangoli1" | "rangoli2";
const DECALS: Record<DecalKey, { y: number; h: number }> = {
  manhole: { y: 8, h: 80 },
  grate: { y: 96, h: 40 },
  zebra: { y: 144, h: 256 },
  speed: { y: 408, h: 160 },
  rangoli0: { y: 576, h: 80 },
  rangoli1: { y: 664, h: 80 },
  rangoli2: { y: 752, h: 80 },
};

export interface StreetAtlas {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  /** u range of a strip column (v is world-driven and repeats). */
  column(name: "road" | "kerbFace" | "kerbTop" | "footpath"): { u0: number; u1: number };
  decal(key: DecalKey): UvRect;
}

export type StreetDecalKey = DecalKey;

export function buildStreetAtlas(bag: ResourceBag): StreetAtlas {
  const rng = createRng(4242);
  const color = makeCanvas(W, H);
  const rough = makeCanvas(W / 2, H / 2);
  const puddle = makeCanvas(W / 2, H / 2);
  const ctx = color.ctx;
  const rctx = rough.ctx;
  const pctx = puddle.ctx;
  // Roughness/puddle canvases are painted in full-res coordinates.
  rctx.scale(0.5, 0.5);
  pctx.scale(0.5, 0.5);
  rctx.fillStyle = gray(0.9);
  rctx.fillRect(0, 0, W, H);
  pctx.fillStyle = "#000";
  pctx.fillRect(0, 0, W, H);

  paintRoad(ctx, rctx, pctx, rng);
  paintKerb(ctx, rctx, rng, COLS.kerbFace, true);
  paintKerb(ctx, rctx, rng, COLS.kerbTop, false);
  paintFootpath(ctx, rctx, pctx, rng);
  paintDecals(ctx, rctx, rng);

  // Pack roughness (G) + puddle mask (B).
  const r = rctx.getImageData(0, 0, W / 2, H / 2);
  const p = pctx.getImageData(0, 0, W / 2, H / 2).data;
  for (let i = 0; i < r.data.length; i += 4) {
    r.data[i + 2] = p[i];
    r.data[i] = 0;
    r.data[i + 3] = 255;
  }
  rctx.putImageData(r, 0, 0);

  const map = bag.tex(new THREE.CanvasTexture(color.canvas));
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 16;
  const roughnessMap = bag.tex(new THREE.CanvasTexture(rough.canvas));
  roughnessMap.flipY = false;
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  return {
    map,
    roughnessMap,
    column: (name) => ({ u0: (COLS[name][0] + 1) / W, u1: (COLS[name][1] - 1) / W }),
    decal: (key) => {
      const d = DECALS[key];
      return {
        u0: (COLS.decal[0] + 1) / W,
        u1: (COLS.decal[1] - 1) / W,
        v0: (d.y + d.h - 1) / H,
        v1: (d.y + 1) / H,
      };
    },
  };
}

function gray(v: number): string {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c},${c},${c})`;
}

/** Draw a feature at y and its vertical wrap copies (texture tiles in v). */
function wrapY(fn: (oy: number) => void): void {
  fn(-H);
  fn(0);
  fn(H);
}

// -------------------------------------------------------------------- road

function paintRoad(ctx: CanvasRenderingContext2D, rctx: CanvasRenderingContext2D, pctx: CanvasRenderingContext2D, rng: Rng): void {
  const [x0, x1] = COLS.road;
  const w = x1 - x0;
  const pxPerM = w / (STREET.roadHalfWidth * 2);
  const xOf = (m: number): number => x0 + w / 2 + m * pxPerM;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, H);
  ctx.clip();
  rctx.save();
  rctx.beginPath();
  rctx.rect(x0, 0, w, H);
  rctx.clip();
  pctx.save();
  pctx.beginPath();
  pctx.rect(x0, 0, w, H);
  pctx.clip();

  ctx.fillStyle = "#38393d";
  ctx.fillRect(x0, 0, w, H);

  // Large tonal patches (old/new asphalt, sun-bleach).
  for (let i = 0; i < 46; i++) {
    const cx = x0 + rng() * w;
    const cy = rng() * H;
    const rad = rRange(rng, 40, 170);
    const dark = rng() < 0.55;
    const a = rRange(rng, 0.08, 0.22);
    wrapY((oy) => {
      const g = ctx.createRadialGradient(cx, cy + oy, 0, cx, cy + oy, rad);
      g.addColorStop(0, rgba(dark ? "#1f2023" : "#5a5b5f", a));
      g.addColorStop(1, rgba(dark ? "#1f2023" : "#5a5b5f", 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy + oy - rad, rad * 2, rad * 2);
    });
  }

  // Polished wheel paths (darker, smoother) + oil drips at lane centers.
  for (const lane of [-2.5, 0, 2.5]) {
    for (const off of [-0.82, 0.82]) {
      const cx = xOf(lane + off);
      const g = ctx.createLinearGradient(cx - 16, 0, cx + 16, 0);
      g.addColorStop(0, "rgba(20,20,22,0)");
      g.addColorStop(0.5, "rgba(20,20,22,0.22)");
      g.addColorStop(1, "rgba(20,20,22,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 16, 0, 32, H);
      rctx.fillStyle = gray(0.72);
      rctx.fillRect(cx - 9, 0, 18, H);
    }
    for (let i = 0; i < 7; i++) {
      const cx = xOf(lane) + rRange(rng, -12, 12);
      const cy = rng() * H;
      const rad = rRange(rng, 8, 26);
      wrapY((oy) => {
        const g = ctx.createRadialGradient(cx, cy + oy, 0, cx, cy + oy, rad);
        g.addColorStop(0, "rgba(10,10,12,0.38)");
        g.addColorStop(1, "rgba(10,10,12,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - rad, cy + oy - rad, rad * 2, rad * 2);
        rctx.fillStyle = gray(0.55);
        rctx.beginPath();
        rctx.arc(cx, cy + oy, rad * 0.6, 0, Math.PI * 2);
        rctx.fill();
      });
    }
  }

  // Repair patches: barely-different asphalt with a soft tar-sealed seam.
  for (let i = 0; i < 6; i++) {
    const pw = rRange(rng, 50, 170);
    const ph = rRange(rng, 70, 260);
    const px = x0 + rRange(rng, 10, w - pw - 10);
    const py = rng() * H;
    const tone = rPick(rng, ["rgba(46,47,51,0.55)", "rgba(66,67,71,0.45)", "rgba(52,53,57,0.5)"]);
    wrapY((oy) => {
      ctx.fillStyle = tone;
      ctx.fillRect(px, py + oy, pw, ph);
      ctx.strokeStyle = "rgba(14,14,16,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py + oy, pw, ph);
      rctx.strokeStyle = gray(0.6);
      rctx.lineWidth = 3;
      rctx.strokeRect(px, py + oy, pw, ph);
    });
  }

  // Transverse tar seams + longitudinal cracks.
  for (const sy of [H * 0.31, H * 0.79]) {
    ctx.strokeStyle = "rgba(10,10,12,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, sy);
    for (let x = x0; x <= x1; x += 32) ctx.lineTo(x, sy + Math.sin(x * 0.05) * 4 + rRange(rng, -2, 2));
    ctx.stroke();
    rctx.strokeStyle = gray(0.35);
    rctx.lineWidth = 6;
    rctx.beginPath();
    rctx.moveTo(x0, sy);
    rctx.lineTo(x1, sy);
    rctx.stroke();
  }
  for (let i = 0; i < 34; i++) {
    const cx = x0 + rng() * w;
    const cy = rng() * H;
    const len = rRange(rng, 20, 120);
    wrapY((oy) => crack(ctx, rng, cx, cy + oy, len, "#121214", rRange(rng, 1, 2.2), 0.8));
  }

  // Aggregate.
  speckles(ctx, rng, x0, 0, w, H, 16000, "#a9a9a4", 0.8, 2, 0.1, 0.35);
  speckles(ctx, rng, x0, 0, w, H, 9000, "#141416", 0.8, 2.2, 0.15, 0.4);

  // Gutters along the kerbs: dust, grit, silt.
  for (const [gx, dir] of [
    [x0, 1],
    [x1, -1],
  ] as const) {
    const g = ctx.createLinearGradient(gx, 0, gx + dir * 34, 0);
    g.addColorStop(0, "rgba(96,82,62,0.55)");
    g.addColorStop(1, "rgba(96,82,62,0)");
    ctx.fillStyle = g;
    ctx.fillRect(dir > 0 ? gx : gx - 34, 0, 34, H);
    speckles(ctx, rng, dir > 0 ? gx : gx - 28, 0, 28, H, 1800, "#8a7a60", 1, 3, 0.2, 0.5);
    rctx.fillStyle = gray(0.95);
    rctx.fillRect(dir > 0 ? gx : gx - 24, 0, 24, H);
  }

  // Puddles in ruts and gutters (only visible when the wetness uniform > 0):
  // irregular clusters of overlapping soft blobs.
  for (let i = 0; i < 22; i++) {
    const inGutter = rng() < 0.45;
    const cx = inGutter ? (rng() < 0.5 ? x0 + rRange(rng, 6, 26) : x1 - rRange(rng, 6, 26)) : xOf(rPick(rng, [-3.3, -1.7, 0.8, -0.8, 1.7, 3.3])) + rRange(rng, -8, 8);
    const cy = rng() * H;
    const blobs = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < blobs; k++) {
      const bx = cx + rRange(rng, -12, 12);
      const by = cy + rRange(rng, -60, 60);
      const rw = rRange(rng, 6, 18);
      const rh = rRange(rng, 16, 55);
      const strength = rRange(rng, 0.55, 1);
      wrapY((oy) => {
        pctx.save();
        pctx.translate(bx, by + oy);
        pctx.scale(rw / rh, 1);
        const g = pctx.createRadialGradient(0, 0, 0, 0, 0, rh);
        g.addColorStop(0, `rgba(255,255,255,${strength})`);
        g.addColorStop(0.6, `rgba(255,255,255,${strength * 0.7})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        pctx.fillStyle = g;
        pctx.beginPath();
        pctx.arc(0, 0, rh, 0, Math.PI * 2);
        pctx.fill();
        pctx.restore();
      });
    }
  }

  // Lane markings: 3 m dashes / 3 m gaps at ±1.25 m, solid edge lines.
  const pxPerMz = H / STREET.texturePeriod;
  const paint = (x: number, y: number, lw: number, lh: number): void => {
    ctx.fillStyle = "rgba(236,233,224,0.93)";
    ctx.fillRect(x, y, lw, lh);
    rctx.fillStyle = gray(0.6);
    rctx.fillRect(x, y, lw, lh);
  };
  for (const m of [-1.25, 1.25]) {
    const lx = xOf(m) - 3.5;
    for (let z = 0; z < STREET.texturePeriod; z += 6) paint(lx, z * pxPerMz, 7, 3 * pxPerMz);
  }
  for (const m of [-5.08, 5.08]) paint(xOf(m) - 4, 0, 8, H);
  // Wear on the paint (tyres scrub it away).
  speckles(ctx, rng, x0, 0, w, H, 6000, "#3a3b3f", 1, 3, 0.25, 0.6);

  ctx.restore();
  rctx.restore();
  pctx.restore();
}

// ------------------------------------------------------------------- kerbs

function paintKerb(ctx: CanvasRenderingContext2D, rctx: CanvasRenderingContext2D, rng: Rng, col: readonly [number, number], face: boolean): void {
  const [x0, x1] = col;
  const w = x1 - x0;
  const block = H / STREET.texturePeriod; // 1 m blocks
  for (let i = 0; i < STREET.texturePeriod; i++) {
    const y = i * block;
    ctx.fillStyle = i % 2 === 0 ? "#f0bf1c" : "#202020";
    ctx.fillRect(x0, y, w, block);
    // Mortar joint.
    ctx.fillStyle = "rgba(60,55,45,0.8)";
    ctx.fillRect(x0, y, w, 2);
  }
  blotches(ctx, rng, x0, 0, w, H, 60, "#7a6a52", 4, 14, 0.35);
  speckles(ctx, rng, x0, 0, w, H, 1400, "#e8e2d0", 0.8, 2.4, 0.15, 0.5);
  speckles(ctx, rng, x0, 0, w, H, 900, "#4b4336", 0.8, 2.2, 0.2, 0.55);
  if (face) {
    // Road grime creeping up from the bottom (u = x0 is the road level).
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "rgba(70,60,45,0.55)");
    g.addColorStop(0.6, "rgba(70,60,45,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, H);
  } else {
    // Worn outer edge.
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x0, 0, 5, H);
  }
  rctx.fillStyle = gray(0.78);
  rctx.fillRect(x0, 0, w, H);
}

// ---------------------------------------------------------------- footpath

function paintFootpath(ctx: CanvasRenderingContext2D, rctx: CanvasRenderingContext2D, pctx: CanvasRenderingContext2D, rng: Rng): void {
  const [x0, x1] = COLS.footpath;
  const w = x1 - x0;
  const footWidthM = STREET.footpathOuterX - (STREET.roadHalfWidth + STREET.kerbWidth);
  const pxPerMx = w / footWidthM;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, H);
  ctx.clip();
  ctx.fillStyle = "#6f6a62";
  ctx.fillRect(x0, 0, w, H);
  // Edge band of grey stones next to the kerb.
  const edgeW = 0.3 * pxPerMx;
  const rows = 60; // 0.4 m tiles along z (tiles cleanly in 24 m)
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    ctx.fillStyle = r % 2 === 0 ? "#8d8a84" : "#85827c";
    ctx.fillRect(x0, y + 1, edgeW - 2, rowH * 2 - 2);
  }
  // Checker tiles: terracotta + grey (0.4 m squares).
  const tileW = 0.4 * pxPerMx;
  let colIdx = 0;
  for (let x = x0 + edgeW; x < x1; x += tileW, colIdx++) {
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const broken = rng() < 0.04;
      const base = (colIdx + r) % 2 === 0 ? "#9d5c48" : "#8e8d88";
      ctx.fillStyle = broken ? "#4f4a42" : base;
      ctx.fillRect(x + 1, y + 1, tileW - 2, rowH - 2);
      if (!broken) {
        ctx.fillStyle = rgba("#ffffff", rRange(rng, 0, 0.1));
        ctx.fillRect(x + 1, y + 1, tileW - 2, 2);
      }
    }
  }
  blotches(ctx, rng, x0, 0, w, H, 90, "#3d372e", 8, 34, 0.3);
  blotches(ctx, rng, x0, 0, w, H, 40, "#c9bfa8", 8, 30, 0.18);
  speckles(ctx, rng, x0, 0, w, H, 5000, "#2f2b25", 0.8, 2, 0.2, 0.5);
  // Dirt against the buildings.
  const g = ctx.createLinearGradient(x1 - 60, 0, x1, 0);
  g.addColorStop(0, "rgba(60,50,38,0)");
  g.addColorStop(1, "rgba(60,50,38,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(x1 - 60, 0, 60, H);
  ctx.restore();
  rctx.fillStyle = gray(0.92);
  rctx.fillRect(x0, 0, w, H);
  for (let i = 0; i < 8; i++) {
    const cx = x0 + rng() * w;
    const cy = rng() * H;
    const rad = rRange(rng, 10, 26);
    wrapY((oy) => {
      const pg = pctx.createRadialGradient(cx, cy + oy, 0, cx, cy + oy, rad);
      pg.addColorStop(0, "rgba(255,255,255,0.8)");
      pg.addColorStop(1, "rgba(255,255,255,0)");
      pctx.fillStyle = pg;
      pctx.fillRect(cx - rad, cy + oy - rad, rad * 2, rad * 2);
    });
  }
}

// ------------------------------------------------------------------ decals

function paintDecals(ctx: CanvasRenderingContext2D, rctx: CanvasRenderingContext2D, rng: Rng): void {
  const x0 = COLS.decal[0];
  const w = COLS.decal[1] - COLS.decal[0];
  // Manhole: cast iron disc.
  {
    const d = DECALS.manhole;
    const cx = x0 + w / 2;
    const cy = d.y + d.h / 2;
    ctx.fillStyle = "#38393d";
    ctx.fillRect(x0, d.y, w, d.h);
    ctx.fillStyle = "#4a4640";
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a2724";
    ctx.lineWidth = 3;
    for (const r of [w * 0.44, w * 0.3, w * 0.16]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * w * 0.16, cy + Math.sin(a) * w * 0.16);
      ctx.lineTo(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * w * 0.44);
      ctx.stroke();
    }
    blotches(ctx, rng, x0, d.y, w, d.h, 8, "#7a4a22", 4, 12, 0.4);
    rctx.fillStyle = gray(0.5);
    rctx.fillRect(x0, d.y, w, d.h);
  }
  // Drain grate.
  {
    const d = DECALS.grate;
    ctx.fillStyle = "#2c2a27";
    ctx.fillRect(x0, d.y, w, d.h);
    ctx.fillStyle = "#0d0c0b";
    for (let x = x0 + 6; x < x0 + w - 6; x += 9) ctx.fillRect(x, d.y + 6, 5, d.h - 12);
    rctx.fillStyle = gray(0.5);
    rctx.fillRect(x0, d.y, w, d.h);
  }
  // Zebra bar: thermoplastic white with tyre wear.
  {
    const d = DECALS.zebra;
    ctx.fillStyle = "#ecebe4";
    ctx.fillRect(x0, d.y, w, d.h);
    speckles(ctx, rng, x0, d.y, w, d.h, 900, "#3a3b3f", 1, 3.5, 0.2, 0.7);
    blotches(ctx, rng, x0, d.y, w, d.h, 10, "#6a6a66", 6, 20, 0.3);
    rctx.fillStyle = gray(0.62);
    rctx.fillRect(x0, d.y, w, d.h);
  }
  // Speed-breaker paint: yellow/black diagonal bands.
  {
    const d = DECALS.speed;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, d.y, w, d.h);
    ctx.clip();
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(x0, d.y, w, d.h);
    ctx.fillStyle = "#f2c21a";
    for (let k = -4; k < 12; k++) {
      ctx.beginPath();
      ctx.moveTo(x0, d.y + k * 40);
      ctx.lineTo(x0 + w, d.y + k * 40 + 40);
      ctx.lineTo(x0 + w, d.y + k * 40 + 60);
      ctx.lineTo(x0, d.y + k * 40 + 20);
      ctx.closePath();
      ctx.fill();
    }
    speckles(ctx, rng, x0, d.y, w, d.h, 500, "#55544f", 1, 3, 0.2, 0.6);
    ctx.restore();
    rctx.fillStyle = gray(0.66);
    rctx.fillRect(x0, d.y, w, d.h);
  }
  // Rangoli (Diwali footpaths).
  const rangoliPalettes = [
    ["#e91e63", "#ffc107", "#00bcd4", "#ffffff", "#ff5722"],
    ["#7b1fa2", "#ff9800", "#4caf50", "#ffeb3b", "#ffffff"],
    ["#f44336", "#2196f3", "#ffeb3b", "#ffffff", "#e040fb"],
  ];
  (["rangoli0", "rangoli1", "rangoli2"] as const).forEach((key, i) => {
    const d = DECALS[key];
    const cx = x0 + w / 2;
    const cy = d.y + d.h / 2;
    const pal = rangoliPalettes[i];
    ctx.fillStyle = "#6f6a62";
    ctx.fillRect(x0, d.y, w, d.h);
    const petals = 8 + i * 4;
    for (let ring = 4; ring >= 0; ring--) {
      const r = (w * 0.48 * (ring + 1)) / 5;
      ctx.fillStyle = pal[ring % pal.length];
      ctx.beginPath();
      for (let k = 0; k <= petals * 2; k++) {
        const a = (k / (petals * 2)) * Math.PI * 2;
        const rr = k % 2 === 0 ? r : r * 0.78;
        if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * w * 0.3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    rctx.fillStyle = gray(0.95);
    rctx.fillRect(x0, d.y, w, d.h);
  });
}
