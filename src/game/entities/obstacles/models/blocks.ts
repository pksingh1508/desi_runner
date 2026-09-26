import * as THREE from "three";
import type { ModelBuilder, Vec3 } from "../ModelBuilder";
import type { VariantSpec } from "../types";
import { artUv } from "../ObstacleArt";
import { PAL, head, solidWheel } from "./common";
import { buildCart } from "./barriers";

/**
 * DODGE-ONLY obstacles (kind "block", top ≥ 2.6 m). Vehicles face away from
 * the runner, so their painted rears (+Z) are what the player reads.
 */

/** Tiny nimbu-mirchi charm (ward-off-evil) hanging from vehicles. */
function nimbuMirchi(b: ModelBuilder, top: Vec3): void {
  b.rod("paint", PAL.black, top, [top[0], top[1] - 0.2, top[2]], 0.004, 3, { noAo: true });
  for (let i = 0; i < 3; i++) {
    b.cone("paint", 0x2e7d32, 0.014, 0.08, {
      p: [top[0] + (i - 1) * 0.012, top[1] - 0.05 - i * 0.045, top[2]],
      r: [0, 0, (i - 1) * 0.5 + Math.PI],
    }, 5, { noAo: true });
  }
  b.sphere("paint", 0xf4e04d, 1, { p: [top[0], top[1] - 0.23, top[2]], s: [0.035, 0.03, 0.03] }, 7, 5, { noAo: true });
}

// ---------------------------------------------------------------------- truck

const TRUCK = {
  cargo: 0xf9a825,
  cargoBandTop: 0xd32f2f,
  cargoBandLow: 0x2e7d32,
  post: 0xbf5f00,
  tarp: 0x1f5fb3,
  cab: 0xe64a19,
  cabStripe: 0xfff3e0,
  chassis: 0x1d1d22,
  floor: 0x4e342e,
} as const;

/** Temple-crown silhouette above the tailgate (shape units = meters). */
function crownShape(halfW: number, shoulder: number, peak: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0);
  s.lineTo(halfW, 0);
  s.lineTo(halfW, shoulder);
  s.quadraticCurveTo(halfW * 0.45, shoulder, halfW * 0.2, shoulder + (peak - shoulder) * 0.55);
  s.quadraticCurveTo(halfW * 0.08, peak * 0.95, 0, peak);
  s.quadraticCurveTo(-halfW * 0.08, peak * 0.95, -halfW * 0.2, shoulder + (peak - shoulder) * 0.55);
  s.quadraticCurveTo(-halfW * 0.45, shoulder, -halfW, shoulder);
  s.closePath();
  return s;
}

