import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AtlasLayout } from "../gfx/Atlas";
import type { UvRect } from "../gfx/GeometryBuilder";
import {
  BODY_FONT,
  DEVANAGARI_FONT,
  DISPLAY_FONT,
  blotches,
  centeredText,
  crack,
  grainImage,
  makeCanvas,
  rgba,
  roundRect,
  shade,
  speckles,
} from "../gfx/canvas";
import { createRng, rChance, rInt, rPick, rRange, type Rng } from "../gfx/random";
import {
  MILESTONES,
  POSTERS,
  SHOP_SIGNS,
  WALL_ADS,
  type AwningKind,
  type BayKind,
  type ShopKind,
  type ShopSignDef,
} from "@/game/config/buildings";

/**
 * Procedural facade atlas: every building surface, shop, sign, awning and
 * prop detail in one 2048² texture (+ a half-res emissive twin for night).
 *
 * Alpha encodes how the vertex tint applies:
 *   a = 0      → cut out (railings, laundry, garlands, bulbs…)
 *   a ≈ 0.59   → keep painted colors (signs, shop interiors, white Jaipur
 *                linework, bricks…)
 *   a = 1      → multiply by the vertex tint (plaster, frames, shutters…)
 * The facade material decodes this in its shader (see StreetMaterials).
 */

const SIZE = 2048;
const EMISSIVE_SIZE = 1024;
const PAD = 4;
/** Alpha byte that marks "keep painted color" texels. */
const UNTINTED_ALPHA = 150;

type TintMode = "tinted" | "untinted" | "twoTone";

interface Cell {
  ctx: CanvasRenderingContext2D;
  ectx: CanvasRenderingContext2D;
  mctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  rng: Rng;
  /** Copies the painted diffuse cell into the emissive map at `strength`. */
  glowCopy(strength: number): void;
}

interface CellSpec {
  key: string;
  w: number;
  h: number;
  tint: TintMode;
  cutout?: boolean;
  paint(c: Cell): void;
}

export type PlasterFamily = "A" | "B";

export interface FacadeAtlas {
  layout: AtlasLayout;
  map: THREE.DataTexture;
  emissiveMap: THREE.CanvasTexture;
  uv(key: string): UvRect;
  sub(key: string, fx0: number, fy0: number, fx1: number, fy1: number): UvRect;
  has(key: string): boolean;
}

/** Bay kinds that have a lit (night) twin cell. */
export const LIT_BAYS: ReadonlySet<BayKind> = new Set<BayKind>(["win", "winB", "twin", "door", "arch", "jali"]);
const FAMILY_A_BAYS: readonly BayKind[] = ["wall", "wallAlt", "vent", "win", "winB", "twin", "door", "arch", "jali"];
const FAMILY_B_BAYS: readonly BayKind[] = ["wall", "wallAlt", "vent", "brick", "win", "winB", "twin", "door"];
const SHOP_KINDS: readonly ShopKind[] = [
  "shutter", "shutterHalf", "kirana", "sweets", "mobile", "cloth", "utensils", "chai", "medical", "flowers", "jewel", "tailor",
];
const AWNING_KINDS: readonly AwningKind[] = ["red", "orange", "green", "blueYellow", "tarp", "tin", "pink"];

/** Atlas key for a bay cell; unknown family/kind combos fall back to family A. */
export function bayKey(family: PlasterFamily, kind: BayKind, lit: boolean): string {
  const fam = family === "B" && FAMILY_B_BAYS.includes(kind) ? "B" : "A";
  const k = FAMILY_A_BAYS.includes(kind) || fam === "B" ? kind : "wall";
  return `bay.${fam}.${k}${lit && LIT_BAYS.has(k) ? ".lit" : ""}`;
}

export function buildFacadeAtlas(bag: ResourceBag): FacadeAtlas {
  const specs = cellSpecs();
  const layout = new AtlasLayout(SIZE, SIZE, PAD);
  for (const s of specs) layout.request(s.key, s.w, s.h);
  layout.pack();

  const main = makeCanvas(SIZE, SIZE);
  const emissive = makeCanvas(EMISSIVE_SIZE, EMISSIVE_SIZE);
  const mask = makeCanvas(SIZE, SIZE);
  emissive.ctx.fillStyle = "#000";
  emissive.ctx.fillRect(0, 0, EMISSIVE_SIZE, EMISSIVE_SIZE);
  mask.ctx.fillStyle = "#000";
  mask.ctx.fillRect(0, 0, SIZE, SIZE);

  const scale = EMISSIVE_SIZE / SIZE;
  let seed = 7;
  for (const spec of specs) {
    const r = layout.rect(spec.key);
    const { ctx } = main;
    const ectx = emissive.ctx;
    const mctx = mask.ctx;
    ctx.save();
    ectx.save();
    mctx.save();
    ctx.translate(r.x, r.y);
    ectx.setTransform(scale, 0, 0, scale, r.x * scale, r.y * scale);
    mctx.translate(r.x, r.y);
    for (const c of [ctx, ectx, mctx]) {
      c.beginPath();
      c.rect(0, 0, spec.w, spec.h);
      c.clip();
    }
    if (spec.tint === "untinted") {
      mctx.fillStyle = "#fff";
      mctx.fillRect(0, 0, spec.w, spec.h);
    }
    const cell: Cell = {
      ctx,
      ectx,
      mctx,
      w: spec.w,
      h: spec.h,
      rng: createRng(seed++ * 7919),
      glowCopy(strength: number) {
        ectx.save();
        ectx.globalAlpha = strength;
        ectx.globalCompositeOperation = "lighter";
        ectx.drawImage(main.canvas, r.x, r.y, spec.w, spec.h, 0, 0, spec.w, spec.h);
        ectx.restore();
      },
    };
    spec.paint(cell);
    ctx.restore();
    ectx.restore();
    mctx.restore();
  }

  // Compose alpha (cutout / untinted / tinted), fix fringes, add grain.
  const image = main.ctx.getImageData(0, 0, SIZE, SIZE);
  const maskData = mask.ctx.getImageData(0, 0, SIZE, SIZE).data;
  const data = image.data;
  for (const spec of specs) {
    const r = layout.rect(spec.key);
    for (let y = r.y; y < r.y + r.h; y++) {
      let i = (y * SIZE + r.x) * 4;
      for (let x = 0; x < r.w; x++, i += 4) {
        const a = data[i + 3];
        if (a < 110) {
          data[i + 3] = 0;
          continue;
        }
        data[i + 3] = maskData[i] > 127 ? UNTINTED_ALPHA : 255;
      }
    }
  }
  for (const spec of specs) {
    const r = layout.rect(spec.key);
    grainImage(data, SIZE, 99, r.x, r.y, r.w, r.h, spec.tint === "untinted" ? 7 : 10);
    if (spec.cutout) dilate(data, r.x, r.y, r.w, r.h, 3);
    extrude(data, r.x, r.y, r.w, r.h, PAD / 2);
  }

  const map = bag.tex(new THREE.DataTexture(new Uint8Array(data.buffer), SIZE, SIZE, THREE.RGBAFormat));
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const emissiveMap = bag.tex(new THREE.CanvasTexture(emissive.canvas));
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.flipY = false;
  emissiveMap.anisotropy = 4;

  return {
    layout,
    map,
    emissiveMap,
    uv: (key) => layout.uv(key),
    sub: (key, fx0, fy0, fx1, fy1) => layout.sub(key, fx0, fy0, fx1, fy1),
    has: (key) => layout.has(key),
  };
}

// ============================================================ cell catalogue

