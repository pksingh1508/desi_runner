import type { ModelBuilder, Vec3 } from "../ModelBuilder";

/** Shared street-prop palette (hex, sRGB). */
export const PAL = {
  bamboo: 0xcfa35a,
  bambooNode: 0x94702f,
  rope: 0x8d6e3f,
  tyre: 0x1b1b1e,
  rim: 0xc5c9d0,
  chrome: 0xdfe3e8,
  steelDark: 0x2b2f37,
  skin: 0x8d5a3b,
  skinShade: 0x6f4329,
  hairBlack: 0x1a1412,
  marigoldOrange: 0xff8a00,
  marigoldYellow: 0xffc300,
  leaf: 0x2e7d32,
  leafLight: 0x4caf50,
  jute: 0xc49a5a,
  juteDark: 0xa57c40,
  wood: 0x8b5a2b,
  woodLight: 0xb07a45,
  woodDark: 0x5e3b1c,
  white: 0xf4f1ea,
  black: 0x141414,
  reflectorRed: 0xff2a1a,
  reflectorAmber: 0xffa000,
  reflectorWhite: 0xfff3c4,
  lampWarm: 0xffd27a,
} as const;

type Axis = "x" | "z";

/**
 * Spoked cycle / cart wheel centered at c. axis "z": disc faces ±Z and rolls
 * along X; axis "x": disc faces ±X and rolls along Z.
 */
export function spokedWheel(
  b: ModelBuilder,
  c: Vec3,
  radius: number,
  axis: Axis,
  spokes = 6,
  tyreTube = 0.034
): void {
  const rot: Vec3 = axis === "z" ? [0, 0, 0] : [0, Math.PI / 2, 0];
  b.torus("paint", PAL.tyre, radius - tyreTube, tyreTube, { p: c, r: rot }, 5, 16, Math.PI * 2, { noAo: true });
  const rimR = radius - tyreTube * 2.1;
  b.torus("metal", PAL.rim, rimR, tyreTube * 0.42, { p: c, r: rot }, 3, 14, Math.PI * 2, { noAo: true });
  const hubRot: Vec3 = axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
  b.cyl("metal", PAL.chrome, 0.045, 0.045, 0.09, { p: c, r: hubRot }, 6, { noAo: true });
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    const dx = Math.cos(a) * rimR;
    const dy = Math.sin(a) * rimR;
    const end: Vec3 = axis === "z" ? [c[0] + dx, c[1] + dy, c[2]] : [c[0], c[1] + dy, c[2] + dx];
    b.rod("metal", PAL.rim, c, end, 0.007, 3, { noAo: true });
  }
}

/** Solid rubber wheel (vehicles): tyre cylinder + colored hub cap. */
export function solidWheel(
  b: ModelBuilder,
  c: Vec3,
  radius: number,
  width: number,
  axis: Axis,
  hubColor: number,
  outward: 1 | -1
): void {
  const rot: Vec3 = axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  b.cyl("paint", PAL.tyre, radius, radius, width, { p: c, r: rot }, 16, { noAo: true });
  // Tread shoulder ring on the visible face.
  const face = width / 2 + 0.004;
  const faceP: Vec3 = axis === "x" ? [c[0] + face * outward, c[1], c[2]] : [c[0], c[1], c[2] + face * outward];
  const faceRot: Vec3 = axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0];
  b.torus("paint", 0x2a2a2e, radius * 0.82, radius * 0.08, { p: faceP, r: faceRot }, 4, 16, Math.PI * 2, { noAo: true });
  b.cyl("metal", hubColor, radius * 0.5, radius * 0.56, 0.03, { p: faceP, r: rot }, 12, { noAo: true });
  b.cyl("metal", PAL.chrome, radius * 0.16, radius * 0.16, 0.05, { p: faceP, r: rot }, 8, { noAo: true });
}