export const TRUCK_SPEC: VariantSpec = {
  id: "truck",
  ao: { height: 0.5, min: 0.62 },
  build(b) {
    const rearZ = 1.74;
    // --- chassis, axles, wheels
    for (const x of [-0.45, 0.45]) b.box("paint", TRUCK.chassis, [0.16, 0.22, 3.3], { p: [x, 0.72, -0.05] });
    b.rod("metal", PAL.steelDark, [-0.9, 0.48, 0.85], [0.9, 0.48, 0.85], 0.05, 8);
    b.sphere("metal", PAL.steelDark, 0.17, { p: [0, 0.48, 0.85], s: [1, 0.85, 1.1] }, 10, 7);
    for (const s of [-1, 1] as const) {
      solidWheel(b, [s * 0.86, 0.48, 0.85], 0.48, 0.24, "x", 0xc62828, s);
      solidWheel(b, [s * 0.6, 0.48, 0.85], 0.48, 0.22, "x", 0xc62828, s);
      solidWheel(b, [s * 0.86, 0.46, -1.3], 0.46, 0.24, "x", 0xc62828, s);
    }
    // Side fuel tank.
    b.cyl("metal", 0xc0c6cc, 0.2, 0.2, 0.7, { p: [-0.92, 0.66, -0.25], r: [Math.PI / 2, 0, 0] }, 12);
    b.box("paint", PAL.steelDark, [0.9, 0.1, 0.12], { p: [0, 0.34, 1.62] });

    // --- bumper, lamps, plate
    b.box("paint", PAL.black, [2.2, 0.18, 0.12], { p: [0, 0.69, rearZ - 0.06] });
    b.plane("art", 0xffffff, 2.2, 0.17, { p: [0, 0.69, rearZ + 0.001] }, { uv: artUv("hazard"), noAo: true });
    b.box("paint", PAL.black, [0.56, 0.16, 0.03], { p: [0, 0.88, rearZ - 0.01] });
    b.plane("art", 0xffffff, 0.52, 0.13, { p: [0, 0.88, rearZ + 0.007] }, { uv: artUv("plate"), noAo: true });
    for (const s of [-1, 1]) {
      b.box("paint", PAL.black, [0.36, 0.16, 0.06], { p: [s * 0.86, 0.88, rearZ - 0.03] });
      b.box("glow", PAL.reflectorRed, [0.15, 0.11, 0.02], { p: [s * 0.95, 0.88, rearZ + 0.005] });
      b.box("glow", PAL.reflectorAmber, [0.1, 0.11, 0.02], { p: [s * 0.78, 0.88, rearZ + 0.005] });
      // Mud flap with reflector dots and a tassel fringe.
      b.box("paint", 0x111111, [0.44, 0.56, 0.025], { p: [s * 0.8, 0.44, 1.3] });
      for (let i = 0; i < 3; i++) {
        b.cyl("glow", i === 1 ? PAL.reflectorWhite : PAL.reflectorRed, 0.035, 0.035, 0.01, {
          p: [s * 0.8 + (i - 1) * 0.12, 0.56, 1.316],
          r: [Math.PI / 2, 0, 0],
        }, 8, { noAo: true });
      }
      for (let i = 0; i < 5; i++) {
        b.cone("paint", i % 2 === 0 ? 0xd32f2f : 0xffffff, 0.022, 0.08, {
          p: [s * 0.8 + (i - 2) * 0.09, 0.13, 1.3],
          r: [Math.PI, 0, 0],
        }, 5);
      }
    }

    // --- cargo body
    b.box("paint", TRUCK.floor, [2.24, 0.14, 2.46], { p: [0, 0.91, 0.51] });
    b.box("paint", TRUCK.cargo, [2.2, 1.2, 0.06], { p: [0, 1.58, rearZ - 0.03] });
    b.plane("art", 0xffffff, 2.12, 1.16, { p: [0, 1.58, rearZ + 0.002] }, { uv: artUv("truckGate"), noAo: true });
    // Tailgate frame + reflector tape.
    b.box("paint", TRUCK.cargoBandTop, [2.24, 0.07, 0.08], { p: [0, 2.2, rearZ - 0.03] });
    for (let i = 0; i < 8; i++) {
      b.box("glow", i % 2 === 0 ? PAL.reflectorRed : PAL.reflectorWhite, [0.26, 0.05, 0.012], {
        p: [-0.91 + i * 0.26, 1.02, rearZ + 0.006],
      });
    }
    for (const s of [-1, 1]) {
      b.box("paint", TRUCK.post, [0.08, 1.4, 0.08], { p: [s * 1.1, 1.6, rearZ - 0.04] });
      b.box("metal", PAL.chrome, [0.06, 0.08, 0.04], { p: [s * 0.9, 2.12, rearZ + 0.01] });
      // Side walls with painted bands and ribs.
      b.box("paint", TRUCK.cargo, [0.06, 1.36, 2.44], { p: [s * 1.09, 1.66, 0.52] });
      b.box("paint", TRUCK.cargoBandTop, [0.07, 0.1, 2.44], { p: [s * 1.095, 2.29, 0.52] });
      b.box("paint", TRUCK.cargoBandLow, [0.07, 0.14, 2.44], { p: [s * 1.095, 1.05, 0.52] });
      for (let i = 0; i < 4; i++) {
        b.box("paint", TRUCK.post, [0.075, 1.3, 0.05], { p: [s * 1.1, 1.66, -0.5 + i * 0.62] });
      }
      // Amber side markers.
      b.box("glow", PAL.reflectorAmber, [0.012, 0.06, 0.1], { p: [s * 1.13, 1.05, 1.2] });
      b.box("glow", PAL.reflectorAmber, [0.012, 0.06, 0.1], { p: [s * 1.13, 1.05, -0.2] });
      // Latkan tassels at the tailgate corners.
      b.rod("paint", PAL.black, [s * 1.0, 1.0, rearZ + 0.02], [s * 1.0, 0.86, rearZ + 0.02], 0.006, 3, { noAo: true });
      b.sphere("paint", 0x111111, 0.035, { p: [s * 1.0, 0.84, rearZ + 0.02] }, 6, 4, { noAo: true });
    }

    // --- painted crown above the tailgate
    const crown = crownShape(1.12, 0.32, 0.58);
    const crownRect = artUv("truckCrown");
    b.extrude("paint", 0x0d3b8a, crown, 0.06, { p: [0, 2.24, rearZ - 0.07] });
    b.shape("art", 0xffffff, crown, { p: [0, 2.24, rearZ - 0.005] }, {
      planar: { x0: -1.12, x1: 1.12, y0: 2.24, y1: 2.82, rect: crownRect },
      noAo: true,
    });
    b.sphere("metal", 0xffc400, 0.05, { p: [0, 2.85, rearZ - 0.04] }, 8, 6);

    // --- tarpaulin-covered load
    b.rbox("cloth", TRUCK.tarp, [2.1, 0.76, 2.3], 0.34, { p: [0, 2.62, 0.45] }, { noAo: true }, 2);
    for (const z of [1.25, 0.45, -0.35]) {
      b.tube("paint", 0xe0c28a, [
        [-1.06, 2.36, z],
        [-0.95, 2.82, z],
        [0, 3.005, z],
        [0.95, 2.82, z],
        [1.06, 2.36, z],
      ], 0.018, 14, 4, { noAo: true });
    }

    // --- cab (peeks out behind the load)
    b.rbox("paint", TRUCK.cab, [2.2, 1.46, 1.0], 0.14, { p: [0, 1.66, -1.22] });
    b.box("paint", TRUCK.cabStripe, [2.22, 0.1, 1.02], { p: [0, 1.25, -1.22] });
    for (const s of [-1, 1]) {
      b.box("metal", 0x263238, [0.02, 0.5, 0.5], { p: [s * 1.105, 1.95, -1.25] });
      b.rod("metal", PAL.steelDark, [s * 1.1, 2.0, -0.78], [s * 1.2, 2.05, -0.78], 0.012, 4);
      b.box("metal", 0x37474f, [0.04, 0.26, 0.14], { p: [s * 1.21, 1.92, -0.78] });
    }
    b.rbox("paint", 0xffc400, [1.9, 0.12, 0.7], 0.05, { p: [0, 2.42, -1.2] });

    // Ward-off-evil charm under the plate.
    nimbuMirchi(b, [0.36, 0.8, rearZ + 0.03]);
  },
};