function cellSpecs(): CellSpec[] {
  const specs: CellSpec[] = [];
  const BAY_W = 128;
  const BAY_H = 160;
  for (const kind of FAMILY_A_BAYS) addBay(specs, "A", kind, BAY_W, BAY_H);
  for (const kind of FAMILY_B_BAYS) addBay(specs, "B", kind, BAY_W, BAY_H);

  for (const kind of SHOP_KINDS) {
    specs.push({ key: `shop.${kind}`, w: 256, h: 160, tint: "untinted", paint: (c) => paintShop(c, kind) });
  }
  for (const def of SHOP_SIGNS) {
    specs.push({ key: `sign.${def.id}`, w: 504, h: 112, tint: "untinted", paint: (c) => paintSign(c, def) });
  }
  for (const kind of AWNING_KINDS) {
    specs.push({ key: `awning.${kind}`, w: 128, h: 64, tint: "untinted", cutout: true, paint: (c) => paintAwning(c, kind) });
  }
  WALL_ADS.forEach((def, i) => {
    specs.push({ key: `wallAd${i}`, w: 256, h: 128, tint: "untinted", paint: (c) => paintWallAd(c, def.hindi, def.english, def.bg, def.fg, def.accent) });
  });
  POSTERS.forEach((def, i) => {
    specs.push({ key: `poster${i}`, w: 64, h: 96, tint: "untinted", paint: (c) => paintPoster(c, def.top, def.bottom, def.bg, def.fg) });
  });
  MILESTONES.forEach((def, i) => {
    specs.push({ key: `milestone${i}`, w: 64, h: 96, tint: "untinted", paint: (c) => paintMilestone(c, def.hindi, def.english, def.km) });
  });

  specs.push(
    { key: "ac", w: 96, h: 64, tint: "tinted", paint: paintAc },
    { key: "grill0", w: 128, h: 128, tint: "tinted", cutout: true, paint: (c) => paintGrill(c, 0) },
    { key: "grill1", w: 128, h: 128, tint: "tinted", cutout: true, paint: (c) => paintGrill(c, 1) },
    { key: "rail0", w: 256, h: 64, tint: "tinted", cutout: true, paint: (c) => paintRailing(c, 0) },
    { key: "rail1", w: 256, h: 64, tint: "tinted", cutout: true, paint: (c) => paintRailing(c, 1) },
    { key: "rail2", w: 256, h: 64, tint: "tinted", cutout: true, paint: (c) => paintRailing(c, 2) },
    { key: "shutterPanel", w: 64, h: 128, tint: "tinted", paint: paintShutterPanel },
    { key: "laundry0", w: 256, h: 96, tint: "untinted", cutout: true, paint: (c) => paintLaundry(c, 0) },
    { key: "laundry1", w: 256, h: 96, tint: "untinted", cutout: true, paint: (c) => paintLaundry(c, 1) },
    { key: "danger", w: 64, h: 64, tint: "untinted", paint: paintDanger },
    { key: "shrine", w: 128, h: 128, tint: "untinted", paint: paintShrine },
    { key: "tank", w: 64, h: 64, tint: "tinted", paint: paintTank },
    { key: "garland", w: 256, h: 32, tint: "untinted", cutout: true, paint: paintGarland },
    { key: "toran", w: 256, h: 64, tint: "untinted", cutout: true, paint: paintToran },
    { key: "bulbs", w: 256, h: 32, tint: "untinted", cutout: true, paint: (c) => paintBulbs(c, false) },
    { key: "bulbsWarm", w: 256, h: 32, tint: "untinted", cutout: true, paint: (c) => paintBulbs(c, true) },
    { key: "lantern0", w: 64, h: 96, tint: "untinted", cutout: true, paint: (c) => paintLantern(c, 0) },
    { key: "lantern1", w: 64, h: 96, tint: "untinted", cutout: true, paint: (c) => paintLantern(c, 1) },
    { key: "diya", w: 32, h: 32, tint: "untinted", cutout: true, paint: paintDiya },
    { key: "white", w: 32, h: 32, tint: "tinted", paint: paintWhite },
    { key: "lamp", w: 32, h: 32, tint: "untinted", paint: paintLamp },
    { key: "wood", w: 64, h: 64, tint: "tinted", paint: paintWood },
    { key: "metal", w: 64, h: 64, tint: "tinted", paint: paintMetal },
    { key: "brick", w: 128, h: 128, tint: "untinted", paint: (c) => paintBricks(c.ctx, c.rng, 0, 0, c.w, c.h) },
    { key: "stone", w: 128, h: 128, tint: "tinted", paint: paintStone },
    { key: "leaves", w: 128, h: 128, tint: "tinted", paint: paintLeaves },
    { key: "wheel", w: 64, h: 64, tint: "untinted", cutout: true, paint: paintWheel },
    { key: "wheelSolid", w: 64, h: 64, tint: "untinted", cutout: true, paint: paintWheelSolid },
    { key: "corrugated", w: 64, h: 64, tint: "tinted", paint: paintCorrugated },
    { key: "tarp", w: 128, h: 128, tint: "untinted", paint: paintTarp },
    { key: "fabric", w: 64, h: 64, tint: "tinted", paint: paintFabric },
    { key: "fruit", w: 64, h: 64, tint: "untinted", paint: (c) => paintProduce(c, false) },
    { key: "veg", w: 64, h: 64, tint: "untinted", paint: (c) => paintProduce(c, true) },
    { key: "sacks", w: 64, h: 64, tint: "untinted", paint: paintSacks },
    { key: "transformer", w: 64, h: 64, tint: "tinted", paint: paintTransformer },
    { key: "concrete", w: 64, h: 64, tint: "tinted", paint: paintConcrete }
  );
  return specs;
}

function addBay(specs: CellSpec[], family: PlasterFamily, kind: BayKind, w: number, h: number): void {
  const tint: TintMode = kind === "wall" || kind === "vent" ? "tinted" : "twoTone";
  specs.push({ key: bayKey(family, kind, false), w, h, tint, paint: (c) => paintBay(c, family, kind, false) });
  if (LIT_BAYS.has(kind)) {
    specs.push({ key: bayKey(family, kind, true), w, h, tint, paint: (c) => paintBay(c, family, kind, true) });
  }
}

// ================================================================ primitives

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function vgrad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bottom: string
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function tile9(w: number, h: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy);
}

// ================================================================== plaster

/** Seamless plaster tile (same seed per family → neighbours line up). */
function plasterBase(c: Cell, family: PlasterFamily): void {
  const { ctx, w, h } = c;
  const rng = createRng(family === "A" ? 90001 : 90002);
  ctx.fillStyle = family === "A" ? "#eee9e0" : "#e2dccf";
  ctx.fillRect(0, 0, w, h);

  const blots = Array.from({ length: 16 }, () => ({
    x: rng() * w,
    y: rng() * h,
    r: rRange(rng, 12, 44),
    light: rng() < 0.45,
    a: rRange(rng, 0.05, 0.14),
  }));
  for (const b of blots) {
    tile9(w, h, (ox, oy) =>
      radial(ctx, b.x + ox, b.y + oy, b.r, b.light ? "#ffffff" : "#8b7f6c", b.a * (family === "B" && !b.light ? 1.7 : 1))
    );
  }
  const streakCount = family === "A" ? 6 : 14;
  for (let i = 0; i < streakCount; i++) {
    const sx = rng() * w;
    const sy = rng() * h;
    const sw = rRange(rng, 1.5, 5);
    const sh = rRange(rng, 24, 80);
    const a = rRange(rng, 0.05, family === "A" ? 0.12 : 0.22);
    tile9(w, h, (ox, oy) => {
      const g = ctx.createLinearGradient(0, sy + oy, 0, sy + oy + sh);
      g.addColorStop(0, rgba("#5e5446", a));
      g.addColorStop(1, rgba("#5e5446", 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx + ox, sy + oy, sw, sh);
    });
  }
  if (family === "B") {
    // Monsoon damp: dark greenish bands creeping up from each floor line.
    const g = ctx.createLinearGradient(0, h * 0.72, 0, h);
    g.addColorStop(0, rgba("#3d4636", 0));
    g.addColorStop(1, rgba("#3d4636", 0.26));
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    for (let i = 0; i < 8; i++) {
      const bx = rng() * w;
      const by = h * rRange(rng, 0.75, 1);
      const br = rRange(rng, 8, 20);
      for (const ox of [-w, 0, w]) radial(ctx, bx + ox, by, br, "#394232", 0.2);
    }
  }
  speckles(ctx, rng, 0, 0, w, h, 420, "#5b5347", 0.7, 1.6, 0.05, 0.16);
  speckles(ctx, rng, 0, 0, w, h, 220, "#ffffff", 0.7, 1.4, 0.06, 0.2);
  for (let i = 0; i < (family === "A" ? 1 : 3); i++) {
    crack(ctx, rng, rRange(rng, 10, w - 10), rRange(rng, 10, h - 10), rRange(rng, 18, 40), "#51493e", 0.8, 0.45);
  }
  // Baked contact shadow under each floor's cornice / slab (decor casts no
  // real shadows, so this keeps facades from reading flat).
  const ao = ctx.createLinearGradient(0, 0, 0, h * 0.2);
  ao.addColorStop(0, "rgba(38,28,18,0.3)");
  ao.addColorStop(1, "rgba(38,28,18,0)");
  ctx.fillStyle = ao;
  ctx.fillRect(0, 0, w, h * 0.2);
}

// ===================================================================== bays

// Window opening geometry inside a 128×160 bay (3.1 m storey).
const WIN = { x: 34, y: 44, w: 60, h: 72 };

function paintBay(c: Cell, family: PlasterFamily, kind: BayKind, lit: boolean): void {
  plasterBase(c, family);
  const warm = "#ffc56e";
  const cool = "#e4eeff";
  switch (kind) {
    case "wall":
      break;
    case "wallAlt":
      wallAlt(c, family);
      break;
    case "vent":
      vent(c);
      break;
    case "brick":
      peeledBrick(c);
      break;
    case "win":
      frame(c, WIN.x, WIN.y, WIN.w, WIN.h);
      glassWindow(c, WIN.x, WIN.y, WIN.w, WIN.h, lit ? warm : null, family === "A" ? "#8c1f33" : "#1f5f66");
      sill(c, WIN.x, WIN.y + WIN.h, WIN.w);
      break;
    case "winB":
      frame(c, WIN.x, WIN.y, WIN.w, WIN.h);
      barredWindow(c, WIN.x, WIN.y, WIN.w, WIN.h, lit ? cool : null);
      sill(c, WIN.x, WIN.y + WIN.h, WIN.w);
      break;
    case "twin":
      twinWindows(c, lit ? warm : null);
      break;
    case "door":
      balconyDoor(c, family, lit ? warm : null);
      break;
    case "arch":
      archWindow(c, lit ? warm : null);
      break;
    case "jali":
      jaliWindow(c, lit ? "#ffb85c" : null);
      break;
  }
}

/** Painted (tinted) frame around an opening with a soft shadow. */
function frame(c: Cell, x: number, y: number, w: number, h: number): void {
  const { ctx } = c;
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x - 5, y - 4, w + 12, h + 12);
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(x - 6, y + h + 3, w + 12, 3);
}

function sill(c: Cell, x: number, y: number, w: number): void {
  const { ctx } = c;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(x - 9, y + 2, w + 18, 6);
  vgrad(ctx, x - 9, y + 8, w + 18, 8, "rgba(0,0,0,0.22)", "rgba(0,0,0,0)");
}

function openingMask(c: Cell, x: number, y: number, w: number, h: number): void {
  c.mctx.fillStyle = "#fff";
  c.mctx.fillRect(x, y, w, h);
}

