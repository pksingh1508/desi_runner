import type { Rng } from "./random";
import { rRange } from "./random";

/**
 * Canvas helpers for boot-time procedural textures. Browser-only: callers
 * run inside the Game (client) after the renderer exists.
 */

/** Devanagari-capable stack (Windows, macOS/iOS, Android, legacy Windows). */
export const DEVANAGARI_FONT =
  '"Nirmala UI","Kohinoor Devanagari","Noto Sans Devanagari","Mangal","Devanagari Sangam MN","Devanagari MT",sans-serif';
/** Chunky painted-signboard Latin face. */
export const DISPLAY_FONT = '"Arial Black","Helvetica Neue",Impact,"Arial",sans-serif';
export const BODY_FONT = '"Helvetica Neue","Arial",sans-serif';

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function makeCanvas(width: number, height: number): Canvas2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("2D canvas unavailable");
  return { canvas, ctx };
}

/** #rrggbb / 0xRRGGBB → rgba() string. */
export function rgba(color: string | number, alpha = 1): string {
  const hex = typeof color === "number" ? color : parseInt(color.replace("#", ""), 16);
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;
}

/** Scale a color's brightness (factor < 1 darkens, > 1 lightens). */
export function shade(color: string | number, factor: number): string {
  const hex = typeof color === "number" ? color : parseInt(color.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Scattered dots (aggregate, dust, grime). */
export function speckles(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: string | number,
  minSize: number,
  maxSize: number,
  minAlpha: number,
  maxAlpha: number
): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rgba(color, rRange(rng, minAlpha, maxAlpha));
    const s = rRange(rng, minSize, maxSize);
    ctx.fillRect(x + rng() * w, y + rng() * h, s, s);
  }
}

/** Soft radial blotches (weathering, stains, tonal variation). */
export function blotches(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: string | number,
  minRadius: number,
  maxRadius: number,
  alpha: number
): void {
  for (let i = 0; i < count; i++) {
    const cx = x + rng() * w;
    const cy = y + rng() * h;
    const r = rRange(rng, minRadius, maxRadius);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(color, alpha * rRange(rng, 0.5, 1)));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

/** Vertical grime streaks running down from `y` (rain wash, damp). */
export function streaks(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: string | number,
  alpha: number
): void {
  for (let i = 0; i < count; i++) {
    const sx = x + rng() * w;
    const sw = rRange(rng, 1.5, 6);
    const sh = rRange(rng, h * 0.25, h);
    const g = ctx.createLinearGradient(0, y, 0, y + sh);
    g.addColorStop(0, rgba(color, alpha * rRange(rng, 0.6, 1)));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx, y, sw, sh);
  }
}

/** Jagged hairline crack. */
export function crack(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  length: number,
  color: string | number,
  width: number,
  alpha: number
): void {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let cx = x;
  let cy = y;
  let angle = rng() * Math.PI * 2;
  const steps = Math.max(3, Math.round(length / 6));
  for (let i = 0; i < steps; i++) {
    angle += rRange(rng, -0.9, 0.9);
    cx += Math.cos(angle) * (length / steps);
    cy += Math.sin(angle) * (length / steps);
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
}

/**
 * Sets the largest font (≤ maxSize) that fits `text` into maxWidth and
 * returns the chosen pixel size.
 */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  family: string,
  weight = "bold"
): number {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth && measured > 0) {
    size = Math.max(6, Math.floor(size * (maxWidth / measured)));
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export interface TextStyle {
  family: string;
  maxSize: number;
  color: string;
  weight?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: string;
  shadowBlur?: number;
}

/** Centered, width-fitted text with optional outline/shadow. */
export function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  style: TextStyle
): void {
  fitFont(ctx, text, maxWidth, style.maxSize, style.family, style.weight ?? "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style.shadow) {
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = style.shadowBlur ?? 4;
  }
  if (style.stroke) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth ?? 3;
    ctx.strokeText(text, cx, cy);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

/**
 * Adds per-pixel luminance grain to an RGBA buffer region (alpha > 0 only).
 * Cheap micro-texture that keeps flat paint from looking plastic. Uses an
 * integer hash of the pixel position (no RNG call per pixel).
 */
export function grainImage(
  data: Uint8ClampedArray,
  width: number,
  seed: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  amount: number
): void {
  const scale = amount / 255;
  for (let y = y0; y < y0 + h; y++) {
    let i = (y * width + x0) * 4;
    const hy = Math.imul(y ^ seed, 0x27d4eb2d);
    for (let x = x0; x < x0 + w; x++, i += 4) {
      if (data[i + 3] === 0) continue;
      let hsh = Math.imul(x, 0x165667b1) ^ hy;
      hsh ^= hsh >>> 15;
      hsh = Math.imul(hsh, 0x85ebca6b);
      hsh ^= hsh >>> 13;
      const n = ((hsh & 255) - 127.5) * scale;
      data[i] = data[i] + n;
      data[i + 1] = data[i + 1] + n;
      data[i + 2] = data[i + 2] + n;
    }
  }
}
