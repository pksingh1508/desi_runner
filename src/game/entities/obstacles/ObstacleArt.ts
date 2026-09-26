import * as THREE from "three";
import type { UvRect } from "./ModelBuilder";

/**
 * One 1024² canvas atlas holding every painted surface of the street props:
 * truck art, shop boards, sarees, banners, stencils. Everything is drawn in
 * code at boot (no downloaded art, no real brands). Region aspect ratios
 * match the physical surfaces they are mapped onto.
 */

export const ATLAS_SIZE = 1024;

type Region = readonly [x: number, y: number, w: number, h: number];

export const ART_REGIONS = {
  signMithai: [0, 0, 256, 112],
  signPaan: [256, 0, 256, 112],
  chaiFront: [512, 0, 256, 128],
  phaatakDisc: [768, 0, 128, 128],
  sackPrint: [896, 0, 128, 80],
  chaiPrice: [896, 80, 128, 72],
  truckGate: [0, 128, 512, 288],
  chaiBoard: [512, 128, 384, 96],
  plate: [896, 152, 128, 32],
  hazard: [512, 224, 256, 32],
  chevron: [768, 224, 256, 32],
  police: [512, 256, 256, 64],
  autoRear: [768, 256, 256, 98],
  mela: [512, 320, 256, 104],
  diversion: [0, 416, 512, 108],
  truckCrown: [512, 436, 512, 128],
  swagat: [0, 564, 1024, 120],
  sareeA: [0, 688, 128, 208],
  sareeB: [128, 688, 128, 208],
  sareeC: [256, 688, 128, 208],
} as const satisfies Record<string, Region>;

export type ArtRegion = keyof typeof ART_REGIONS;

const LATIN = "'Arial Black', 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";
const LATIN_CONDENSED = "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
const DEVANAGARI =
  "'Kohinoor Devanagari', 'Noto Sans Devanagari', 'Nirmala UI', Mangal, 'Devanagari Sangam MN', 'Devanagari MT', sans-serif";

/** Inset (px) applied to UV rects so mip levels do not bleed neighbors. */
const UV_INSET = 3;

export function artUv(name: ArtRegion): UvRect {
  const [x, y, w, h] = ART_REGIONS[name];
  const s = ATLAS_SIZE;
  return {
    u0: (x + UV_INSET) / s,
    u1: (x + w - UV_INSET) / s,
    // CanvasTexture uses flipY: canvas top row = v 1.
    v0: 1 - (y + h - UV_INSET) / s,
    v1: 1 - (y + UV_INSET) / s,
  };
}