function glassWindow(c: Cell, x: number, y: number, w: number, h: number, litColor: string | null, curtain: string): void {
  const { ctx, ectx, rng } = c;
  openingMask(c, x, y, w, h);
  vgrad(ctx, x, y, w, h, "#3c332b", "#241e19");
  // Curtain: two gathered panels with folds.
  const cw = w * rRange(rng, 0.3, 0.42);
  for (const side of [0, 1]) {
    const px = side === 0 ? x : x + w - cw;
    ctx.fillStyle = curtain;
    ctx.fillRect(px, y, cw, h);
    for (let f = 0; f < cw; f += 5) {
      ctx.fillStyle = f % 10 === 0 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.16)";
      ctx.fillRect(px + f, y, 2.5, h);
    }
  }
  // Mullions + glass sheen.
  ctx.fillStyle = "#e9e4da";
  ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
  ctx.fillRect(x, y + h * 0.42, w, 3);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "rgba(210,228,240,0.26)");
  g.addColorStop(0.45, "rgba(210,228,240,0.05)");
  g.addColorStop(0.55, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(210,228,240,0.04)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (litColor) {
    const eg = ectx.createRadialGradient(x + w / 2, y + h * 0.3, 2, x + w / 2, y + h / 2, w * 0.8);
    eg.addColorStop(0, litColor);
    eg.addColorStop(1, shade(litColor, 0.55));
    ectx.fillStyle = eg;
    ectx.fillRect(x, y, w, h);
    ectx.fillStyle = rgba(curtain, 0.75);
    ectx.fillRect(x, y, cw, h);
    ectx.fillRect(x + w - cw, y, cw, h);
    ectx.fillStyle = "#000";
    ectx.fillRect(x + w / 2 - 1.5, y, 3, h);
    ectx.fillRect(x, y + h * 0.42, w, 3);
  }
}

function barredWindow(c: Cell, x: number, y: number, w: number, h: number, litColor: string | null): void {
  const { ctx, ectx, rng } = c;
  openingMask(c, x, y, w, h);
  vgrad(ctx, x, y, w, h, "#2f2924", "#1d1814");
  // Interior hint: a shelf + a picture frame.
  ctx.fillStyle = "rgba(120,90,60,0.5)";
  ctx.fillRect(x + 6, y + h * 0.62, w * 0.45, 3);
  ctx.fillStyle = "rgba(180,60,40,0.45)";
  ctx.fillRect(x + w * 0.6, y + 10, 12, 15);
  // Half-open wooden shutter leaf.
  ctx.fillStyle = rPick(rng, ["#3f6f4f", "#2f587f", "#6b4a2f"]);
  ctx.fillRect(x, y, w * 0.22, h);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let s = y + 4; s < y + h; s += 6) ctx.fillRect(x + 2, s, w * 0.22 - 4, 2);
  if (litColor) {
    vgradOn(ectx, x, y, w, h, litColor, shade(litColor, 0.45));
    ectx.fillStyle = "#000";
    ectx.fillRect(x, y, w * 0.22, h);
  }
  // Iron bars (painted after glow so they silhouette at night).
  for (let bx = x + 5; bx < x + w - 2; bx += 7) {
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(bx, y, 2, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(bx, y, 0.8, h);
    if (litColor) {
      ectx.fillStyle = "#000";
      ectx.fillRect(bx, y, 2, h);
    }
  }
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(x, y + h * 0.33, w, 2);
  ctx.fillRect(x, y + h * 0.7, w, 2);
}

function vgradOn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
  vgrad(ctx, x, y, w, h, top, bottom);
}

function twinWindows(c: Cell, litColor: string | null): void {
  const { ctx, ectx } = c;
  const ww = 30;
  const wh = 76;
  const y = 40;
  for (const x of [24, 74]) {
    ctx.fillStyle = "#faf8f3";
    ctx.beginPath();
    ctx.moveTo(x - 5, y + wh + 5);
    ctx.lineTo(x - 5, y + 10);
    ctx.arc(x + ww / 2, y + 10, ww / 2 + 5, Math.PI, 0);
    ctx.lineTo(x + ww + 5, y + wh + 5);
    ctx.closePath();
    ctx.fill();
    // Opening with arched head.
    const path = new Path2D();
    path.moveTo(x, y + wh);
    path.lineTo(x, y + 10);
    path.arc(x + ww / 2, y + 10, ww / 2, Math.PI, 0);
    path.lineTo(x + ww, y + wh);
    path.closePath();
    c.mctx.fillStyle = "#fff";
    c.mctx.fill(path);
    const g = ctx.createLinearGradient(0, y, 0, y + wh);
    g.addColorStop(0, "#3a3029");
    g.addColorStop(1, "#1f1a16");
    ctx.fillStyle = g;
    ctx.fill(path);
    if (litColor) {
      const eg = ectx.createLinearGradient(0, y, 0, y + wh);
      eg.addColorStop(0, litColor);
      eg.addColorStop(1, shade(litColor, 0.5));
      ectx.fillStyle = eg;
      ectx.fill(path);
    }
    ctx.fillStyle = "#1b1b1b";
    for (let bx = x + 5; bx < x + ww; bx += 7) {
      ctx.fillRect(bx, y + 2, 2, wh - 2);
      if (litColor) {
        ectx.fillStyle = "#000";
        ectx.fillRect(bx, y + 2, 2, wh - 2);
        ectx.fillStyle = litColor;
      }
    }
    sill(c, x, y + wh, ww);
  }
}

function balconyDoor(c: Cell, family: PlasterFamily, litColor: string | null): void {
  const { ctx, ectx } = c;
  const x = 30;
  const y = 22;
  const w = 68;
  const h = 138;
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(x - 6, y - 6, w + 12, h + 6);
  openingMask(c, x, y, w, h);
  const wood = family === "A" ? "#2f6b5a" : "#5a4230";
  ctx.fillStyle = wood;
  ctx.fillRect(x, y, w, h);
  for (const lx of [x, x + w / 2]) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(lx + 1, y, 1.5, h);
    // Glass upper panes.
    ctx.fillStyle = "#2a3238";
    ctx.fillRect(lx + 5, y + 6, w / 2 - 10, h * 0.45);
    ctx.fillStyle = "rgba(200,225,240,0.22)";
    ctx.fillRect(lx + 5, y + 6, (w / 2 - 10) * 0.45, h * 0.45);
    // Raised lower panels.
    ctx.fillStyle = shade(wood, 1.18);
    ctx.fillRect(lx + 6, y + h * 0.56, w / 2 - 12, h * 0.36);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(lx + 6, y + h * 0.56 + h * 0.36 - 2, w / 2 - 12, 2);
    if (litColor) {
      vgradOn(ectx, lx + 5, y + 6, w / 2 - 10, h * 0.45, litColor, shade(litColor, 0.6));
    }
  }
  ctx.fillStyle = "#d8b24a";
  ctx.fillRect(x + w / 2 - 5, y + h * 0.52, 3, 6);
}

