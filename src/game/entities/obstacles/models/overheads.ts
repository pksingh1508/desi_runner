import * as THREE from "three";
import type { ModelBuilder, UvRect, Vec3 } from "../ModelBuilder";
import type { VariantSpec } from "../types";
import { artUv } from "../ObstacleArt";
import { PAL, bambooPole, bulbString, lashing, marigoldGarland, rope, sagPoint } from "./common";

/**
 * SLIDE-ONLY obstacles. Everything dangerous hangs down to exactly the
 * 1.45 m slide line; frames above make the jump-over impossible by eye as
 * well as by collider. Nothing inside |x| < 3.5 rises above 4.1 m (camera).
 */

const DANGER_EDGE_Y = 1.47;
const FESTIVE_BULBS = [0xffd54f, 0xff5252, 0x69f0ae, 0x40c4ff, 0xff80ab] as const;

/**
 * Hanging fabric panel: a subdivided plane with waves / bulge so cloth reads
 * as soft 3D instead of a flat card. top/bottom in model space.
 */
function drape(
  width: number,
  top: number,
  bottom: number,
  wave: number,
  sagTop = 0,
  seed = 1
): THREE.BufferGeometry {
  const h = top - bottom;
  const geo = new THREE.PlaneGeometry(width, h, 8, 10);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (y + h / 2) / h; // 0 bottom → 1 top
    const u = x / width + 0.5;
    const ripple = Math.sin(u * Math.PI * 4 + seed) * wave * (1 - t * 0.7);
    const belly = Math.sin(u * Math.PI) * wave * 0.8 * (1 - t);
    pos.setZ(i, ripple + belly);
    // Top edge follows the supporting rope's sag.
    pos.setY(i, y - Math.sin(u * Math.PI) * sagTop * t);
  }
  geo.computeVertexNormals();
  geo.translate(0, bottom + h / 2, 0);
  return geo;
}

// ------------------------------------------------------------------ signboard

/** Opaque sign band: 1.47 → 2.42 m (same sightline footprint as a beam). */
const SIGN_TOP = 2.42;

function signBoard(b: ModelBuilder, name: string, art: UvRect): void {
  b.part(name, 0, 3.6, 0);
  for (const s of [-1, 1]) b.rod("paint", PAL.rope, [s * 0.9, 3.6, 0], [s * 0.9, SIGN_TOP, 0], 0.012, 4, { noAo: true });
  const cy = (DANGER_EDGE_Y + SIGN_TOP) / 2;
  b.box("metal", 0x263238, [2.22, SIGN_TOP - DANGER_EDGE_Y, 0.06], { p: [0, cy, 0] }, { noAo: true });
  b.plane("art", 0xffffff, 2.14, SIGN_TOP - DANGER_EDGE_Y - 0.06, { p: [0, cy, 0.031] }, { uv: art, noAo: true });
  // Glowing danger edge + a row of little bulbs on top.
  b.box("glow", 0xffd400, [2.2, 0.035, 0.02], { p: [0, DANGER_EDGE_Y + 0.02, 0.035] });
  for (let i = 0; i < 7; i++) {
    b.sphere("glow", FESTIVE_BULBS[i % FESTIVE_BULBS.length], 0.03, { p: [-0.96 + i * 0.32, SIGN_TOP + 0.03, 0.035] }, 6, 4, { noAo: true });
  }
}

export const SIGNBOARD_SPEC: VariantSpec = {
  id: "signboard",
  parts: ["boardA", "boardB"],
  build(b) {
    for (const s of [-1, 1]) {
      bambooPole(b, s * 1.2, 0, 0, 3.78, 0.05);
      lashing(b, [s * 1.2, 3.6, 0], 0.05);
      b.rbox("paint", PAL.jute, [0.3, 0.14, 0.26], 0.05, { p: [s * 1.2, 0.07, 0] });
    }
    b.rod("paint", PAL.bamboo, [-1.34, 3.6, 0], [1.34, 3.6, 0], 0.045, 8, { noAo: true });
    signBoard(b, "boardA", artUv("signMithai"));
    signBoard(b, "boardB", artUv("signPaan"));
    b.base();
  },
  spawn(parts) {
    const a = Math.random() < 0.5;
    parts[0].visible = a;
    parts[1].visible = !a;
  },
  animate(parts, s) {
    const swing = Math.sin(s.time * 1.3) * 0.03;
    parts[0].rotation.x = swing;
    parts[1].rotation.x = swing;
  },
};

// ---------------------------------------------------------------- clothesline

