import * as THREE from "three";
import type { ModelBuilder, Vec3 } from "../ModelBuilder";
import type { VariantSpec } from "../types";
import { artUv } from "../ObstacleArt";
import { PAL, spokedWheel } from "./common";

/**
 * JUMP obstacles (kind "barrier", top ≤ 1.2 m): police barricade, sabzi
 * thela and a road-work diversion. Front (+Z) faces the runner.
 */

// ------------------------------------------------------------ police barricade

export const POLICE_BARRICADE: VariantSpec = {
  id: "policeBarricade",
  parts: ["beaconRed", "beaconBlue"],
  build(b) {
    const frame = 0x30343d;
    const cap = 0xffc400;
    for (const x of [-1.0, 1.0]) {
      b.rod("metal", frame, [x, 0.04, 0], [x, 1.06, 0], 0.042, 8);
      b.rod("metal", frame, [x, 0.045, -0.3], [x, 0.045, 0.3], 0.038, 6);
      b.rod("metal", frame, [x, 0.42, 0], [x, 0.06, 0.24], 0.02, 5);
      b.rod("metal", frame, [x, 0.42, 0], [x, 0.06, -0.24], 0.02, 5);
      for (const z of [-0.3, 0.3]) b.rbox("paint", PAL.black, [0.11, 0.06, 0.11], 0.02, { p: [x, 0.03, z] });
      b.sphere("paint", cap, 0.05, { p: [x, 1.07, 0] }, 8, 6);
    }
    b.rod("metal", frame, [-1.0, 1.06, 0], [1.0, 1.06, 0], 0.04, 8);
    b.rod("metal", frame, [-1.0, 0.42, 0], [1.0, 0.42, 0], 0.034, 8);

    // Striped board (art on the runner-facing side, plain back).
    b.box("paint", 0x1c1c1c, [1.94, 0.5, 0.05], { p: [0, 0.74, 0] });
    b.plane("art", 0xffffff, 1.92, 0.48, { p: [0, 0.74, 0.0265] }, { uv: artUv("police"), noAo: true });

    // Retro-reflective studs + strip (always readable, day and night).
    for (let i = 0; i < 6; i++) {
      const x = -0.85 + i * 0.34;
      b.box("glow", i % 2 === 0 ? PAL.reflectorRed : PAL.reflectorWhite, [0.13, 0.045, 0.02], { p: [x, 1.06, 0.045] });
    }
    b.box("glow", 0xffe066, [1.86, 0.028, 0.02], { p: [0, 0.42, 0.04] });

    // Police beacon on the left post (alternating red / blue).
    b.cyl("metal", PAL.black, 0.058, 0.066, 0.04, { p: [-1.0, 1.1, 0] }, 10);
    b.part("beaconRed");
    b.sphere("glow", 0xff1f1f, 0.05, { p: [-1.0, 1.135, 0], s: [1, 0.8, 1] }, 8, 6);
    b.part("beaconBlue");
    b.sphere("glow", 0x2a6bff, 0.05, { p: [-1.0, 1.135, 0], s: [1, 0.8, 1] }, 8, 6);
    b.base();
  },
  animate(parts, s) {
    const red = Math.sin(s.time * 10) > 0;
    parts[0].visible = red;
    parts[1].visible = !red;
  },
};

// ------------------------------------------------------------------ sabzi thela

/** Half-dome produce heap + individual fruits scattered over its surface. */
function produceHeap(
  b: ModelBuilder,
  center: Vec3,
  radii: Vec3,
  heapColor: number,
  fruit: { colors: readonly number[]; r: number; count: number; stretch?: Vec3 },
  seed: number
): void {
  b.add(
    "paint",
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    heapColor,
    { p: center, s: radii }
  );
  let s = seed;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < fruit.count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = 0.15 + rand() * 1.1;
    const p: Vec3 = [
      center[0] + Math.sin(phi) * Math.cos(theta) * radii[0] * 0.95,
      center[1] + Math.cos(phi) * radii[1] * 0.98,
      center[2] + Math.sin(phi) * Math.sin(theta) * radii[2] * 0.95,
    ];
    b.sphere("paint", fruit.colors[i % fruit.colors.length], fruit.r, {
      p,
      r: [rand() * 3, rand() * 3, rand() * 3],
      s: fruit.stretch ?? [1, 0.92, 1],
    }, 7, 5);
  }
}