// ------------------------------------------------------------------ chai tapri

const TAPRI = {
  counter: 0x29a3dc,
  plinth: 0x2b3440,
  steel: 0xaab1b8,
  tin: 0x9aa7ae,
  rust: 0xa0522d,
  post: 0x6d7b84,
  ply: 0xa1887f,
  vest: 0xf1efe6,
} as const;

export const CHAI_TAPRI_SPEC: VariantSpec = {
  id: "chaiTapri",
  parts: ["flame", "steam"],
  build(b) {
    // --- counter cabinet
    b.box("paint", TAPRI.plinth, [2.04, 0.1, 0.94], { p: [0, 0.05, -0.02] });
    b.rbox("paint", TAPRI.counter, [2.0, 0.92, 0.9], 0.04, { p: [0, 0.56, -0.02] });
    b.plane("art", 0xffffff, 1.84, 0.9, { p: [0, 0.56, 0.432] }, { uv: artUv("chaiFront"), noAo: true });
    b.box("metal", TAPRI.steel, [2.1, 0.05, 1.0], { p: [0, 1.045, -0.02] });

    // --- stove + boiling patila
    b.box("paint", PAL.black, [0.36, 0.1, 0.32], { p: [-0.52, 1.12, -0.1] });
    b.cyl("metal", 0xc4c9ce, 0.17, 0.16, 0.22, { p: [-0.52, 1.28, -0.1] }, 16);
    b.torus("metal", 0xdfe3e8, 0.17, 0.012, { p: [-0.52, 1.39, -0.1], r: [Math.PI / 2, 0, 0] }, 4, 16);
    b.cyl("paint", 0xb9772d, 0.16, 0.16, 0.01, { p: [-0.52, 1.375, -0.1] }, 16);
    // Kettle.
    b.lathe("metal", 0xd0d4d8, [[0.001, 0], [0.1, 0.01], [0.115, 0.08], [0.09, 0.16], [0.045, 0.2], [0.001, 0.215]], { p: [-0.12, 1.07, 0.1] }, 14);
    b.rod("metal", 0xd0d4d8, [-0.03, 1.12, 0.1], [0.06, 1.24, 0.1], 0.016, 6, undefined, 0.01);
    b.torus("metal", 0x3e2723, 0.07, 0.01, { p: [-0.12, 1.3, 0.1] }, 4, 10, Math.PI);

    // --- tray of cutting-chai glasses
    b.box("metal", TAPRI.steel, [0.46, 0.02, 0.22], { p: [0.42, 1.08, 0.18] });
    for (let i = 0; i < 8; i++) {
      const x = 0.27 + (i % 4) * 0.1;
      const z = 0.13 + Math.floor(i / 4) * 0.1;
      b.cyl("glass", 0xdff3ff, 0.034, 0.027, 0.09, { p: [x, 1.135, z] }, 10);
      b.cyl("paint", 0xa0612b, 0.029, 0.024, 0.062, { p: [x, 1.122, z] }, 8);
    }
    // --- biscuit jars
    const jarFill = [0xf9a825, 0xe67e22, 0xf06292] as const;
    jarFill.forEach((fill, i) => {
      const x = 0.2 + i * 0.26;
      b.cyl("glass", 0xe8f6ff, 0.09, 0.085, 0.25, { p: [x, 1.195, -0.3] }, 12);
      b.cyl("paint", fill, 0.078, 0.075, 0.16, { p: [x, 1.15, -0.3] }, 10);
      b.cyl("paint", 0xd32f2f, 0.094, 0.094, 0.045, { p: [x, 1.34, -0.3] }, 12);
    });
    // Price board propped on the counter edge.
    b.box("paint", PAL.woodDark, [0.4, 0.24, 0.02], { p: [-0.72, 1.18, 0.4], r: [-0.15, 0, 0] });
    b.plane("art", 0xffffff, 0.36, 0.2, { p: [-0.72, 1.18, 0.413], r: [-0.15, 0, 0] }, { uv: artUv("chaiPrice"), noAo: true });

    // --- chai-wala pouring (behind the counter, facing the street)
    b.sphere("paint", TAPRI.vest, 1, { p: [0.12, 1.34, -0.22], s: [0.2, 0.27, 0.14] }, 12, 9);
    b.rod("paint", PAL.skin, [0.12, 1.56, -0.22], [0.12, 1.64, -0.21], 0.045, 6);
    head(b, [0.12, 1.73, -0.2], 0.1, "z", 1);
    b.box("cloth", 0xd32f2f, [0.08, 0.3, 0.16], { p: [-0.05, 1.47, -0.2], r: [0, 0, 0.3] }, { noAo: true });
    // Pouring arm + small saucepan.
    b.rod("paint", PAL.skin, [0.28, 1.5, -0.2], [0.42, 1.36, -0.02], 0.04, 6, undefined, 0.035);
    b.rod("paint", PAL.skin, [0.42, 1.36, -0.02], [0.4, 1.3, 0.1], 0.035, 6, undefined, 0.03);
    b.cyl("metal", 0xc4c9ce, 0.06, 0.055, 0.07, { p: [0.4, 1.27, 0.14], r: [0.5, 0, 0] }, 10);
    b.rod("paint", 0xa0612b, [0.4, 1.24, 0.19], [0.37, 1.15, 0.18], 0.007, 4, { noAo: true });
    // Resting arm.
    b.rod("paint", PAL.skin, [-0.04, 1.5, -0.2], [-0.12, 1.3, -0.08], 0.04, 6, undefined, 0.035);
    b.rod("paint", PAL.skin, [-0.12, 1.3, -0.08], [-0.2, 1.1, 0.02], 0.035, 6, undefined, 0.03);

    // --- posts, tin roof, sign
    for (const s of [-1, 1]) {
      b.rod("metal", TAPRI.post, [s * 0.98, 1.05, 0.4], [s * 0.98, 2.43, 0.4], 0.03, 6);
      b.rod("metal", TAPRI.post, [s * 0.98, 1.05, -0.45], [s * 0.98, 2.58, -0.45], 0.03, 6);
    }
    b.box("metal", TAPRI.tin, [2.24, 0.03, 1.1], { p: [0, 2.5, -0.02], r: [0.14, 0, 0] });
    for (let i = 0; i < 9; i++) {
      const x = -1.0 + i * 0.25;
      b.rod("metal", TAPRI.tin, [x, 2.435, 0.53], [x, 2.59, -0.57], 0.02, 5);
    }
    b.box("paint", TAPRI.rust, [0.4, 0.01, 0.3], { p: [-0.55, 2.525, -0.2], r: [0.14, 0, 0] });
    b.box("paint", TAPRI.rust, [0.25, 0.01, 0.2], { p: [0.6, 2.51, 0.1], r: [0.14, 0, 0] });
    b.box("paint", PAL.black, [1.86, 0.48, 0.05], { p: [0, 2.72, 0.5] });
    b.plane("art", 0xffffff, 1.8, 0.45, { p: [0, 2.72, 0.527] }, { uv: artUv("chaiBoard"), noAo: true });
    // Back wall with posters.
    b.box("paint", TAPRI.ply, [1.96, 1.38, 0.03], { p: [0, 1.74, -0.47] });
    b.box("paint", 0xffeb3b, [0.4, 0.52, 0.01], { p: [-0.55, 1.85, -0.45] });
    b.box("paint", 0x4fc3f7, [0.36, 0.46, 0.01], { p: [0.62, 1.8, -0.45] });
    // Warm bulb under the roof.
    b.rod("paint", PAL.black, [0.42, 2.44, 0.3], [0.42, 2.26, 0.3], 0.006, 3, { noAo: true });
    b.cone("metal", 0x37474f, 0.07, 0.05, { p: [0.42, 2.25, 0.3] }, 10, { noAo: true });
    b.sphere("glow", PAL.lampWarm, 0.05, { p: [0.42, 2.19, 0.3] }, 8, 6);
    // Foil snack strips hanging at the front posts.
    const sachets = [0xff7043, 0x66bb6a, 0xffca28, 0x42a5f5, 0xec407a, 0xcfd8dc] as const;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        b.box("metal", sachets[(i + (s > 0 ? 2 : 0)) % sachets.length], [0.14, 0.12, 0.01], {
          p: [s * 0.86, 2.3 - i * 0.13, 0.45],
          r: [0, 0, (i % 2 === 0 ? 1 : -1) * 0.06],
        }, { noAo: true });
      }
    }

    // --- animated: stove flame + steam wisps
    b.part("flame", -0.52, 1.17, -0.1);
    b.cone("glow", 0x4f8dff, 0.12, 0.05, { p: [-0.52, 1.19, -0.1] }, 12);
    b.part("steam", -0.52, 1.4, -0.1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const x0 = -0.52 + Math.cos(a) * 0.06;
      const z0 = -0.1 + Math.sin(a) * 0.06;
      b.tube("glass", 0xffffff, [
        [x0, 1.4, z0],
        [x0 + 0.04, 1.52, z0 + 0.02],
        [x0 - 0.03, 1.64, z0 - 0.02],
        [x0 + 0.02, 1.78, z0],
      ], 0.012, 10, 4, { noAo: true });
    }
    b.base();
  },
  animate(parts, s) {
    const flick = 0.85 + Math.sin(s.time * 23) * 0.1 + Math.sin(s.time * 37) * 0.06;
    parts[0].scale.set(1, flick, 1);
    const rise = (s.time * 0.6) % 1;
    parts[1].position.y = 1.4 + rise * 0.1;
    parts[1].rotation.y = s.time * 0.8;
    parts[1].scale.setScalar(0.85 + Math.sin(rise * Math.PI) * 0.3);
  },
};