export const CLOTHESLINE_SPEC: VariantSpec = {
  id: "clothesline",
  parts: ["clothes"],
  build(b) {
    for (const s of [-1, 1]) {
      bambooPole(b, s * 1.22, 0, 0, 3.62, 0.048);
      b.rbox("paint", PAL.jute, [0.3, 0.14, 0.26], 0.05, { p: [s * 1.22, 0.07, 0] });
    }
    // High line: a few small, sparse items (the frame reads un-jumpable but
    // the runner can still see the road through it).
    const hiA: Vec3 = [-1.22, 3.46, 0];
    const hiB: Vec3 = [1.22, 3.46, 0];
    rope(b, hiA, hiB, 0.08, 0.011);
    const hi = (x: number): number => sagPoint(hiA, hiB, 0.08, (x - hiA[0]) / (hiB[0] - hiA[0]))[1];
    b.plane("cloth", 0xd32f2f, 0.3, 0.4, { p: [-0.68, hi(-0.68) - 0.21, 0.01] }, { noAo: true });
    for (const dy of [-0.12, 0.08]) b.box("cloth", 0xffffff, [0.3, 0.025, 0.004], { p: [-0.68, hi(-0.68) - 0.21 + dy, 0.013] }, { noAo: true });
    const frock = new THREE.Shape();
    frock.moveTo(-0.13, 0);
    frock.lineTo(0.13, 0);
    frock.lineTo(0.21, -0.4);
    frock.lineTo(-0.21, -0.4);
    frock.closePath();
    b.shape("cloth", 0xffca28, frock, { p: [0.08, hi(0.08) - 0.01, 0.01] }, { noAo: true });
    for (const dx of [-0.05, 0.05]) b.box("cloth", 0x3949ab, [0.07, 0.22, 0.01], { p: [0.72 + dx, hi(0.72) - 0.12, 0.01] }, { noAo: true });
    for (const x of [-0.8, -0.56, -0.02, 0.18, 0.72]) b.box("paint", 0x26a69a, [0.02, 0.07, 0.03], { p: [x, hi(x) - 0.02, 0.012] }, { noAo: true });

    // Low line: three sarees folded over the rope — the slide danger band.
    const loA: Vec3 = [-1.22, 2.5, 0];
    const loB: Vec3 = [1.22, 2.5, 0];
    const sag = 0.06;
    rope(b, loA, loB, sag, 0.012);
    b.part("clothes", 0, 2.46, 0);
    const garments: { cx: number; art: UvRect; bottom: number; seed: number }[] = [
      { cx: -0.74, art: artUv("sareeA"), bottom: DANGER_EDGE_Y, seed: 0.3 },
      { cx: 0, art: artUv("sareeB"), bottom: DANGER_EDGE_Y + 0.01, seed: 1.7 },
      { cx: 0.74, art: artUv("sareeC"), bottom: DANGER_EDGE_Y + 0.02, seed: 2.9 },
    ];
    const width = 0.62;
    for (const g of garments) {
      const t = (g.cx - loA[0]) / (loB[0] - loA[0]);
      const top = sagPoint(loA, loB, sag, t)[1] - 0.01;
      b.add("clothArt", drape(width, top, g.bottom, 0.035, 0.015, g.seed), 0xffffff, { p: [g.cx, 0, 0] }, { uv: g.art, noAo: true });
      // Clothespins.
      for (const px of [g.cx - width / 2 + 0.06, g.cx + width / 2 - 0.06]) {
        const pt = sagPoint(loA, loB, sag, (px - loA[0]) / (loB[0] - loA[0]));
        b.box("paint", 0xff7043, [0.022, 0.075, 0.035], { p: [px, pt[1] - 0.02, 0.012] }, { noAo: true });
      }
    }
    b.base();
  },
  animate(parts, s) {
    parts[0].rotation.x = Math.sin(s.time * 1.7) * 0.05 + Math.sin(s.time * 3.1) * 0.012;
  },
};

// --------------------------------------------------------- mela banner / tarp