/** Builds the atlas texture (browser only — called from the obstacle kit). */
export function createObstacleAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) paintAtlas(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// ------------------------------------------------------------------ painting

type Ctx = CanvasRenderingContext2D;

function paintAtlas(ctx: Ctx): void {
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  inRegion(ctx, "truckGate", paintTruckGate);
  inRegion(ctx, "truckCrown", paintTruckCrown);
  inRegion(ctx, "swagat", paintSwagat);
  inRegion(ctx, "sareeA", (c, w, h) => paintSaree(c, w, h, "#c2185b", "#ffc107", "#ffe082"));
  inRegion(ctx, "sareeB", (c, w, h) => paintSaree(c, w, h, "#ff8f00", "#1b5e20", "#fff3e0"));
  inRegion(ctx, "sareeC", (c, w, h) => paintSaree(c, w, h, "#00897b", "#ec407a", "#fce4ec"));
  inRegion(ctx, "signMithai", paintSignMithai);
  inRegion(ctx, "signPaan", paintSignPaan);
  inRegion(ctx, "chaiBoard", paintChaiBoard);
  inRegion(ctx, "police", paintPolice);
  inRegion(ctx, "hazard", (c, w, h) => stripes(c, 0, 0, w, h, "#ffd000", "#151515", 18));
  inRegion(ctx, "plate", paintPlate);
  inRegion(ctx, "chevron", (c, w, h) => stripes(c, 0, 0, w, h, "#ff6d00", "#ffffff", 20));
  inRegion(ctx, "diversion", paintDiversion);
  inRegion(ctx, "mela", paintMela);
  inRegion(ctx, "autoRear", paintAutoRear);
  inRegion(ctx, "phaatakDisc", paintPhaatakDisc);
  inRegion(ctx, "sackPrint", paintSackPrint);
  inRegion(ctx, "chaiPrice", paintChaiPrice);
  inRegion(ctx, "chaiFront", paintChaiFront);
}

function inRegion(ctx: Ctx, name: ArtRegion, paint: (ctx: Ctx, w: number, h: number) => void): void {
  const [x, y, w, h] = ART_REGIONS[name];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  paint(ctx, w, h);
  ctx.restore();
}

// ------------------------------------------------------------------ helpers

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Sets the largest font (≤ size) that fits maxWidth. */
function fitFont(ctx: Ctx, text: string, family: string, weight: string, size: number, maxWidth: number): void {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 8 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

function outlinedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke: string,
  lineWidth: number
): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Diagonal hazard stripes. */
function stripes(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, band: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let i = -h; i < w + h; i += band * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + band, y + h);
    ctx.lineTo(x + i + band + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function dotRow(ctx: Ctx, x0: number, x1: number, y: number, step: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let x = x0; x <= x1; x += step) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lotus(ctx: Ctx, cx: number, cy: number, size: number, petal: string, inner: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  const petals = 7;
  for (let i = 0; i < petals; i++) {
    const a = ((i - (petals - 1) / 2) / (petals - 1)) * Math.PI * 0.95;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.32, -size * 0.55, 0, -size);
    ctx.quadraticCurveTo(-size * 0.32, -size * 0.55, 0, 0);
    ctx.fillStyle = petal;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.34, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.restore();
}

/** Stylized protective "nazar" eye (truck art). */
function nazarEye(ctx: Ctx, cx: number, cy: number, w: number): void {
  const h = w * 0.46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(0, -h, w / 2, 0);
  ctx.quadraticCurveTo(0, h, -w / 2, 0);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = w * 0.06;
  ctx.strokeStyle = "#111111";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = "#1565c0";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#050505";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-h * 0.1, -h * 0.12, h * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  // Kohl flick.
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2 + w * 0.14, -h * 0.28);
  ctx.lineWidth = w * 0.05;
  ctx.stroke();
  ctx.restore();
}

function flower(ctx: Ctx, cx: number, cy: number, r: number, petal: string, center: string): void {
  ctx.fillStyle = petal;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = center;
  ctx.fill();
}

function diya(ctx: Ctx, cx: number, cy: number, s: number): void {
  // Clay lamp bowl.
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.quadraticCurveTo(cx, cy + s * 0.9, cx + s, cy);
  ctx.quadraticCurveTo(cx + s * 1.1, cy - s * 0.1, cx + s * 1.25, cy - s * 0.25);
  ctx.lineTo(cx - s, cy);
  ctx.closePath();
  ctx.fillStyle = "#e65100";
  ctx.fill();
  ctx.strokeStyle = "#ffcc80";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Flame with glow.
  ctx.save();
  ctx.shadowColor = "#ffeb3b";
  ctx.shadowBlur = s * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 1.35);
  ctx.quadraticCurveTo(cx + s * 0.38, cy - s * 0.55, cx, cy - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.38, cy - s * 0.55, cx, cy - s * 1.35);
  ctx.fillStyle = "#ffd54f";
  ctx.fill();
  ctx.restore();
}