function archWindow(c: Cell, litColor: string | null): void {
  const { ctx, ectx, mctx } = c;
  const x = 30;
  const y = 30;
  const w = 68;
  const h = 92;
  const springY = y + 30;
  const archPath = (inset: number): Path2D => {
    const p = new Path2D();
    const xl = x + inset;
    const xr = x + w - inset;
    p.moveTo(xl, y + h - inset);
    p.lineTo(xl, springY);
    // Cusped (multifoil) Rajput arch.
    const r = (xr - xl) / 6;
    for (let i = 0; i < 3; i++) {
      const ax = xl + r + i * 2 * r;
      const lift = [0, 14, 0][i] - inset * 0.2;
      p.arc(ax, springY - lift, r, Math.PI, 0);
    }
    p.lineTo(xr, y + h - inset);
    p.closePath();
    return p;
  };
  // White (untinted) linework: outer border frame + arch outline.
  const border = new Path2D();
  border.rect(x - 12, y - 16, w + 24, h + 24);
  mctx.lineWidth = 4;
  mctx.strokeStyle = "#fff";
  mctx.stroke(border);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fbf6ec";
  ctx.stroke(border);
  // Dotted flower motifs in the spandrels.
  for (const [dx, dy] of [
    [x - 4, y - 8],
    [x + w + 4, y - 8],
    [x + w / 2, y - 9],
  ]) {
    ctx.fillStyle = "#fbf6ec";
    mctx.fillStyle = "#fff";
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(dx + Math.cos(a) * 4, dy + Math.sin(a) * 4, 1.8, 0, Math.PI * 2);
      ctx.fill();
      mctx.beginPath();
      mctx.arc(dx + Math.cos(a) * 4, dy + Math.sin(a) * 4, 2.2, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  const outer = archPath(-5);
  ctx.fillStyle = "#fbf6ec";
  ctx.fill(outer);
  mctx.fillStyle = "#fff";
  mctx.fill(outer);
  const inner = archPath(0);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#3b2c28");
  g.addColorStop(1, "#1e1614");
  ctx.fillStyle = g;
  ctx.fill(inner);
  if (litColor) {
    const eg = ectx.createLinearGradient(0, y, 0, y + h);
    eg.addColorStop(0, litColor);
    eg.addColorStop(1, shade(litColor, 0.55));
    ectx.fillStyle = eg;
    ectx.fill(inner);
  }
  // Lower lattice screen.
  ctx.save();
  ctx.clip(inner);
  ctx.fillStyle = "#e7d6c4";
  for (let ly = springY + 18; ly < y + h; ly += 7) {
    for (let lx = x; lx < x + w; lx += 7) {
      ctx.fillRect(lx, ly, 7, 1.6);
      ctx.fillRect(lx, ly, 1.6, 7);
    }
  }
  ctx.restore();
  sill(c, x, y + h, w);
}

function jaliWindow(c: Cell, litColor: string | null): void {
  const { ctx, ectx, mctx } = c;
  const x = 28;
  const y = 36;
  const w = 72;
  const h = 84;
  frame(c, x, y, w, h);
  // Holes (untinted, dark / glowing); stone lattice stays tinted.
  const cell = 12;
  for (let gy = y + 3; gy < y + h - 4; gy += cell) {
    for (let gx = x + 3; gx < x + w - 4; gx += cell) {
      const path = new Path2D();
      const cx = gx + cell / 2;
      const cy = gy + cell / 2;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = k % 2 === 0 ? 5 : 2.6;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (k === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
      mctx.fillStyle = "#fff";
      mctx.fill(path);
      ctx.fillStyle = "#231a16";
      ctx.fill(path);
      if (litColor) {
        ectx.fillStyle = litColor;
        ectx.fill(path);
      }
    }
  }
  sill(c, x, y + h, w);
}

function vent(c: Cell): void {
  const { ctx } = c;
  const x = 46;
  const y = 26;
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(x - 4, y - 4, 44, 28);
  ctx.fillStyle = "#3a332c";
  ctx.fillRect(x, y, 36, 20);
  for (let s = 0; s < 4; s++) {
    ctx.fillStyle = "#ece6da";
    ctx.fillRect(x, y + 2 + s * 5, 36, 2.5);
  }
}

function wallAlt(c: Cell, family: PlasterFamily): void {
  const { ctx, mctx, rng } = c;
  // Electric meter box with cables — untinted metal.
  const bx = rRange(rng, 20, 70);
  const by = rRange(rng, 50, 90);
  mctx.fillStyle = "#fff";
  mctx.fillRect(bx, by, 26, 30);
  ctx.fillStyle = "#8d9497";
  ctx.fillRect(bx, by, 26, 30);
  ctx.fillStyle = "#c9d3d6";
  ctx.fillRect(bx + 5, by + 6, 16, 10);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(bx, by + 28, 26, 2);
  ctx.strokeStyle = "#151515";
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(bx + 6 + k * 6, by);
    ctx.bezierCurveTo(bx + 6 + k * 6, by - 20, bx + 40 + k * 10, by - 30, c.w + 5, by - 40 - k * 6);
    ctx.stroke();
  }
  // Re-plastered patch.
  ctx.fillStyle = family === "A" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.18)";
  ctx.fillRect(rRange(rng, 10, 60), rRange(rng, 10, 40), rRange(rng, 20, 40), rRange(rng, 14, 30));
}

function peeledBrick(c: Cell): void {
  const { ctx, mctx, rng } = c;
  const path = new Path2D();
  const cx = rRange(rng, 40, 88);
  const cy = rRange(rng, 60, 110);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const r = rRange(rng, 18, 34);
    const px = cx + Math.cos(a) * r * 1.3;
    const py = cy + Math.sin(a) * r;
    if (k === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  path.closePath();
  mctx.fillStyle = "#fff";
  mctx.fill(path);
  ctx.save();
  ctx.clip(path);
  paintBricks(ctx, rng, 0, 0, c.w, c.h);
  ctx.restore();
  ctx.strokeStyle = "rgba(90,80,70,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke(path);
}

function paintBricks(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#8f877c";
  ctx.fillRect(x, y, w, h);
  const bh = 8;
  const bw = 22;
  for (let row = 0; row * bh < h; row++) {
    const off = row % 2 === 0 ? 0 : bw / 2;
    for (let bx = -bw; bx < w + bw; bx += bw) {
      const base = rPick(rng, ["#a8452c", "#b5553a", "#9a3f2a", "#b86a4a", "#8f3a26"]);
      ctx.fillStyle = base;
      ctx.fillRect(x + bx + off + 1, y + row * bh + 1, bw - 2, bh - 2);
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(x + bx + off + 1, y + row * bh + bh - 2.5, bw - 2, 1.5);
    }
  }
}

// ==================================================================== shops

function paintShop(c: Cell, kind: ShopKind): void {
  const { ctx, w, h } = c;
  if (kind === "shutter") {
    shutterMetal(c, 0, h);
    return;
  }
  const interiors: Record<Exclude<ShopKind, "shutter">, () => void> = {
    shutterHalf: () => {
      shopRoom(c, "#d8c9a8", "#ffe2a8");
      kiranaGoods(c);
      c.glowCopy(0.55);
      shutterMetal(c, 0, h * 0.56);
      c.ectx.fillStyle = "#000";
      c.ectx.fillRect(0, 0, w, h * 0.56);
    },
    kirana: () => {
      shopRoom(c, "#dcc9a0", "#ffe2a8");
      kiranaGoods(c);
      c.glowCopy(0.6);
      tubeLight(c);
    },
    sweets: () => {
      shopRoom(c, "#f3e2c0", "#ffe9b8");
      sweetsGoods(c);
      c.glowCopy(0.65);
      tubeLight(c);
    },
    mobile: () => {
      shopRoom(c, "#f4f6f8", "#ffffff");
      mobileGoods(c);
      c.glowCopy(0.8);
      tubeLight(c);
    },
    cloth: () => {
      shopRoom(c, "#e9d8bb", "#ffe6b8");
      clothGoods(c);
      c.glowCopy(0.6);
      tubeLight(c);
    },
    utensils: () => {
      shopRoom(c, "#cfd6da", "#f2f6ff");
      utensilGoods(c);
      c.glowCopy(0.6);
      tubeLight(c);
    },
    chai: () => {
      shopRoom(c, "#6a5238", "#ffc97a");
      chaiGoods(c);
      c.glowCopy(0.55);
    },
    medical: () => {
      shopRoom(c, "#f6f8f6", "#ffffff");
      medicalGoods(c);
      c.glowCopy(0.75);
      tubeLight(c);
    },
    flowers: () => {
      shopRoom(c, "#e8d7b0", "#ffe0a0");
      flowerGoods(c);
      c.glowCopy(0.55);
    },
    jewel: () => {
      shopRoom(c, "#6d1420", "#ffd9a0");
      jewelGoods(c);
      c.glowCopy(0.75);
    },
    tailor: () => {
      shopRoom(c, "#e2d3b8", "#fff0cc");
      tailorGoods(c);
      c.glowCopy(0.6);
      tubeLight(c);
    },
  };
  interiors[kind]();
  // Recess shadow at the top edge (the opening's lintel).
  vgrad(ctx, 0, 0, w, 16, "rgba(0,0,0,0.45)", "rgba(0,0,0,0)");
}

function shopRoom(c: Cell, wall: string, light: string): void {
  const { ctx, w, h } = c;
  vgrad(ctx, 0, 0, w, h, shade(wall, 1.05), shade(wall, 0.7));
  ctx.fillStyle = "rgba(60,45,30,0.55)";
  ctx.fillRect(0, h - 16, w, 16);
  radial(ctx, w / 2, 20, w * 0.6, light, 0.35);
}

function tubeLight(c: Cell): void {
  const { ctx, ectx, w } = c;
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(w * 0.3, 8, w * 0.4, 3);
  ectx.fillStyle = "#ffffff";
  ectx.fillRect(w * 0.3, 7, w * 0.4, 5);
}

function shelves(c: Cell, rows: number, top: number, bottom: number): number[] {
  const { ctx, w } = c;
  const ys: number[] = [];
  const step = (bottom - top) / rows;
  for (let r = 0; r < rows; r++) {
    const y = top + step * (r + 1);
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(6, y, w - 12, 3);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(6, y + 3, w - 12, 2);
    ys.push(y);
  }
  return ys;
}

const SATURATED = ["#e53935", "#fdd835", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00acc1", "#f06292", "#ffffff", "#6d4c41"];

function kiranaGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const ys = shelves(c, 3, 14, h * 0.7);
  let prev = 14;
  for (const y of ys) {
    for (let x = 8; x < w - 12; ) {
      const pw = rRange(rng, 6, 14);
      const ph = rRange(rng, 10, Math.min(24, y - prev - 2));
      ctx.fillStyle = rPick(rng, SATURATED);
      ctx.fillRect(x, y - ph, pw, ph);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x + 1, y - ph * 0.65, pw - 2, 2);
      x += pw + rRange(rng, 0.5, 2);
    }
    prev = y;
  }
  // Hanging strips of snack packets.
  for (const sx of [10, 22, w - 30, w - 18]) {
    for (let y = 16; y < h * 0.62; y += 9) {
      ctx.fillStyle = rPick(rng, SATURATED);
      ctx.fillRect(sx, y, 9, 8);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(sx + 1, y + 1, 3, 3);
    }
  }
  // Sacks of grain on the floor.
  for (let i = 0; i < 5; i++) {
    const sx = 30 + i * 42 + rRange(rng, -4, 4);
    ctx.fillStyle = "#b99a6b";
    roundRect(ctx, sx, h - 44, 34, 34, 10);
    ctx.fill();
    ctx.fillStyle = rPick(rng, ["#f5f0e1", "#e9c46a", "#d4a373", "#f4a261", "#8ab17d"]);
    ctx.beginPath();
    ctx.ellipse(sx + 17, h - 42, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sweetsGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const ys = shelves(c, 2, 14, h * 0.45);
  for (const y of ys) {
    for (let x = 10; x < w - 20; x += 22) {
      ctx.fillStyle = rPick(rng, ["#c62828", "#f9a825", "#ad1457", "#ffffff"]);
      ctx.fillRect(x, y - 16, 18, 16);
      ctx.fillStyle = "#f9d56b";
      ctx.fillRect(x, y - 10, 18, 2);
    }
  }
  // Glass counter with trays of mithai.
  const cy = h * 0.52;
  ctx.fillStyle = "#7a5a3a";
  ctx.fillRect(4, cy, w - 8, h - cy);
  ctx.fillStyle = "rgba(200,230,240,0.45)";
  ctx.fillRect(8, cy + 4, w - 16, h - cy - 20);
  const colors = ["#ff9f1c", "#ffd166", "#fff3e0", "#f28482", "#90be6d", "#a0522d", "#ffe8a3"];
  for (let row = 0; row < 3; row++) {
    const ty = cy + 12 + row * 18;
    for (let tx = 12; tx < w - 24; tx += 40) {
      ctx.fillStyle = "#c0c0c0";
      ctx.fillRect(tx, ty + 9, 36, 3);
      const col = rPick(rng, colors);
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = col;
        ctx.beginPath();
        if (rChance(rng, 0.5)) ctx.arc(tx + 4 + k * 6, ty + 6, 3, 0, Math.PI * 2);
        else {
          ctx.moveTo(tx + 4 + k * 6, ty + 2);
          ctx.lineTo(tx + 7 + k * 6, ty + 6);
          ctx.lineTo(tx + 4 + k * 6, ty + 10);
          ctx.lineTo(tx + 1 + k * 6, ty + 6);
        }
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(8, cy + 4, w - 16, 2);
}

function mobileGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  for (let y = 16; y < h * 0.55; y += 16) {
    for (let x = 8; x < w * 0.62; x += 14) {
      ctx.fillStyle = rPick(rng, ["#1565c0", "#e53935", "#212121", "#fdd835", "#00897b", "#ffffff", "#8e24aa"]);
      ctx.fillRect(x, y, 12, 14);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(x + 2, y + 2, 4, 5);
    }
  }
  // Big generic phone poster.
  const px = w * 0.68;
  ctx.fillStyle = "#101820";
  roundRect(ctx, px, 14, w * 0.26, h * 0.55, 6);
  ctx.fill();
  const g = ctx.createLinearGradient(px, 20, px + w * 0.26, h * 0.5);
  g.addColorStop(0, "#00c6ff");
  g.addColorStop(1, "#ff2e93");
  ctx.fillStyle = g;
  roundRect(ctx, px + 5, 20, w * 0.26 - 10, h * 0.55 - 12, 4);
  ctx.fill();
  ctx.fillStyle = "#6b7b8c";
  ctx.fillRect(4, h * 0.66, w - 8, h * 0.34);
  ctx.fillStyle = "rgba(210,235,250,0.5)";
  ctx.fillRect(8, h * 0.68, w - 16, h * 0.18);
}

function clothGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const colors = ["#c2185b", "#f57c00", "#7b1fa2", "#00897b", "#fbc02d", "#d32f2f", "#1976d2", "#388e3c", "#e91e63"];
  for (let x = 6; x < w - 10; x += rRange(rng, 13, 18)) {
    const col = rPick(rng, colors);
    const len = rRange(rng, h * 0.5, h * 0.85);
    ctx.fillStyle = col;
    ctx.fillRect(x, 12, 12, len);
    ctx.fillStyle = "#f2c94c";
    ctx.fillRect(x, 12 + len - 6, 12, 3);
    ctx.fillRect(x + 9, 12, 2, len);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 3, 12, 1.5, len);
  }
  for (let i = 0; i < 6; i++) {
    const sx = 20 + i * 38;
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = rPick(rng, colors);
      ctx.fillRect(sx, h - 18 - k * 6, 30, 5);
    }
  }
}

function utensilGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const ys = shelves(c, 3, 14, h * 0.8);
  for (const y of ys) {
    for (let x = 14; x < w - 14; x += rRange(rng, 20, 28)) {
      const r = rRange(rng, 7, 11);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r - 3, 1, x, y - r, r * 1.2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, "#c9d1d6");
      g.addColorStop(1, "#6f7a80");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y - r, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let x = 20; x < w - 20; x += 26) {
    ctx.strokeStyle = "#b8c2c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x, 34);
    ctx.stroke();
    ctx.fillStyle = "#dfe6ea";
    ctx.beginPath();
    ctx.ellipse(x, 36, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function chaiGoods(c: Cell): void {
  const { ctx, ectx, w, h } = c;
  // Menu board.
  ctx.fillStyle = "#1f2a24";
  ctx.fillRect(w * 0.08, 16, w * 0.4, 44);
  ctx.fillStyle = "#f7f3e3";
  ctx.font = `bold 14px ${DEVANAGARI_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("चाय ₹10", w * 0.11, 30);
  ctx.fillText("कॉफ़ी ₹20", w * 0.11, 48);
  // Counter with glasses and a big kettle on a stove.
  ctx.fillStyle = "#5b4128";
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = "#8a6a45";
  ctx.fillRect(0, h * 0.62, w, 5);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = "rgba(230,240,245,0.7)";
    ctx.fillRect(18 + i * 11, h * 0.62 - 12, 7, 12);
    ctx.fillStyle = "#c68b3e";
    ctx.fillRect(18 + i * 11, h * 0.62 - 8, 7, 8);
  }
  const kx = w * 0.72;
  const ky = h * 0.62;
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(kx - 26, ky - 6, 52, 6);
  const g = ctx.createLinearGradient(kx - 22, 0, kx + 22, 0);
  g.addColorStop(0, "#7d8589");
  g.addColorStop(0.4, "#eef2f4");
  g.addColorStop(1, "#6a7276");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(kx, ky - 26, 22, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(kx + 16, ky - 34, 18, 5);
  // Stove flame glow.
  ectx.fillStyle = "#ff8a2a";
  ectx.fillRect(kx - 20, ky - 7, 40, 5);
  radial(ectx, w / 2, 30, w * 0.5, "#ffc97a", 0.5);
}

function medicalGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const ys = shelves(c, 4, 12, h * 0.7);
  for (const y of ys) {
    for (let x = 8; x < w - 12; ) {
      const bw = rRange(rng, 7, 13);
      ctx.fillStyle = rPick(rng, ["#ffffff", "#e3f2fd", "#c8e6c9", "#bbdefb", "#fff9c4", "#ffccbc"]);
      ctx.fillRect(x, y - 13, bw, 13);
      ctx.fillStyle = rPick(rng, ["#1565c0", "#2e7d32", "#c62828"]);
      ctx.fillRect(x + 1, y - 9, bw - 2, 2);
      x += bw + 1;
    }
  }
  // Green cross sticker on the glass.
  const cx = w * 0.5;
  const cy = h * 0.82;
  ctx.fillStyle = "#1b9e4b";
  ctx.fillRect(cx - 5, cy - 14, 10, 28);
  ctx.fillRect(cx - 14, cy - 5, 28, 10);
  ctx.fillStyle = "rgba(200,230,240,0.35)";
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

function flowerGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  for (let x = 10; x < w - 6; x += 12) {
    const len = rRange(rng, h * 0.3, h * 0.7);
    for (let y = 10; y < 10 + len; y += 6) {
      ctx.fillStyle = rPick(rng, ["#ff8f00", "#ffb300", "#ff6f00", "#ffd54f"]);
      ctx.beginPath();
      ctx.arc(x + Math.sin(y * 0.3) * 1.5, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 5; i++) {
    const bx = 16 + i * 48;
    ctx.fillStyle = "#8d6e45";
    ctx.beginPath();
    ctx.ellipse(bx + 18, h - 18, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = rPick(rng, ["#e53935", "#ff4081", "#ffffff", "#ffb300"]);
      ctx.beginPath();
      ctx.arc(bx + 6 + rng() * 24, h - 24 + rng() * 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function jewelGoods(c: Cell): void {
  const { ctx, ectx, w, h, rng } = c;
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * (w - 24) / 4;
    const cw = (w - 24) / 4 - 8;
    ctx.fillStyle = "#3a0a12";
    ctx.fillRect(x, 18, cw, h * 0.5);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = "#f6c94e";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + cw / 2, 26 + k * 14, cw * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ectx.fillStyle = "#ffe7a0";
    ectx.fillRect(x + 2, 18, cw - 4, 3);
  }
  ctx.fillStyle = "#2b1a12";
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
  ctx.fillStyle = "rgba(220,240,255,0.35)";
  ctx.fillRect(4, h * 0.7, w - 8, h * 0.14);
  speckles(ctx, rng, 8, h * 0.72, w - 16, h * 0.1, 80, "#ffe082", 1, 2, 0.6, 1);
}

function tailorGoods(c: Cell): void {
  const { ctx, w, h, rng } = c;
  const ys = shelves(c, 2, 14, h * 0.55);
  for (const y of ys) {
    for (let x = 10; x < w * 0.6; x += 11) {
      ctx.fillStyle = rPick(rng, SATURATED);
      roundRect(ctx, x, y - 24, 9, 24, 3);
      ctx.fill();
    }
  }
  // Mannequin + sewing machine.
  const mx = w * 0.78;
  ctx.fillStyle = "#e0c9a6";
  ctx.beginPath();
  ctx.ellipse(mx, 30, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b71c1c";
  ctx.beginPath();
  ctx.moveTo(mx - 18, 44);
  ctx.lineTo(mx + 18, 44);
  ctx.lineTo(mx + 12, 100);
  ctx.lineTo(mx - 12, 100);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6d4c35";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(w * 0.2, h * 0.72 - 18, 36, 18);
  ctx.fillRect(w * 0.2 + 26, h * 0.72 - 28, 10, 12);
}

function shutterMetal(c: Cell, top: number, bottom: number): void {
  const { ctx, w, rng } = c;
  const base = rPick(rng, ["#8e979d", "#7d8a93", "#9aa0a0", "#6f8a9a"]);
  vgrad(ctx, 0, top, w, bottom - top, shade(base, 1.08), shade(base, 0.82));
  for (let y = top; y < bottom; y += 5) {
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, y, w, 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, y + 3, w, 1.2);
  }
  // Rust + grime.
  blotches(ctx, rng, 0, top, w, bottom - top, 10, "#7a4a2a", 6, 22, 0.25);
  for (let i = 0; i < 10; i++) {
    const sx = rng() * w;
    const g = ctx.createLinearGradient(0, bottom - 30, 0, bottom);
    g.addColorStop(0, "rgba(90,60,35,0)");
    g.addColorStop(1, "rgba(90,60,35,0.4)");
    ctx.fillStyle = g;
    ctx.fillRect(sx, bottom - 30, rRange(rng, 3, 10), 30);
  }
  ctx.fillStyle = "#3b3f42";
  ctx.fillRect(0, bottom - 6, w, 6);
  ctx.fillStyle = "#c8a24a";
  ctx.fillRect(w / 2 - 5, bottom - 14, 10, 7);
}

// ==================================================================== signs

function paintSign(c: Cell, def: ShopSignDef): void {
  const { ctx, ectx, w, h, rng } = c;
  // Board with bevel.
  vgrad(ctx, 0, 0, w, h, shade(def.bg, 1.08), shade(def.bg, 0.9));
  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, h - 4, w, 4);

  const hasIcon = def.icon !== "none";
  const iconW = hasIcon ? h * 0.8 : 0;
  const textCx = w / 2 + iconW / 2 - (hasIcon ? 4 : 0);
  const textW = w - 40 - iconW;
  const big = def.lead === "hindi" ? def.hindi : def.english;
  const small = def.lead === "hindi" ? def.english : def.hindi;
  const bigFamily = def.lead === "hindi" ? DEVANAGARI_FONT : DISPLAY_FONT;
  const smallFamily = def.lead === "hindi" ? DISPLAY_FONT : DEVANAGARI_FONT;
  const drawText = (target: CanvasRenderingContext2D, glow: boolean): void => {
    centeredText(target, big, textCx, h * 0.42, textW, {
      family: bigFamily,
      maxSize: def.lead === "hindi" ? h * 0.5 : h * 0.44,
      color: def.fg,
      stroke: glow ? undefined : shade(def.bg, 0.55),
      strokeWidth: 3,
    });
    centeredText(target, small, textCx, h * 0.78, textW * 0.9, {
      family: smallFamily,
      maxSize: h * 0.22,
      color: def.accent,
      weight: def.lead === "hindi" ? "bold" : "600",
    });
  };
  drawText(ctx, false);
  if (hasIcon) drawIcon(ctx, def.icon, 16 + iconW / 2, h / 2, iconW * 0.36, def.fg, def.accent);

  // Weathering: rust weeping from bolts, faded corner, dirt.
  for (const [bx, by] of [
    [14, 14],
    [w - 14, 14],
    [14, h - 14],
    [w - 14, h - 14],
  ]) {
    ctx.fillStyle = "#8a8a8a";
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, by, 0, by + 26);
    g.addColorStop(0, "rgba(120,60,20,0.35)");
    g.addColorStop(1, "rgba(120,60,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - 2, by, 4, 26);
  }
  blotches(ctx, rng, 0, 0, w, h, 6, "#000000", 20, 60, 0.08);
  blotches(ctx, rng, 0, 0, w, h, 4, "#ffffff", 20, 60, 0.06);

  // Night: backlit board + brighter lettering.
  c.glowCopy(0.42);
  drawText(ectx, true);
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: ShopSignDef["icon"],
  cx: number,
  cy: number,
  r: number,
  fg: string,
  accent: string
): void {
  ctx.save();
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  switch (icon) {
    case "cup":
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.7);
      ctx.lineTo(cx - r * 0.55, cy + r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.62, cy, r * 0.3, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.4 + k * r * 0.35, cy - r * 0.7);
        ctx.quadraticCurveTo(cx - r * 0.2 + k * r * 0.35, cy - r, cx - r * 0.4 + k * r * 0.35, cy - r * 1.25);
        ctx.stroke();
      }
      break;
    case "cross":
      ctx.fillRect(cx - r * 0.28, cy - r, r * 0.56, r * 2);
      ctx.fillRect(cx - r, cy - r * 0.28, r * 2, r * 0.56);
      break;
    case "leaf":
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.bezierCurveTo(cx + r * 1.1, cy - r * 0.4, cx + r * 0.6, cy + r * 0.8, cx, cy + r);
      ctx.bezierCurveTo(cx - r * 0.6, cy + r * 0.8, cx - r * 1.1, cy - r * 0.4, cx, cy - r);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.8);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    case "phone":
      roundRect(ctx, cx - r * 0.5, cy - r, r, r * 2, r * 0.18);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(cx - r * 0.38, cy - r * 0.8, r * 0.76, r * 1.4);
      break;
    case "gem":
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.3);
      ctx.lineTo(cx - r * 0.5, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.8);
      ctx.lineTo(cx + r, cy - r * 0.3);
      ctx.lineTo(cx, cy + r);
      ctx.closePath();
      ctx.fill();
      break;
    case "needle":
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy + r);
      ctx.lineTo(cx + r, cy - r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 1.4);
      ctx.stroke();
      break;
    case "pot":
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.1, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - r * 0.5, cy - r * 0.95, r, r * 0.4);
      break;
    case "book":
      ctx.fillRect(cx - r, cy - r * 0.7, r * 0.92, r * 1.4);
      ctx.fillRect(cx + r * 0.08, cy - r * 0.7, r * 0.92, r * 1.4);
      break;
    case "star":
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? r : r * 0.45;
        if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "none":
      break;
  }
  ctx.restore();
}

// ================================================================== awnings

function paintAwning(c: Cell, kind: AwningKind): void {
  const { ctx, w, h, rng } = c;
  const body = h - 14;
  const stripes: Partial<Record<AwningKind, [string, string]>> = {
    red: ["#d62828", "#fff4e0"],
    orange: ["#f77f00", "#fff1d6"],
    green: ["#2a9d4b", "#f6fff0"],
    blueYellow: ["#1d4fa8", "#ffd23f"],
    pink: ["#e0457b", "#fff0f5"],
  };
  const pair = stripes[kind];
  if (pair) {
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = (x / 16) % 2 === 0 ? pair[0] : pair[1];
      ctx.fillRect(x, 0, 16, h);
    }
  } else if (kind === "tarp") {
    ctx.fillStyle = "#1f5fc4";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = rgba("#9cc3ff", rRange(rng, 0.15, 0.35));
      ctx.lineWidth = rRange(rng, 1, 2.5);
      ctx.beginPath();
      ctx.moveTo(rng() * w, 0);
      ctx.lineTo(rng() * w, h);
      ctx.stroke();
    }
  } else {
    // Corrugated tin, rusty.
    for (let x = 0; x < w; x += 6) {
      ctx.fillStyle = "#9aa1a3";
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = "#6c7375";
      ctx.fillRect(x + 3, 0, 3, h);
    }
    blotches(ctx, rng, 0, 0, w, h, 12, "#8a4a1f", 6, 20, 0.45);
  }
  // Sun-bleach at the top, soot at the edge.
  vgrad(ctx, 0, 0, w, body, "rgba(255,255,255,0.18)", "rgba(0,0,0,0.18)");
  blotches(ctx, rng, 0, 0, w, h, 5, "#3a2a1a", 8, 24, 0.14);
  // Scalloped valance edge (cut out below the scallops).
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let x = 0; x < w; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x, h - 3);
    ctx.quadraticCurveTo(x + 8, h - 14, x + 16, h - 3);
    ctx.lineTo(x + 16, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ================================================================ overlays

function paintAc(c: Cell): void {
  const { ctx, w, h } = c;
  vgrad(ctx, 0, 0, w, h, "#f4f3ef", "#d6d4ce");
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  // Fan grille.
  const cx = w * 0.66;
  const cy = h / 2;
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.arc(cx, cy, h * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d9d9d9";
  ctx.lineWidth = 1.4;
  for (let r = 4; r < h * 0.38; r += 4) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let y = 8; y < h - 6; y += 4) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(8, y, w * 0.3, 1.5);
  }
  vgrad(ctx, 0, h - 10, w, 10, "rgba(120,90,60,0)", "rgba(120,90,60,0.35)");
}

function paintGrill(c: Cell, variant: number): void {
  const { ctx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#dcdcdc";
  ctx.fillStyle = "#dcdcdc";
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.lineWidth = 3;
  if (variant === 0) {
    for (let x = 18; x < w - 6; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 3);
      ctx.lineTo(x, h - 3);
      ctx.stroke();
    }
    for (let y = 30; y < h - 6; y += 32) {
      ctx.beginPath();
      ctx.moveTo(3, y);
      ctx.lineTo(w - 3, y);
      ctx.stroke();
    }
  } else {
    // Sunburst.
    const cx = w / 2;
    const cy = h - 6;
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI + (k / 12) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
      ctx.stroke();
    }
    for (const r of [26, 52, 80]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.stroke();
    }
  }
}

function paintRailing(c: Cell, variant: number): void {
  const { ctx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#dedede";
  ctx.fillRect(0, 0, w, 6);
  ctx.fillRect(0, h - 5, w, 5);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 5, w, 1.5);
  ctx.fillStyle = "#dedede";
  ctx.strokeStyle = "#dedede";
  if (variant === 0) {
    for (let x = 4; x < w; x += 12) ctx.fillRect(x, 6, 3, h - 11);
  } else if (variant === 1) {
    ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + 32, h - 5);
      ctx.moveTo(x + 32, 6);
      ctx.lineTo(x, h - 5);
      ctx.stroke();
      ctx.fillRect(x, 6, 3, h - 11);
    }
  } else {
    ctx.lineWidth = 2.5;
    for (let x = 16; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, h / 2, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(x + 15, 6, 3, h - 11);
    }
  }
}

function paintShutterPanel(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#e9e5de";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, 4, h);
  ctx.fillRect(w - 4, 0, 4, h);
  for (let y = 8; y < h - 6; y += 7) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(6, y, w - 12, 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(6, y + 2, w - 12, 1.5);
  }
}

function paintLaundry(c: Cell, variant: number): void {
  const { ctx, w, h, rng } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.quadraticCurveTo(w / 2, 9, w, 5);
  ctx.stroke();
  const colors = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#ffffff", "#8e24aa", "#fb8c00", "#f06292", "#26c6da"];
  let x = 4 + variant * 6;
  while (x < w - 20) {
    const kind = rInt(rng, 0, 3);
    const col = rPick(rng, colors);
    ctx.fillStyle = col;
    const y = 7;
    let cw = 0;
    if (kind === 0) {
      cw = 30; // shirt
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cw, y);
      ctx.lineTo(x + cw + 6, y + 12);
      ctx.lineTo(x + cw - 2, y + 16);
      ctx.lineTo(x + cw - 2, y + 44);
      ctx.lineTo(x + 2, y + 44);
      ctx.lineTo(x + 2, y + 16);
      ctx.lineTo(x - 6, y + 12);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 1) {
      cw = 22; // towel
      ctx.fillRect(x, y, cw, 38);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(x, y + 30, cw, 3);
    } else if (kind === 2) {
      cw = 44; // sari fold
      ctx.fillRect(x, y, cw, rRange(rng, 60, 84));
      ctx.fillStyle = "#f2c94c";
      ctx.fillRect(x, y + 50, cw, 5);
    } else {
      cw = 26; // trousers
      ctx.fillRect(x, y, cw, 12);
      ctx.fillRect(x, y + 12, 11, 44);
      ctx.fillRect(x + cw - 11, y + 12, 11, 44);
    }
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x + 3, y, 3, 40);
    x += cw + rRange(rng, 8, 16);
  }
}

function paintDanger(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c81e1e";
  ctx.fillRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(w * 0.52, 8);
  ctx.lineTo(w * 0.36, h * 0.46);
  ctx.lineTo(w * 0.5, h * 0.46);
  ctx.lineTo(w * 0.42, h * 0.72);
  ctx.lineTo(w * 0.66, h * 0.36);
  ctx.lineTo(w * 0.53, h * 0.36);
  ctx.closePath();
  ctx.fill();
  centeredText(ctx, "खतरा", w / 2, h * 0.84, w - 10, { family: DEVANAGARI_FONT, maxSize: 14, color: "#fff" });
}

function paintMilestone(c: Cell, hindi: string, english: string, km: string): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#f4f2ea";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f2b21b";
  ctx.fillRect(0, 0, w, h * 0.34);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, h * 0.34, w, 2);
  centeredText(ctx, hindi, w / 2, h * 0.47, w - 8, { family: DEVANAGARI_FONT, maxSize: 15, color: "#1a1a1a" });
  centeredText(ctx, english, w / 2, h * 0.64, w - 8, { family: BODY_FONT, maxSize: 11, color: "#1a1a1a" });
  centeredText(ctx, km, w / 2, h * 0.83, w - 8, { family: DISPLAY_FONT, maxSize: 18, color: "#1a1a1a" });
  vgrad(ctx, 0, h * 0.85, w, h * 0.15, "rgba(80,60,40,0)", "rgba(80,60,40,0.35)");
}

function paintPoster(c: Cell, top: string, bottom: string, bg: string, fg: string): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  centeredText(ctx, top, w / 2, h * 0.27, w - 8, { family: /[ऀ-ॿ]/.test(top) ? DEVANAGARI_FONT : DISPLAY_FONT, maxSize: 18, color: fg });
  ctx.fillStyle = rgba(fg, 0.5);
  for (let y = h * 0.45; y < h * 0.66; y += 5) ctx.fillRect(8, y, w - 16, 2);
  centeredText(ctx, bottom, w / 2, h * 0.8, w - 8, { family: /[ऀ-ॿ]/.test(bottom) ? DEVANAGARI_FONT : DISPLAY_FONT, maxSize: 13, color: fg });
  blotches(ctx, rng, 0, 0, w, h, 3, "#ffffff", 10, 26, 0.25);
  // Torn corner.
  ctx.fillStyle = "#d8d2c4";
  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.lineTo(w - rRange(rng, 8, 16), h);
  ctx.lineTo(w, h - rRange(rng, 8, 16));
  ctx.closePath();
  ctx.fill();
}

function paintWallAd(c: Cell, hindi: string, english: string, bg: string, fg: string, accent: string): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#e4ddcf";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  centeredText(ctx, hindi, w / 2, h * 0.42, w - 40, { family: DEVANAGARI_FONT, maxSize: 34, color: fg });
  centeredText(ctx, english, w / 2, h * 0.74, w - 40, { family: DISPLAY_FONT, maxSize: 20, color: accent });
  // Sun-faded, flaking paint.
  blotches(ctx, rng, 0, 0, w, h, 10, "#f2ede2", 10, 34, 0.35);
  speckles(ctx, rng, 0, 0, w, h, 160, "#e4ddcf", 1, 3, 0.4, 0.9);
}

function paintShrine(c: Cell): void {
  const { ctx, ectx, w, h } = c;
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(0, 0, w, h);
  // Arched niche.
  const path = new Path2D();
  path.moveTo(w * 0.22, h * 0.9);
  path.lineTo(w * 0.22, h * 0.42);
  path.arc(w / 2, h * 0.42, w * 0.28, Math.PI, 0);
  path.lineTo(w * 0.78, h * 0.9);
  path.closePath();
  ctx.fillStyle = "#c8421d";
  ctx.fill(path);
  ctx.strokeStyle = "#f1a31b";
  ctx.lineWidth = 5;
  ctx.stroke(path);
  // Marigold garland along the arch.
  for (let k = 0; k <= 14; k++) {
    const a = Math.PI + (k / 14) * Math.PI;
    ctx.fillStyle = k % 2 === 0 ? "#ff8f00" : "#ffca28";
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(a) * w * 0.33, h * 0.42 + Math.sin(a) * w * 0.33, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small saffron flag and a lamp.
  ctx.fillStyle = "#ff7a00";
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 4);
  ctx.lineTo(w * 0.66, 12);
  ctx.lineTo(w * 0.5, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(w * 0.5 - 1, 4, 2, 26);
  ctx.fillStyle = "#b5651d";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.84, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd54f";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.78, 3, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  radial(ectx, w / 2, h * 0.78, 22, "#ffb347", 1);
  ectx.fillStyle = "#fff2b0";
  ectx.beginPath();
  ectx.ellipse(w / 2, h * 0.78, 3, 6, 0, 0, Math.PI * 2);
  ectx.fill();
}

function paintTank(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#cfcfcf";
  ctx.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 10) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, y + 3, w, 2);
  }
}

function paintGarland(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.clearRect(0, 0, w, h);
  for (let x = 4; x < w; x += 7) {
    const y = h / 2 + Math.sin(x * 0.35) * 2;
    ctx.fillStyle = rPick(rng, ["#ff8f00", "#ffa000", "#ffb300", "#ff6f00", "#ffc107"]);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,50,0,0.35)";
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintToran(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.clearRect(0, 0, w, h);
  for (let x = 3; x < w; x += 6) {
    ctx.fillStyle = rPick(rng, ["#ff8f00", "#ffb300", "#ffca28"]);
    ctx.beginPath();
    ctx.arc(x, 7, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let x = 8; x < w; x += 16) {
    const len = (x / 16) % 2 === 0 ? h - 8 : h * 0.62;
    for (let y = 14; y < len; y += 8) {
      ctx.fillStyle = rPick(rng, ["#ff8f00", "#ffca28", "#ff6f00"]);
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mango leaf.
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.ellipse(x + 8, 17, 3, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBulbs(c: Cell, warm: boolean): void {
  const { ctx, ectx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(w, 8);
  ctx.stroke();
  const palette = warm ? ["#fff1c1", "#ffe08a", "#fff6d8"] : ["#ff3b3b", "#35d04a", "#2e8bff", "#ffd21f", "#ff4fc3", "#ff8a1f"];
  let k = 0;
  for (let x = 8; x < w; x += 16, k++) {
    const col = palette[k % palette.length];
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(x - 1, 8, 2, 5);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, 19, 4.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(x - 1.5, 17, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ectx.fillStyle = col;
    ectx.beginPath();
    ectx.ellipse(x, 19, 5.5, 7.5, 0, 0, Math.PI * 2);
    ectx.fill();
    ectx.fillStyle = "#ffffff";
    ectx.beginPath();
    ectx.arc(x, 19, 2.5, 0, Math.PI * 2);
    ectx.fill();
  }
}

function paintLantern(c: Cell, variant: number): void {
  const { ctx, ectx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(w / 2 - 1, 0, 2, 12);
  const cx = w / 2;
  const cy = h * 0.45;
  const body = new Path2D();
  if (variant === 0) {
    // Akash kandil star.
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? w * 0.46 : w * 0.24;
      if (k === 0) body.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else body.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    body.closePath();
  } else {
    body.moveTo(cx - w * 0.2, 14);
    body.lineTo(cx + w * 0.2, 14);
    body.lineTo(cx + w * 0.42, cy);
    body.lineTo(cx + w * 0.2, h * 0.72);
    body.lineTo(cx - w * 0.2, h * 0.72);
    body.lineTo(cx - w * 0.42, cy);
    body.closePath();
  }
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w * 0.5);
  g.addColorStop(0, variant === 0 ? "#fff176" : "#ffd180");
  g.addColorStop(1, variant === 0 ? "#e53935" : "#d81b60");
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.strokeStyle = "#ffd54f";
  ctx.lineWidth = 1.5;
  ctx.stroke(body);
  // Tassels.
  for (let k = -2; k <= 2; k++) {
    ctx.strokeStyle = k % 2 === 0 ? "#ffca28" : "#e53935";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + k * 5, h * 0.7);
    ctx.lineTo(cx + k * 6, h - 4);
    ctx.stroke();
  }
  const eg = ectx.createRadialGradient(cx, cy, 2, cx, cy, w * 0.5);
  eg.addColorStop(0, "#fff3c0");
  eg.addColorStop(1, variant === 0 ? "#ff5a2a" : "#ff4f8a");
  ectx.fillStyle = eg;
  ectx.fill(body);
}

function paintDiya(c: Cell): void {
  const { ctx, ectx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#b5541d";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.78, w * 0.42, h * 0.18, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#e07b2e";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.78, w * 0.42, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  const flame = new Path2D();
  flame.moveTo(w / 2, h * 0.18);
  flame.quadraticCurveTo(w * 0.72, h * 0.55, w / 2, h * 0.72);
  flame.quadraticCurveTo(w * 0.28, h * 0.55, w / 2, h * 0.18);
  ctx.fillStyle = "#ffe082";
  ctx.fill(flame);
  ectx.fillStyle = "#fff4c4";
  ectx.fill(flame);
  ectx.fillStyle = "#ff9a3c";
  ectx.beginPath();
  ectx.ellipse(w / 2, h * 0.78, w * 0.3, h * 0.07, 0, 0, Math.PI * 2);
  ectx.fill();
}

function paintWhite(c: Cell): void {
  c.ctx.fillStyle = "#ffffff";
  c.ctx.fillRect(0, 0, c.w, c.h);
}

function paintLamp(c: Cell): void {
  c.ctx.fillStyle = "#fff8e6";
  c.ctx.fillRect(0, 0, c.w, c.h);
  c.ectx.fillStyle = "#ffffff";
  c.ectx.fillRect(0, 0, c.w, c.h);
}

function paintWood(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#d9cbb8";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, y, w, 1.5);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = rgba("#6b5238", rRange(rng, 0.08, 0.2));
      ctx.fillRect(0, y + rRange(rng, 2, 14), w, 1);
    }
  }
}

function paintMetal(c: Cell): void {
  const { ctx, w, h, rng } = c;
  vgrad(ctx, 0, 0, w, h, "#e6e8ea", "#b9bec2");
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rgba("#ffffff", rRange(rng, 0.05, 0.2));
    ctx.fillRect(0, rng() * h, w, 1);
  }
  blotches(ctx, rng, 0, 0, w, h, 4, "#7a5a3a", 4, 12, 0.2);
}

function paintStone(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#e8ddd0";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) {
    const off = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = -64; x < w; x += 64) {
      ctx.fillStyle = rgba("#ffffff", rRange(rng, 0.05, 0.2));
      ctx.fillRect(x + off + 2, y + 2, 60, 28);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x + off, y, 64, 2);
      ctx.fillRect(x + off, y, 2, 32);
    }
  }
  speckles(ctx, rng, 0, 0, w, h, 300, "#7a6a58", 0.8, 1.8, 0.08, 0.2);
}

function paintLeaves(c: Cell): void {
  const { ctx, w, h, rng } = c;
  // Soft leaf clusters: gentle value range so tinted canopies read as
  // foliage (not camouflage) under the directional light.
  ctx.fillStyle = "#b9c4b2";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const l = rRange(rng, 0.78, 1.08);
    ctx.fillStyle = `rgb(${Math.round(215 * l)},${Math.round(232 * l)},${Math.round(205 * l)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rRange(rng, 2, 4.5), rRange(rng, 1.2, 2.4), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  speckles(ctx, rng, 0, 0, w, h, 160, "#4f5a48", 1, 2.5, 0.15, 0.35);
}

function paintWheel(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#bdbdbd";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * w * 0.38);
    ctx.stroke();
  }
  ctx.fillStyle = "#9e9e9e";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

function paintWheelSolid(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = "#161616";
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a9adb0";
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5d6165";
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function paintCorrugated(c: Cell): void {
  const { ctx, w, h, rng } = c;
  for (let x = 0; x < w; x += 8) {
    const g = ctx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, "#b8bcbf");
    g.addColorStop(0.5, "#f2f4f5");
    g.addColorStop(1, "#8f9497");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 8, h);
  }
  blotches(ctx, rng, 0, 0, w, h, 6, "#7a5030", 4, 14, 0.3);
}

function paintTarp(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#1c5cc2";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = rgba(rChance(rng, 0.5) ? "#7fb0ff" : "#0d3a80", rRange(rng, 0.2, 0.45));
    ctx.lineWidth = rRange(rng, 1, 3);
    ctx.beginPath();
    ctx.moveTo(rng() * w, rng() * h);
    ctx.quadraticCurveTo(rng() * w, rng() * h, rng() * w, rng() * h);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

function paintFabric(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 3) {
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(i, 0, 1, h);
    ctx.fillRect(0, i, w, 1);
  }
}

function paintProduce(c: Cell, veg: boolean): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#5a3d24";
  ctx.fillRect(0, 0, w, h);
  const colors = veg ? ["#43a047", "#2e7d32", "#c62828", "#7b1fa2", "#9ccc65", "#f9a825"] : ["#fb8c00", "#ef6c00", "#e53935", "#fdd835", "#ffb74d", "#8bc34a"];
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rRange(rng, 4, 7);
    ctx.fillStyle = rPick(rng, colors);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSacks(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#c2a878";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 2) {
    ctx.fillStyle = rgba("#6b5634", rRange(rng, 0.05, 0.18));
    ctx.fillRect(i, 0, 1, h);
    ctx.fillRect(0, i, w, 1);
  }
  ctx.strokeStyle = "rgba(80,60,30,0.6)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.15);
  ctx.lineTo(w, h * 0.15);
  ctx.stroke();
  ctx.setLineDash([]);
  centeredText(ctx, "चावल", w / 2, h * 0.55, w - 10, { family: DEVANAGARI_FONT, maxSize: 16, color: "rgba(160,30,20,0.7)" });
}

function paintTransformer(c: Cell): void {
  const { ctx, w, h } = c;
  ctx.fillStyle = "#d4d8d6";
  ctx.fillRect(0, 0, w, h);
  for (let x = 2; x < w; x += 8) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(x + 2, 0, 1.5, h);
  }
}

function paintConcrete(c: Cell): void {
  const { ctx, w, h, rng } = c;
  ctx.fillStyle = "#e0ddd6";
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, rng, 0, 0, w, h, 8, "#8a847a", 6, 18, 0.18);
  speckles(ctx, rng, 0, 0, w, h, 200, "#5f5a52", 0.8, 1.6, 0.08, 0.2);
}

// ============================================================ post-process

/** Bleed opaque colors into cut-out texels (prevents dark mip fringes). */
function dilate(data: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, passes: number): void {
  const filled = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[((y0 + y) * SIZE + x0 + x) * 4 + 3] > 0) filled[y * w + x] = 1;
    }
  }
  const next = new Uint8Array(w * h);
  for (let p = 0; p < passes; p++) {
    next.set(filled);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue;
        const i = ((y0 + y) * SIZE + x0 + x) * 4;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !filled[ny * w + nx]) continue;
          const j = ((y0 + ny) * SIZE + x0 + nx) * 4;
          data[i] = data[j];
          data[i + 1] = data[j + 1];
          data[i + 2] = data[j + 2];
          next[y * w + x] = 1;
          break;
        }
      }
    }
    filled.set(next);
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Copy each cell's border texels outward into the padding (mip safety). */
function extrude(data: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, amount: number): void {
  const copy = (sx: number, sy: number, dx: number, dy: number): void => {
    if (dx < 0 || dy < 0 || dx >= SIZE || dy >= SIZE) return;
    const s = (sy * SIZE + sx) * 4;
    const d = (dy * SIZE + dx) * 4;
    data[d] = data[s];
    data[d + 1] = data[s + 1];
    data[d + 2] = data[s + 2];
    data[d + 3] = data[s + 3];
  };
  for (let k = 1; k <= amount; k++) {
    for (let x = x0; x < x0 + w; x++) {
      copy(x, y0, x, y0 - k);
      copy(x, y0 + h - 1, x, y0 + h - 1 + k);
    }
  }
  for (let k = 1; k <= amount; k++) {
    for (let y = y0 - amount; y < y0 + h + amount; y++) {
      const sy = Math.min(Math.max(y, 0), SIZE - 1);
      copy(x0, sy, x0 - k, sy);
      copy(x0 + w - 1, sy, x0 + w - 1 + k, sy);
    }
  }
}