/** Knotted bamboo pole from y0 to y1. */
export function bambooPole(b: ModelBuilder, x: number, z: number, y0: number, y1: number, r = 0.05): void {
  b.cyl("paint", PAL.bamboo, r * 0.92, r, y1 - y0, { p: [x, (y0 + y1) / 2, z] }, 8);
  for (let y = y0 + 0.5; y < y1 - 0.12; y += 0.58) {
    b.cyl("paint", PAL.bambooNode, r * 1.14, r * 1.14, 0.035, { p: [x, y, z] }, 8);
  }
  b.cyl("paint", PAL.bambooNode, r * 0.95, r * 0.95, 0.02, { p: [x, y1, z] }, 8);
}

/** Rope lashing (a few wraps) around a pole joint. */
export function lashing(b: ModelBuilder, p: Vec3, r: number): void {
  for (let i = -1; i <= 1; i++) {
    b.torus("paint", PAL.rope, r * 1.25, r * 0.28, { p: [p[0], p[1] + i * r * 0.55, p[2]], r: [Math.PI / 2, 0, 0] }, 4, 10, Math.PI * 2, { noAo: true });
  }
}

/** Sagging rope/string through a quadratic dip. */
export function rope(b: ModelBuilder, a: Vec3, c: Vec3, sag: number, radius: number, color: number = PAL.rope): void {
  const mid: Vec3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag, (a[2] + c[2]) / 2];
  b.tube("paint", color, [a, mid, c], radius, 12, 4, { noAo: true });
}

/** Point on a sagging string (parabolic approx) at t ∈ [0,1]. */
export function sagPoint(a: Vec3, c: Vec3, sag: number, t: number): Vec3 {
  const dip = 4 * sag * t * (1 - t);
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - dip, a[2] + (c[2] - a[2]) * t];
}

/** Marigold garland draped along a sagging curve. */
export function marigoldGarland(b: ModelBuilder, a: Vec3, c: Vec3, sag: number, count: number, bead = 0.05): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = sagPoint(a, c, sag, t);
    const color = i % 3 === 1 ? PAL.marigoldYellow : PAL.marigoldOrange;
    b.ico("paint", color, bead, { p, r: [i * 0.9, i * 0.4, 0] }, 0, { noAo: true });
  }
}

/** Small glowing bulb string (festive lights) along a sagging curve. */
export function bulbString(
  b: ModelBuilder,
  a: Vec3,
  c: Vec3,
  sag: number,
  count: number,
  colors: readonly number[],
  bulb = 0.035
): void {
  rope(b, a, c, sag, 0.006, 0x222222);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = sagPoint(a, c, sag, t);
    b.ico("glow", colors[i % colors.length], bulb, { p: [p[0], p[1] - bulb, p[2]] }, 0, { noAo: true });
  }
}

/** Stylized head with hair cap, ears and optional mustache. Returns top y. */
export function head(
  b: ModelBuilder,
  c: Vec3,
  r: number,
  faceDir: Axis,
  faceSign: 1 | -1,
  mustache = true
): void {
  b.sphere("paint", PAL.skin, r, { p: c, s: [1, 1.08, 1] }, 12, 9);
  // Hair cap (upper-back hemisphere).
  const back: Vec3 = faceDir === "x" ? [c[0] - faceSign * r * 0.12, c[1] + r * 0.18, c[2]] : [c[0], c[1] + r * 0.18, c[2] - faceSign * r * 0.12];
  b.sphere("paint", PAL.hairBlack, r * 1.04, { p: back, s: [1, 0.86, 1] }, 12, 8);
  // Nose + mustache on the face side.
  const f = (d: number, y: number, side = 0): Vec3 =>
    faceDir === "x"
      ? [c[0] + faceSign * d, c[1] + y, c[2] + side]
      : [c[0] + side, c[1] + y, c[2] + faceSign * d];
  b.sphere("paint", PAL.skinShade, r * 0.18, { p: f(r * 0.98, -r * 0.05) }, 6, 4);
  if (mustache) {
    const rot: Vec3 = faceDir === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0];
    b.box("paint", PAL.hairBlack, [r * 0.9, r * 0.16, r * 0.14], { p: f(r * 0.9, -r * 0.3), r: rot });
  }
  // Eyes.
  for (const s of [-1, 1]) {
    b.sphere("paint", 0x111111, r * 0.09, { p: f(r * 0.88, r * 0.15, s * r * 0.34) }, 5, 4);
  }
}