function star(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ regions

function paintTruckGate(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#ffd23f");
  bg.addColorStop(1, "#ffa726");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Layered festive border.
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#d81b60";
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#00897b";
  ctx.strokeRect(17, 17, w - 34, h - 34);
  dotRow(ctx, 30, w - 30, 26, 14, 3, "#ffffff");
  dotRow(ctx, 30, w - 30, h - 26, 14, 3, "#ffffff");

  // Corner lotuses.
  lotus(ctx, 62, 82, 34, "#ec407a", "#ffeb3b");
  lotus(ctx, w - 62, 82, 34, "#ec407a", "#ffeb3b");

  fitFont(ctx, "HORN", LATIN, "900", 92, w - 190);
  outlinedText(ctx, "HORN", w / 2, 78, "#d50000", "#1a1a1a", 9);

  // Middle row: eye · OK · eye.
  nazarEye(ctx, w / 2 - 128, 150, 84);
  nazarEye(ctx, w / 2 + 128, 150, 84);
  ctx.beginPath();
  ctx.arc(w / 2, 150, 40, 0, Math.PI * 2);
  ctx.fillStyle = "#2e7d32";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  fitFont(ctx, "OK", LATIN, "900", 40, 64);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("OK", w / 2, 152);

  fitFont(ctx, "PLEASE", LATIN, "900", 70, w - 90);
  outlinedText(ctx, "PLEASE", w / 2, 214, "#1565c0", "#101010", 8);

  // "Use dipper at night" plate.
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, 96, h - 58, w - 192, 28, 8);
  ctx.fill();
  fitFont(ctx, "USE DIPPER AT NIGHT", LATIN_CONDENSED, "700", 20, w - 220);
  ctx.fillStyle = "#ffe082";
  ctx.fillText("USE DIPPER AT NIGHT", w / 2, h - 43);
}

function paintTruckCrown(ctx: Ctx, w: number, h: number): void {
  // Sunburst behind the painted crown.
  ctx.fillStyle = "#0d47a1";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h);
  for (let i = 0; i < 18; i++) {
    const a0 = Math.PI + (i / 18) * Math.PI;
    const a1 = Math.PI + ((i + 0.5) / 18) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, w, a0, a1);
    ctx.closePath();
    ctx.fillStyle = "#1976d2";
    ctx.fill();
  }
  ctx.restore();
  // Bottom band.
  ctx.fillStyle = "#c62828";
  ctx.fillRect(0, h - 22, w, 22);
  dotRow(ctx, 10, w - 10, h - 11, 16, 4, "#ffeb3b");

  fitFont(ctx, "BURI NAZAR WALE", LATIN, "900", 30, w * 0.6);
  outlinedText(ctx, "BURI NAZAR WALE", w / 2, h * 0.5, "#ffeb3b", "#1a1a1a", 5);
  fitFont(ctx, "TERA MUH KALA", LATIN, "900", 22, w * 0.46);
  outlinedText(ctx, "TERA MUH KALA", w / 2, h * 0.72, "#ffffff", "#1a1a1a", 4);
  flower(ctx, 52, h * 0.6, 20, "#ff4081", "#ffeb3b");
  flower(ctx, w - 52, h * 0.6, 20, "#ff4081", "#ffeb3b");
  nazarEye(ctx, w / 2, h * 0.24, 54);
}

function paintSwagat(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55);
  bg.addColorStop(0, "#e53935");
  bg.addColorStop(1, "#8e0000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Gold zari borders with scallops.
  ctx.fillStyle = "#ffc107";
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h - 12, w, 12);
  ctx.fillStyle = "#ffb300";
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.arc(x + 16, 12, 12, 0, Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 16, h - 12, 12, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  dotRow(ctx, 8, w - 8, 6, 16, 2.5, "#fff8e1");
  dotRow(ctx, 8, w - 8, h - 6, 16, 2.5, "#fff8e1");

  // Diyas, flowers and a latin echo on both flanks.
  for (const s of [-1, 1]) {
    diya(ctx, w / 2 + s * (w / 2 - 70), h * 0.64, 24);
    flower(ctx, w / 2 + s * (w / 2 - 160), h * 0.5, 18, "#ffca28", "#d84315");
    fitFont(ctx, "SWAGAT", LATIN, "900", 26, 140);
    ctx.fillStyle = "#fff8e1";
    ctx.fillText("SWAGAT", w / 2 + s * 290, h * 0.53);
  }

  ctx.save();
  ctx.shadowColor = "rgba(255, 213, 79, 0.85)";
  ctx.shadowBlur = 16;
  fitFont(ctx, "स्वागत", DEVANAGARI, "800", Math.round(h * 0.78), w * 0.34);
  outlinedText(ctx, "स्वागत", w / 2, h * 0.5, "#ffe082", "#4a0000", 9);
  ctx.restore();
}