export const BANNER_SPEC: VariantSpec = {
  id: "banner",
  parts: ["mela", "tarp"],
  build(b) {
    for (const s of [-1, 1]) {
      bambooPole(b, s * 1.22, 0, 0, 3.64, 0.048);
      b.rbox("paint", PAL.jute, [0.3, 0.14, 0.26], 0.05, { p: [s * 1.22, 0.07, 0] });
    }
    // Bunting string with triangular paper flags (frame tops out above the
    // 3.45 m jump apex, so the banner is slide-only by eye and by collider).
    const a: Vec3 = [-1.22, 3.54, 0];
    const c: Vec3 = [1.22, 3.54, 0];
    rope(b, a, c, 0.09, 0.008);
    const flagColors = [0xff9800, 0xffffff, 0x43a047, 0xe91e63, 0xffeb3b, 0x2196f3] as const;
    for (let i = 0; i < 10; i++) {
      const p = sagPoint(a, c, 0.09, (i + 0.5) / 10);
      const tri = new THREE.Shape();
      tri.moveTo(-0.09, 0);
      tri.lineTo(0.09, 0);
      tri.lineTo(0, -0.2);
      tri.closePath();
      b.shape("cloth", flagColors[i % flagColors.length], tri, { p: [p[0], p[1], 0.005] }, { noAo: true });
    }

    // Festive mela banner (default).
    b.part("mela", 0, 2.4, 0);
    b.add("clothArt", drape(2.3, 2.4, DANGER_EDGE_Y, 0.03, 0.03, 0.8), 0xffffff, undefined, { uv: artUv("mela"), noAo: true });
    for (const s of [-1, 1]) {
      b.rod("paint", PAL.rope, [s * 1.15, 2.38, 0], [s * 1.2, 2.45, 0], 0.01, 4, { noAo: true });
      b.rod("paint", PAL.rope, [s * 1.15, DANGER_EDGE_Y + 0.03, 0], [s * 1.2, 1.55, 0], 0.01, 4, { noAo: true });
    }
    b.box("glow", 0xffd400, [2.26, 0.03, 0.02], { p: [0, DANGER_EDGE_Y + 0.015, 0.04] });

    // Monsoon blue tarpaulin (Mumbai).
    b.part("tarp", 0, 2.48, 0);
    b.add("cloth", drape(2.36, 2.48, DANGER_EDGE_Y, 0.06, 0.1, 2.2), 0x1e63c4, undefined, { noAo: true });
    for (const s of [-1, 1]) {
      for (const y of [2.42, DANGER_EDGE_Y + 0.06]) {
        b.torus("metal", PAL.chrome, 0.022, 0.006, { p: [s * 1.12, y, 0.03] }, 4, 10, Math.PI * 2, { noAo: true });
        b.rod("paint", PAL.rope, [s * 1.12, y, 0.02], [s * 1.2, y + 0.05, 0], 0.009, 4, { noAo: true });
      }
    }
    b.box("glow", 0xffd400, [2.3, 0.03, 0.02], { p: [0, DANGER_EDGE_Y + 0.015, 0.115] });
    b.base();
  },
  spawn(parts, biomeIndex) {
    const tarp = biomeIndex === 2 ? Math.random() < 0.75 : Math.random() < 0.15;
    parts[0].visible = !tarp;
    parts[1].visible = tarp;
  },
  animate(parts, s) {
    const flutter = Math.sin(s.time * 1.9) * 0.025;
    parts[0].rotation.x = flutter;
    parts[1].rotation.x = flutter * 0.6;
  },
};

// ------------------------------------------------------------- railway phaatak

const PHAATAK = {
  red: 0xd50000,
  white: 0xf5f5f5,
  post: 0x111111,
  concrete: 0x9e9e9e,
  gauge: 0x37474f,
} as const;