/** Wooden flatbed handcart with four spoked wheels (shared by thela + sack cart). */
export function buildCart(b: ModelBuilder, bedY: number, paint: number, trim: number, rimH = 0.16): void {
  const halfX = 1.03;
  const halfZ = 0.5;
  b.box("paint", PAL.wood, [halfX * 2, 0.08, halfZ * 2], { p: [0, bedY, 0] });
  // Painted rim boards with a contrasting trim line.
  const rimY = bedY + 0.04 + rimH / 2;
  b.box("paint", paint, [halfX * 2 + 0.04, rimH, 0.05], { p: [0, rimY, halfZ] });
  b.box("paint", paint, [halfX * 2 + 0.04, rimH, 0.05], { p: [0, rimY, -halfZ] });
  b.box("paint", paint, [0.05, rimH, halfZ * 2], { p: [-halfX, rimY, 0] });
  b.box("paint", paint, [0.05, rimH, halfZ * 2], { p: [halfX, rimY, 0] });
  b.box("paint", trim, [halfX * 2 + 0.06, 0.03, 0.06], { p: [0, rimY + rimH / 2, halfZ] });
  b.box("paint", trim, [halfX * 2 + 0.06, 0.03, 0.06], { p: [0, rimY + rimH / 2, -halfZ] });
  // Under-frame beams + axle brackets.
  for (const z of [-0.36, 0.36]) b.box("paint", PAL.woodDark, [1.96, 0.07, 0.07], { p: [0, bedY - 0.075, z] });
  const wheelR = Math.min(0.36, bedY - 0.1);
  for (const x of [-0.62, 0.62]) {
    b.rod("metal", PAL.steelDark, [x, wheelR, -0.56], [x, wheelR, 0.56], 0.022, 6);
    b.rod("metal", PAL.steelDark, [x, wheelR, 0.36], [x, bedY - 0.1, 0.36], 0.02, 5);
    b.rod("metal", PAL.steelDark, [x, wheelR, -0.36], [x, bedY - 0.1, -0.36], 0.02, 5);
    for (const z of [-0.56, 0.56]) spokedWheel(b, [x, wheelR, z], wheelR, "z", 8);
  }
  // Pushing handles (short stubs keep the footprint inside the collider).
  for (const z of [-0.3, 0.3]) {
    b.rod("paint", PAL.woodDark, [halfX, bedY + 0.05, z], [halfX + 0.05, bedY + 0.1, z], 0.028, 6);
  }
  // Reflectors on the corners of the runner-facing rim.
  for (const x of [-0.95, 0.95]) {
    b.box("glow", PAL.reflectorRed, [0.1, 0.06, 0.012], { p: [x, rimY, halfZ + 0.032] });
  }
}