function paintSaree(ctx: Ctx, w: number, h: number, body: string, border: string, motif: string): void {
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, w, h);
  // Soft vertical fold shading.
  const folds = ctx.createLinearGradient(0, 0, w, 0);
  folds.addColorStop(0, "rgba(0,0,0,0.12)");
  folds.addColorStop(0.3, "rgba(255,255,255,0.08)");
  folds.addColorStop(0.55, "rgba(0,0,0,0.1)");
  folds.addColorStop(0.8, "rgba(255,255,255,0.07)");
  folds.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = folds;
  ctx.fillRect(0, 0, w, h);

  const edge = Math.round(w * 0.12);
  const palluH = Math.round(h * 0.24);

  // Buttis (small motifs) on the body, staggered rows.
  ctx.fillStyle = motif;
  let row = 0;
  for (let y = 14; y < h - palluH - 6; y += 20) {
    const offset = row % 2 === 0 ? 0 : 10;
    for (let x = edge + 8 + offset; x < w - edge - 4; x += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    row++;
  }

  // Zari borders on both edges.
  for (const x of [0, w - edge]) {
    ctx.fillStyle = border;
    ctx.fillRect(x, 0, edge, h);
    ctx.fillStyle = motif;
    for (let y = 4; y < h; y += 10) {
      ctx.beginPath();
      ctx.moveTo(x + edge / 2, y);
      ctx.lineTo(x + edge - 2, y + 5);
      ctx.lineTo(x + edge / 2, y + 10);
      ctx.lineTo(x + 2, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Pallu: rich bands at the hanging end.
  const pallu = h - palluH;
  ctx.fillStyle = border;
  ctx.fillRect(0, pallu, w, palluH);
  ctx.fillStyle = body;
  ctx.fillRect(0, pallu + palluH * 0.18, w, palluH * 0.1);
  ctx.fillRect(0, pallu + palluH * 0.74, w, palluH * 0.08);
  ctx.fillStyle = motif;
  for (let x = 8; x < w; x += 18) {
    // Mango (paisley) drops.
    ctx.beginPath();
    ctx.ellipse(x + 4, pallu + palluH * 0.5, 5, 9, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, h - 5, w, 5);
}

function paintSignMithai(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#fff176");
  bg.addColorStop(1, "#fdd835");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#c62828";
  ctx.strokeRect(4, 4, w - 8, h - 8);
  fitFont(ctx, "मिठाई", DEVANAGARI, "800", 56, w - 100);
  outlinedText(ctx, "मिठाई", w / 2, h * 0.4, "#c62828", "#fff8e1", 4);
  fitFont(ctx, "SHARMA SWEETS", LATIN, "900", 22, w - 40);
  ctx.fillStyle = "#1b5e20";
  ctx.fillText("SHARMA SWEETS", w / 2, h * 0.8);
  // Jalebi swirls.
  for (const cx of [30, w - 30]) {
    ctx.beginPath();
    for (let t = 0; t < Math.PI * 5; t += 0.2) {
      const r = 2 + t * 1.5;
      const x = cx + Math.cos(t) * r;
      const y = h * 0.4 + Math.sin(t) * r;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ef6c00";
    ctx.stroke();
  }
}

function paintSignPaan(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#1b5e20";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(6, 6, w - 12, h - 12);
  // Betel leaves.
  for (const [cx, flip] of [[36, 1], [w - 36, -1]] as const) {
    ctx.save();
    ctx.translate(cx, h * 0.46);
    ctx.scale(flip, 1);
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.bezierCurveTo(-30, 4, -18, -26, 0, -12);
    ctx.bezierCurveTo(18, -26, 30, 4, 0, 26);
    ctx.fillStyle = "#7cb342";
    ctx.fill();
    ctx.strokeStyle = "#c5e1a5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(0, -8);
    ctx.stroke();
    ctx.restore();
  }
  fitFont(ctx, "पान", DEVANAGARI, "800", 58, w - 110);
  outlinedText(ctx, "पान", w / 2, h * 0.4, "#ffffff", "#0b3d0f", 5);
  fitFont(ctx, "PAAN BHANDAR", LATIN, "900", 22, w - 40);
  ctx.fillStyle = "#ffeb3b";
  ctx.fillText("PAAN BHANDAR", w / 2, h * 0.8);
}

function paintChaiBoard(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#e53935");
  bg.addColorStop(1, "#b71c1c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(5, 5, w - 10, h - 10);
  // Cutting-chai glass icon.
  ctx.save();
  ctx.translate(46, h / 2 + 10);
  ctx.beginPath();
  ctx.moveTo(-17, -24);
  ctx.lineTo(17, -24);
  ctx.lineTo(12, 22);
  ctx.lineTo(-12, 22);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.fillStyle = "#a1580f";
  ctx.fillRect(-14, -10, 28, 30);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  for (const dx of [-8, 2, 12]) {
    ctx.beginPath();
    ctx.moveTo(dx, -28);
    ctx.bezierCurveTo(dx - 6, -34, dx + 6, -38, dx, -44);
    ctx.stroke();
  }
  ctx.restore();

  fitFont(ctx, "CHAI", LATIN, "900", 70, 150);
  outlinedText(ctx, "CHAI", 172, h / 2 + 3, "#ffffff", "#5d0000", 6);
  fitFont(ctx, "चाय", DEVANAGARI, "800", 62, 110);
  outlinedText(ctx, "चाय", 312, h / 2 + 2, "#ffeb3b", "#5d0000", 5);
}

function paintPolice(ctx: Ctx, w: number, h: number): void {
  stripes(ctx, 0, 0, w, h, "#ffd000", "#141414", 16);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, w / 2 - 74, 9, 148, h - 18, 8);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0d47a1";
  ctx.stroke();
  fitFont(ctx, "POLICE", LATIN, "900", 32, 130);
  ctx.fillStyle = "#0d47a1";
  ctx.fillText("POLICE", w / 2, h / 2 + 1);
}

function paintPlate(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#ffd600";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111111";
  ctx.strokeRect(2, 2, w - 4, h - 4);
  fitFont(ctx, "DR 26 RN 07", LATIN_CONDENSED, "800", 22, w - 12);
  ctx.fillStyle = "#111111";
  ctx.fillText("DR 26 RN 07", w / 2, h / 2 + 1);
}

function paintDiversion(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#ffd600";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#111111";
  ctx.strokeRect(5, 5, w - 10, h - 10);
  const textW = w - 150;
  fitFont(ctx, "DIVERSION", LATIN, "900", 50, textW);
  ctx.fillStyle = "#111111";
  ctx.fillText("DIVERSION", 40 + textW / 2, 38);
  fitFont(ctx, "मार्ग परिवर्तन", DEVANAGARI, "700", 32, textW);
  ctx.fillText("मार्ग परिवर्तन", 40 + textW / 2, 80);
  // Detour arrow.
  ctx.save();
  ctx.translate(w - 62, h / 2 + 2);
  ctx.scale(1.5, 1.5);
  ctx.beginPath();
  ctx.moveTo(-14, 22);
  ctx.lineTo(-14, -2);
  ctx.quadraticCurveTo(-14, -12, -4, -12);
  ctx.lineTo(4, -12);
  ctx.lineTo(4, -24);
  ctx.lineTo(22, -6);
  ctx.lineTo(4, 12);
  ctx.lineTo(4, 0);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-2, 22);
  ctx.closePath();
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.restore();
}

function paintMela(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#c2185b");
  bg.addColorStop(1, "#880e4f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffca28";
  ctx.fillRect(0, 0, w, 7);
  ctx.fillRect(0, h - 7, w, 7);
  dotRow(ctx, 8, w - 8, 14, 16, 2.5, "#ffe082");
  dotRow(ctx, 8, w - 8, h - 14, 16, 2.5, "#ffe082");
  fitFont(ctx, "मेला", DEVANAGARI, "800", 54, w - 90);
  outlinedText(ctx, "मेला", w / 2, h * 0.4, "#ffeb3b", "#3b0020", 6);
  fitFont(ctx, "AAJ MELA HAI", LATIN, "900", 22, w - 60);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("AAJ MELA HAI", w / 2, h * 0.76);
  ctx.fillStyle = "#ffeb3b";
  star(ctx, 26, h * 0.42, 12);
  star(ctx, w - 26, h * 0.42, 12);
}

function paintAutoRear(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffd600";
  roundRect(ctx, 6, 6, w - 12, h - 12, 12);
  ctx.stroke();
  fitFont(ctx, "MAA KA", LATIN, "900", 26, w - 90);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("MAA KA", w / 2, h * 0.33);
  fitFont(ctx, "ASHIRWAD", LATIN, "900", 32, w - 80);
  ctx.fillStyle = "#ffd600";
  ctx.fillText("ASHIRWAD", w / 2, h * 0.66);
  for (const cx of [28, w - 28]) {
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.66);
    ctx.bezierCurveTo(cx - 16, h * 0.5, cx - 8, h * 0.34, cx, h * 0.45);
    ctx.bezierCurveTo(cx + 8, h * 0.34, cx + 16, h * 0.5, cx, h * 0.66);
    ctx.fill();
  }
}

function paintPhaatakDisc(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = "#d50000";
  ctx.fill();
  fitFont(ctx, "STOP", LATIN, "900", 34, w - 36);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("STOP", w / 2, h / 2 - 12);
  fitFont(ctx, "रुको", DEVANAGARI, "800", 30, w - 50);
  ctx.fillText("रुको", w / 2, h / 2 + 22);
}

function paintSackPrint(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#c9a266";
  ctx.fillRect(0, 0, w, h);
  // Jute weave.
  ctx.strokeStyle = "rgba(90,60,20,0.25)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  fitFont(ctx, "GEHUN", LATIN, "900", 30, w - 20);
  ctx.fillStyle = "rgba(183,28,28,0.9)";
  ctx.fillText("GEHUN", w / 2, h * 0.36);
  fitFont(ctx, "50 KG", LATIN_CONDENSED, "800", 22, w - 30);
  ctx.fillStyle = "rgba(13,71,161,0.85)";
  ctx.fillText("50 KG", w / 2, h * 0.72);
}

function paintChaiPrice(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#263238";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#8d6e63";
  ctx.strokeRect(2, 2, w - 4, h - 4);
  fitFont(ctx, "CUTTING", LATIN_CONDENSED, "800", 22, w - 20);
  ctx.fillStyle = "#eceff1";
  ctx.fillText("CUTTING", w / 2, h * 0.3);
  fitFont(ctx, "₹10", LATIN, "900", 28, w - 30);
  ctx.fillStyle = "#ffee58";
  ctx.fillText("₹10", w / 2, h * 0.68);
}

function paintChaiFront(ctx: Ctx, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#29b6f6");
  bg.addColorStop(1, "#0277bd");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffeb3b";
  ctx.fillRect(0, 10, w, 8);
  ctx.fillRect(0, h - 18, w, 8);
  fitFont(ctx, "SPECIAL", LATIN, "900", 30, w - 40);
  outlinedText(ctx, "SPECIAL", w / 2, 44, "#ffffff", "#01579b", 5);
  fitFont(ctx, "स्पेशल चाय", DEVANAGARI, "800", 34, w - 40);
  outlinedText(ctx, "स्पेशल चाय", w / 2, 84, "#ffeb3b", "#01579b", 5);
}