export const PHAATAK_SPEC: VariantSpec = {
  id: "phaatak",
  parts: ["lampsA", "lampsB"],
  build(b) {
    // Striped posts with lamp housings.
    for (const s of [-1, 1]) {
      b.box("paint", PHAATAK.concrete, [0.42, 0.2, 0.42], { p: [s * 3.95, 0.1, 0] });
      for (let i = 0; i < 4; i++) {
        b.box("paint", i % 2 === 0 ? PHAATAK.post : PHAATAK.white, [0.2, 0.5, 0.2], { p: [s * 3.95, 0.45 + i * 0.5, 0] });
      }
      b.rbox("paint", PHAATAK.post, [0.3, 0.3, 0.22], 0.05, { p: [s * 3.95, 2.36, 0.02] });
      b.box("paint", PHAATAK.post, [0.34, 0.03, 0.14], { p: [s * 3.95, 2.52, 0.12] });
      b.cyl("paint", 0x4a0000, 0.1, 0.1, 0.02, { p: [s * 3.95, 2.36, 0.135], r: [Math.PI / 2, 0, 0] }, 14);
    }
    // Pivot housing + counterweight on the left.
    b.box("metal", PHAATAK.gauge, [0.34, 0.34, 0.34], { p: [-3.95, 1.62, 0] });
    b.box("paint", 0xffc400, [0.72, 0.14, 0.16], { p: [-4.42, 1.62, 0] });
    b.box("metal", 0x263238, [0.36, 0.38, 0.3], { p: [-4.78, 1.62, 0] });
    // Boom rest fork on the right post.
    b.box("metal", PHAATAK.gauge, [0.3, 0.06, 0.24], { p: [3.95, 1.52, 0] });
    for (const z of [-0.1, 0.1]) b.box("metal", PHAATAK.gauge, [0.06, 0.2, 0.04], { p: [3.95, 1.6, z] });

    // Red/white boom.
    const segs = 15;
    const x0 = -3.78;
    const len = (3.86 - x0) / segs;
    for (let i = 0; i < segs; i++) {
      b.cyl("paint", i % 2 === 0 ? PHAATAK.red : PHAATAK.white, 0.075, 0.075, len, {
        p: [x0 + (i + 0.5) * len, 1.62, 0],
        r: [0, 0, Math.PI / 2],
      }, 12, { noAo: true });
    }
    // Glowing reflector strip on the boom's runner side (danger line).
    b.box("glow", 0xffffff, [7.5, 0.025, 0.01], { p: [0.04, 1.6, 0.077] });
    // STOP disc riding on the boom.
    b.cyl("paint", PHAATAK.white, 0.25, 0.25, 0.03, { p: [0, 1.95, 0], r: [Math.PI / 2, 0, 0] }, 24, { noAo: true });
    b.add("art", new THREE.CircleGeometry(0.235, 24), 0xffffff, { p: [0, 1.95, 0.0165] }, { uv: artUv("phaatakDisc"), noAo: true });
    for (const x of [-2.2, 2.2]) b.cyl("paint", PHAATAK.post, 0.06, 0.07, 0.08, { p: [x, 1.73, 0] }, 10, { noAo: true });

    // Height gauge: striped crossbar with a chain curtain (no jumping over).
    for (const s of [-1, 1]) b.rod("metal", PHAATAK.gauge, [s * 4.3, 0, -0.2], [s * 4.3, 3.95, -0.2], 0.06, 8);
    for (let i = 0; i < 16; i++) {
      b.box("paint", i % 2 === 0 ? PHAATAK.red : PHAATAK.white, [0.54, 0.16, 0.1], { p: [-4.05 + i * 0.54, 3.86, -0.2] }, { noAo: true });
    }
    for (let i = 0; i < 9; i++) {
      const x = -3.6 + i * 0.9;
      b.rod("metal", 0x212121, [x, 3.78, -0.2], [x, 3.0, -0.2], 0.012, 4, { noAo: true });
      b.box("glow", i % 2 === 0 ? 0xff1744 : PAL.reflectorWhite, [0.12, 0.16, 0.02], { p: [x, 2.94, -0.2] });
    }

    // Alternating crossing lamps (posts + boom).
    b.part("lampsA");
    b.sphere("glow", 0xff1a1a, 0.095, { p: [-3.95, 2.36, 0.15], s: [1, 1, 0.5] }, 10, 7);
    b.sphere("glow", 0xff1a1a, 0.055, { p: [-2.2, 1.8, 0.02] }, 8, 6);
    b.part("lampsB");
    b.sphere("glow", 0xff1a1a, 0.095, { p: [3.95, 2.36, 0.15], s: [1, 1, 0.5] }, 10, 7);
    b.sphere("glow", 0xff1a1a, 0.055, { p: [2.2, 1.8, 0.02] }, 8, 6);
    b.base();
  },
  animate(parts, s) {
    const a = Math.sin(s.time * 6.5) > 0;
    parts[0].visible = a;
    parts[1].visible = !a;
  },
};

// ---------------------------------------------------------------- swagat arch