export const THELA: VariantSpec = {
  id: "thela",
  build(b) {
    const bedY = 0.78;
    buildCart(b, bedY, 0x1e88e5, 0xffd54f);
    const top = bedY + 0.05;
    produceHeap(b, [-0.66, top, 0], [0.31, 0.22, 0.42], 0xc62828, {
      colors: [0xe53935, 0xd32f2f, 0xef5350],
      r: 0.07,
      count: 9,
    }, 11);
    produceHeap(b, [0.0, top, 0], [0.3, 0.2, 0.42], 0x8e3b5f, {
      colors: [0xa64d79, 0xc2668f, 0x9c3d6b],
      r: 0.068,
      count: 8,
      stretch: [1, 1.12, 1],
    }, 23);
    produceHeap(b, [0.64, top, 0], [0.31, 0.23, 0.42], 0xef8f00, {
      colors: [0xffb300, 0xffa000, 0x9ccc65],
      r: 0.078,
      count: 8,
      stretch: [1.18, 0.95, 0.95],
    }, 37);
    // Leafy greens bundle tucked along the back rim.
    for (let i = 0; i < 5; i++) {
      const x = -0.8 + i * 0.4;
      b.ico("paint", i % 2 === 0 ? PAL.leaf : PAL.leafLight, 0.11, {
        p: [x, top + 0.1, -0.36],
        s: [1.2, 0.8, 0.7],
        r: [0, i, 0],
      }, 1);
    }
    // Hanging brass weighing pan (tarazu) at the handle end.
    b.rod("paint", PAL.woodDark, [0.98, top, -0.4], [0.98, 1.16, -0.4], 0.018, 5);
    b.rod("metal", 0xc9a227, [0.86, 1.14, -0.4], [1.02, 1.14, -0.4], 0.01, 4);
    b.cyl("metal", 0xc9a227, 0.07, 0.045, 0.03, { p: [0.88, 1.02, -0.4] }, 10);
  },
};

// ------------------------------------------------------------- road work board

export const ROAD_WORK: VariantSpec = {
  id: "roadWork",
  parts: ["lampL", "lampR"],
  build(b) {
    const orange = 0xff6d00;
    for (const x of [-0.93, 0.93]) {
      b.rod("metal", orange, [x, 1.0, 0], [x, 0.03, 0.27], 0.03, 6);
      b.rod("metal", orange, [x, 1.0, 0], [x, 0.03, -0.27], 0.03, 6);
      b.rod("metal", 0xffffff, [x, 0.3, 0.19], [x, 0.3, -0.19], 0.018, 5);
      for (const z of [-0.29, 0.29]) {
        b.rbox("paint", PAL.jute, [0.34, 0.11, 0.2], 0.05, { p: [x, 0.055, z] });
        b.box("paint", PAL.juteDark, [0.02, 0.1, 0.19], { p: [x - 0.1, 0.06, z] });
      }
      // Amber blinker housing.
      b.cyl("paint", PAL.black, 0.055, 0.055, 0.06, { p: [x, 1.0, 0] }, 10);
    }
    // Upper sign board: DIVERSION.
    b.box("paint", 0x1c1c1c, [2.02, 0.44, 0.04], { p: [0, 0.76, 0] });
    b.plane("art", 0xffffff, 2.0, 0.42, { p: [0, 0.76, 0.0215] }, { uv: artUv("diversion"), noAo: true });
    // Lower chevron board.
    b.box("paint", 0x1c1c1c, [2.02, 0.26, 0.04], { p: [0, 0.34, 0] });
    b.plane("art", 0xffffff, 2.0, 0.25, { p: [0, 0.34, 0.0215] }, { uv: artUv("chevron"), noAo: true });
    // A cone parked on the board's foot for scale.
    b.cone("paint", orange, 0.12, 0.42, { p: [0.55, 0.21, 0.16] }, 12);
    b.cyl("glow", PAL.reflectorWhite, 0.07, 0.085, 0.07, { p: [0.55, 0.24, 0.16] }, 12);
    b.box("paint", PAL.black, [0.3, 0.03, 0.3], { p: [0.55, 0.015, 0.16] });

    b.part("lampL");
    b.sphere("glow", 0xffb300, 0.05, { p: [-0.93, 1.06, 0] }, 8, 6);
    b.part("lampR");
    b.sphere("glow", 0xffb300, 0.05, { p: [0.93, 1.06, 0] }, 8, 6);
    b.base();
  },
  animate(parts, s) {
    const on = Math.sin(s.time * 7) > 0;
    parts[0].visible = on;
    parts[1].visible = !on;
  },
};

export const BARRIER_SPECS: readonly VariantSpec[] = [POLICE_BARRICADE, THELA, ROAD_WORK];