// ------------------------------------------------------------------ sack cart

export const SACK_CART_SPEC: VariantSpec = {
  id: "sackCart",
  build(b) {
    buildCart(b, 0.72, 0x2e7d32, 0xffd54f);
    // Bottom layer: stenciled jute sacks.
    const juteTones = [PAL.jute, 0xbf9658, 0xd2ad72] as const;
    juteTones.forEach((tone, i) => {
      const x = -0.66 + i * 0.66;
      b.rbox("paint", tone, [0.62, 0.44, 0.92], 0.1, { p: [x, 1.0, 0] });
      if (i !== 1) {
        b.plane("art", 0xffffff, 0.4, 0.24, { p: [x, 1.0, 0.461] }, { uv: artUv("sackPrint"), noAo: true });
      }
    });
    // Middle: stacked market crates.
    const crateColors = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xfb8c00, 0x8e24aa] as const;
    let c = 0;
    for (let tier = 0; tier < 2; tier++) {
      for (const z of [0.22, -0.22]) {
        for (let i = 0; i < 3; i++) {
          const color = crateColors[c++ % crateColors.length];
          const p: Vec3 = [-0.64 + i * 0.64, 1.39 + tier * 0.34, z];
          b.box("paint", color, [0.6, 0.32, 0.42], { p });
          if (z > 0) {
            for (const dy of [-0.07, 0.05]) {
              b.box("paint", 0x1b1b1b, [0.46, 0.028, 0.01], { p: [p[0], p[1] + dy, p[2] + 0.211] });
            }
          }
          b.box("paint", 0x1b1b1b, [0.012, 0.028, 0.2], { p: [p[0] - 0.301, p[1] + 0.1, p[2]] });
          b.box("paint", 0x1b1b1b, [0.012, 0.028, 0.2], { p: [p[0] + 0.301, p[1] + 0.1, p[2]] });
        }
      }
    }
    // Top: two sacks across + a striped durrie roll.
    for (const x of [-0.47, 0.47]) {
      b.rbox("paint", x < 0 ? 0xd2ad72 : PAL.jute, [0.9, 0.4, 0.62], 0.12, { p: [x, 2.12, 0.1] });
    }
    const stripes = [0xc62828, 0xf5f5f5, 0x1565c0, 0xf5f5f5, 0xc62828] as const;
    stripes.forEach((color, i) => {
      b.cyl("cloth", color, 0.19, 0.19, 0.32, { p: [-0.64 + i * 0.32, 2.52, -0.08], r: [0, 0, Math.PI / 2] }, 12, { noAo: true });
    });
    // Rope lashing over the load.
    for (const x of [-0.45, 0.45]) {
      b.tube("paint", 0xe0c28a, [
        [x, 0.93, 0.51],
        [x, 1.9, 0.46],
        [x, 2.36, 0.38],
        [x, 2.735, -0.05],
        [x, 2.36, -0.36],
        [x, 1.9, -0.46],
        [x, 0.93, -0.51],
      ], 0.017, 24, 4, { noAo: true });
    }
  },
};