export const SWAGAT_ARCH_SPEC: VariantSpec = {
  id: "swagatArch",
  parts: ["banner"],
  build(b) {
    const px = 4.25;
    for (const s of [-1, 1]) {
      const x = s * px;
      b.rbox("paint", 0xfff3e0, [0.64, 0.38, 0.64], 0.06, { p: [x, 0.19, 0] });
      b.cyl("cloth", 0xffb300, 0.21, 0.24, 3.56, { p: [x, 2.14, 0] }, 14);
      // Marigold spiral up each pillar.
      for (let i = 0; i < 16; i++) {
        const ang = i * 1.05;
        b.ico("paint", i % 2 === 0 ? PAL.marigoldOrange : 0xd84315, 0.065, {
          p: [x + Math.cos(ang) * 0.25, 0.5 + i * 0.21, Math.sin(ang) * 0.25],
        }, 0, { noAo: true });
      }
      b.rbox("paint", 0xc62828, [0.62, 0.22, 0.62], 0.05, { p: [x, 4.0, 0] }, { noAo: true });
      // Kalash with coconut and mango leaves on top.
      b.lathe("metal", 0xffb300, [[0.001, 0], [0.16, 0.02], [0.2, 0.14], [0.14, 0.28], [0.1, 0.32], [0.13, 0.36]], { p: [x, 4.11, 0] }, 12, { noAo: true });
      b.sphere("paint", 0x6d4c41, 0.11, { p: [x, 4.52, 0] }, 8, 6, { noAo: true });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.cone("paint", PAL.leaf, 0.04, 0.26, { p: [x + Math.cos(a) * 0.12, 4.5, Math.sin(a) * 0.12], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }, 4, { noAo: true });
      }
      bulbString(b, [x - s * 0.25, 3.8, 0.26], [x - s * 0.25, 0.5, 0.26], 0.0, 9, FESTIVE_BULBS, 0.034);
    }

    // Cloth-wrapped crossbeam with gold trim.
    b.box("cloth", 0xc62828, [8.7, 0.36, 0.34], { p: [0, 3.72, 0] }, { noAo: true });
    for (const y of [3.555, 3.885]) b.box("metal", 0xffc107, [8.72, 0.045, 0.36], { p: [0, y, 0] }, { noAo: true });
    for (let i = 0; i < 6; i++) {
      const x0 = -4.0 + i * (8.0 / 6);
      marigoldGarland(b, [x0, 3.86, 0.2], [x0 + 8.0 / 6, 3.86, 0.2], 0.22, 6, 0.06);
    }
    bulbString(b, [-4.3, 3.93, 0.18], [4.3, 3.93, 0.18], 0.0, 16, FESTIVE_BULBS, 0.034);

    // The "स्वागत" banner hangs LOW on sparse marigold strings: its opaque
    // band sits where an old-style beam would (1.54–2.38 m), so the road
    // beyond stays readable, and its gold tassels mark the slide line.
    b.part("banner", 0, 3.54, 0);
    for (let i = 0; i < 7; i++) {
      const x = -3.3 + i * 1.1;
      b.rod("paint", PAL.rope, [x, 3.54, 0.02], [x, 2.38, 0.02], 0.007, 3, { noAo: true });
      for (let k = 0; k < 7; k++) {
        b.ico("paint", k % 2 === 0 ? PAL.marigoldOrange : PAL.marigoldYellow, 0.052, {
          p: [x, 3.44 - k * 0.155, 0.02],
          r: [k, i, 0],
        }, 0, { noAo: true });
      }
    }
    b.box("cloth", 0x5d0000, [6.86, 0.84, 0.02], { p: [0, 1.96, -0.01] }, { noAo: true });
    b.plane("art", 0xffffff, 6.8, 0.8, { p: [0, 1.96, 0.002] }, { uv: artUv("swagat"), noAo: true });
    // Mango-leaf toran along the top hem.
    for (let i = 0; i < 18; i++) {
      b.cone("paint", i % 2 === 0 ? PAL.leaf : PAL.leafLight, 0.045, 0.17, { p: [-3.4 + i * 0.4, 2.33, 0.02], r: [Math.PI, 0, 0] }, 4, { noAo: true });
    }
    // Gold tassel fringe = the danger edge, plus a glow line for night.
    for (let i = 0; i < 34; i++) {
      b.cone("metal", 0xffc107, 0.022, 0.075, { p: [-3.3 + i * 0.2, 1.535, 0.012], r: [Math.PI, 0, 0] }, 5, { noAo: true });
    }
    b.box("glow", 0xffd400, [6.84, 0.025, 0.012], { p: [0, 1.565, 0.014] });
    b.base();
  },
  animate(parts, s) {
    parts[0].rotation.x = Math.sin(s.time * 1.5) * 0.02;
  },
};

export const OVERHEAD1_SPECS: readonly VariantSpec[] = [SIGNBOARD_SPEC, CLOTHESLINE_SPEC, BANNER_SPEC];
export const OVERHEAD3_SPECS: readonly VariantSpec[] = [PHAATAK_SPEC, SWAGAT_ARCH_SPEC];