// --------------------------------------------------------- auto with luggage

const AUTO = {
  /** Delhi CNG green vs Mumbai black lower bodies (yellow tops for both). */
  bodyDelhi: 0x1b8e3e,
  bodyMumbai: 0x1c1c1c,
  canopy: 0xffd100,
  canvas: 0x1a1a1a,
  glass: 0x2d3a45,
} as const;

/** Rounded auto shell: engine cover (rear), passenger tub, nose. */
function autoShell(b: ModelBuilder, color: number): void {
  b.rbox("paint", color, [1.34, 0.62, 0.8], 0.08, { p: [0, 0.72, 0.9] }, undefined, 2);
  b.rbox("paint", color, [1.34, 0.5, 1.0], 0.12, { p: [0, 0.64, 0.1] }, undefined, 2);
  b.rbox("paint", color, [1.0, 0.72, 0.62], 0.24, { p: [0, 0.76, -0.95] }, undefined, 2);
}

export const AUTO_LOADED_SPEC: VariantSpec = {
  id: "autoLoaded",
  parts: ["shellDelhi", "shellMumbai"],
  ao: { height: 0.4, min: 0.62 },
  spawn(parts, biomeIndex) {
    const mumbai = biomeIndex === 2 ? Math.random() < 0.8 : Math.random() < 0.15;
    parts[0].visible = !mumbai;
    parts[1].visible = mumbai;
  },
  build(b) {
    // Wheels + chassis.
    for (const s of [-1, 1] as const) solidWheel(b, [s * 0.62, 0.25, 0.75], 0.25, 0.14, "x", 0xcfd8dc, s);
    solidWheel(b, [0, 0.25, -1.05], 0.25, 0.14, "x", 0xcfd8dc, 1);
    b.box("paint", 0x202020, [1.16, 0.18, 2.3], { p: [0, 0.4, -0.12] });

    // Body shell (city livery chosen per spawn).
    b.part("shellDelhi");
    autoShell(b, AUTO.bodyDelhi);
    b.part("shellMumbai");
    autoShell(b, AUTO.bodyMumbai);
    b.base();
    b.plane("art", 0xffffff, 1.1, 0.42, { p: [0, 0.74, 1.302] }, { uv: artUv("autoRear"), noAo: true });
    b.box("paint", PAL.black, [0.44, 0.12, 0.02], { p: [0, 0.46, 1.3] });
    b.plane("art", 0xffffff, 0.4, 0.1, { p: [0, 0.46, 1.312] }, { uv: artUv("plate"), noAo: true });
    for (const s of [-1, 1]) {
      b.box("glow", PAL.reflectorRed, [0.12, 0.09, 0.02], { p: [s * 0.56, 0.98, 1.3] });
      b.box("glow", PAL.reflectorAmber, [0.07, 0.06, 0.02], { p: [s * 0.56, 0.87, 1.3] });
    }
    b.rod("metal", PAL.chrome, [-0.62, 0.36, 1.34], [0.62, 0.36, 1.34], 0.028, 6);
    for (const s of [-1, 1]) b.rod("metal", PAL.chrome, [s * 0.5, 0.36, 1.34], [s * 0.5, 0.45, 1.29], 0.02, 5);
    b.rod("metal", 0x555555, [0.4, 0.3, 1.18], [0.44, 0.3, 1.35], 0.028, 6);

    // Canopy: yellow top, black canvas rear + sides, pillars.
    b.rbox("paint", AUTO.canopy, [1.42, 0.12, 2.02], 0.05, { p: [0, 1.74, -0.15] });
    b.rbox("paint", AUTO.canvas, [1.4, 0.74, 0.1], 0.05, { p: [0, 1.34, 0.86] });
    b.rbox("metal", AUTO.glass, [0.86, 0.3, 0.02], 0.01, { p: [0, 1.42, 0.915] });
    for (const s of [-1, 1]) {
      b.box("paint", AUTO.canvas, [0.04, 0.72, 0.62], { p: [s * 0.69, 1.33, 0.55] });
      b.box("paint", AUTO.canopy, [0.045, 0.1, 0.62], { p: [s * 0.692, 1.02, 0.55] });
      b.rod("metal", PAL.chrome, [s * 0.66, 0.9, -0.42], [s * 0.66, 1.7, -0.42], 0.022, 6);
      b.rod("metal", PAL.chrome, [s * 0.5, 1.0, -1.12], [s * 0.55, 1.7, -1.08], 0.022, 6);
    }
    b.box("metal", AUTO.glass, [1.0, 0.56, 0.03], { p: [0, 1.38, -1.13], r: [-0.12, 0, 0] });

    // Roof rack.
    for (const s of [-1, 1]) {
      b.rod("metal", 0x3a3a3a, [s * 0.64, 1.86, -0.85], [s * 0.64, 1.86, 0.78], 0.018, 5);
      for (const z of [-0.8, 0.72]) b.rod("metal", 0x3a3a3a, [s * 0.62, 1.8, z], [s * 0.64, 1.86, z], 0.015, 4);
    }
    for (const z of [-0.85, 0.78]) b.rod("metal", 0x3a3a3a, [-0.64, 1.86, z], [0.64, 1.86, z], 0.018, 5);

    // Luggage mountain.
    b.rbox("paint", 0xc62828, [0.66, 0.3, 0.92], 0.05, { p: [-0.33, 2.02, 0.25] });
    b.box("paint", 0x3e2723, [0.04, 0.31, 0.93], { p: [-0.18, 2.02, 0.25] });
    b.rbox("paint", 0x283593, [0.6, 0.28, 0.84], 0.05, { p: [0.36, 2.01, 0.3] });
    b.rbox("metal", 0x4f6d8a, [0.62, 0.3, 0.5], 0.03, { p: [-0.15, 2.3, 0.25] });
    b.sphere("cloth", 0xd81b60, 1, { p: [0.28, 2.35, 0.32], s: [0.36, 0.28, 0.38] }, 12, 8, { noAo: true });
    b.sphere("cloth", 0xd81b60, 0.07, { p: [0.28, 2.64, 0.32] }, 6, 5, { noAo: true });
    for (const s of [-1, 1]) {
      b.cone("cloth", 0xd81b60, 0.05, 0.12, { p: [0.28 + s * 0.06, 2.7, 0.32], r: [0, 0, -s * 0.6] }, 6, { noAo: true });
    }
    const roll = [0xf5f5f5, 0x1565c0, 0xf5f5f5, 0x1565c0, 0xf5f5f5] as const;
    roll.forEach((color, i) => {
      b.cyl("cloth", color, 0.18, 0.18, 0.3, { p: [-0.6 + i * 0.3, 2.07, -0.5], r: [0, 0, Math.PI / 2] }, 12, { noAo: true });
    });
    for (const z of [0.05, 0.55]) {
      b.tube("paint", 0xe0c28a, [
        [-0.66, 1.86, z],
        [-0.6, 2.24, z],
        [0, 2.48, z],
        [0.6, 2.24, z],
        [0.66, 1.86, z],
      ], 0.015, 12, 4, { noAo: true });
    }
    nimbuMirchi(b, [-0.3, 1.66, 0.92]);
  },
};

export const BLOCK_SPECS: readonly VariantSpec[] = [TRUCK_SPEC, CHAI_TAPRI_SPEC, SACK_CART_SPEC, AUTO_LOADED_SPEC];
