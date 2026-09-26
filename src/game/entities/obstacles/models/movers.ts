import * as THREE from "three";
import type { Vec3 } from "../ModelBuilder";
import type { VariantSpec } from "../types";
import { MOVER_ANIM } from "@/game/config/obstacles";
import { PAL, head, spokedWheel } from "./common";

/**
 * WEAVING obstacles (kind "moving", jumpable, top ≤ 1.5 m). Models face +X
 * (their walking / riding direction); the Obstacle yaws the variant root
 * toward its lateral velocity and turns through facing the runner.
 */

function gait(speed: number): number {
  const g = speed / MOVER_ANIM.fullGaitSpeed;
  return g > 1 ? 1 : g;
}

// ----------------------------------------------------------------------- cow

const COW = {
  body: 0xf3eee4,
  shade: 0xdcd5c8,
  legs: 0xd4ccbf,
  hoof: 0x2b2622,
  muzzle: 0x9c8a82,
  hornBase: 0xff7b1c,
  hornTip: 0x1e6fff,
  brass: 0xd4a017,
  cloth: 0xc8102e,
  clothTrim: 0xffc53d,
} as const;

const FRONT_HIP: Vec3 = [0.32, 0.82, 0.13];
const BACK_HIP: Vec3 = [-0.55, 0.86, 0.13];

export const COW_SPEC: VariantSpec = {
  id: "cow",
  parts: ["head", "legFL", "legFR", "legBL", "legBR", "tail"],
  ao: { height: 0.5, min: 0.62 },
  build(b) {
    // --- barrel body, rump, chest, hump
    b.sphere("paint", COW.body, 1, { p: [-0.1, 0.9, 0], s: [0.64, 0.3, 0.27] }, 16, 10);
    b.sphere("paint", COW.body, 1, { p: [-0.52, 0.95, 0], s: [0.3, 0.3, 0.26] }, 12, 9);
    b.sphere("paint", COW.body, 1, { p: [0.3, 0.92, 0], s: [0.3, 0.32, 0.26] }, 12, 9);
    b.sphere("paint", COW.shade, 1, { p: [0.3, 1.19, 0], s: [0.19, 0.17, 0.14], r: [0, 0, -0.25] }, 10, 7);
    // Neck + dewlap.
    b.rod("paint", COW.shade, [0.46, 1.0, 0], [0.74, 1.1, 0], 0.15, 10, undefined, 0.11);
    b.sphere("paint", COW.shade, 1, { p: [0.53, 0.8, 0], s: [0.14, 0.15, 0.05] }, 8, 6);

    // --- festive jhool (cloth) draped over the back
    b.add(
      "cloth",
      new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, Math.PI / 2 - 1.25, 2.5),
      COW.cloth,
      { p: [-0.14, 0.93, 0], r: [0, 0, Math.PI / 2], s: [0.335, 0.66, 0.3] },
      { noAo: true }
    );
    for (const z of [-0.286, 0.286]) {
      b.rod("metal", COW.clothTrim, [-0.47, 1.035, z], [0.19, 1.035, z], 0.018, 5, { noAo: true });
      for (let i = 0; i < 4; i++) {
        b.cone("metal", COW.clothTrim, 0.022, 0.07, { p: [-0.4 + i * 0.18, 0.99, z * 1.03], r: [Math.PI, 0, 0] }, 5, { noAo: true });
      }
    }
    // Mirror-work discs on the cloth sides (glint in light).
    for (const z of [-0.252, 0.252]) {
      for (const x of [-0.32, -0.02]) {
        b.cyl("metal", 0xe8f1ff, 0.035, 0.035, 0.01, { p: [x, 1.12, z], r: [Math.PI / 2 - Math.sign(z) * 0.6, 0, 0] }, 8, { noAo: true });
      }
    }

    // --- marigold garland around the neck + brass bell
    const beads = 16;
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * Math.PI * 2;
      const droop = Math.cos(a) < 0 ? -Math.cos(a) * 0.1 : 0;
      b.ico("paint", i % 2 === 0 ? PAL.marigoldOrange : PAL.marigoldYellow, 0.045, {
        p: [0.6 - Math.cos(a) * 0.08, 1.0 + Math.cos(a) * 0.17 - droop, Math.sin(a) * 0.18],
        r: [a, a * 2, 0],
      }, 0, { noAo: true });
    }
    b.lathe("metal", COW.brass, [[0.001, 0.1], [0.03, 0.09], [0.045, 0.03], [0.06, 0]], { p: [0.68, 0.63, 0] }, 10, { noAo: true });

    // --- head (nods while walking)
    b.part("head", 0.72, 1.1, 0);
    b.sphere("paint", COW.body, 1, { p: [0.8, 1.13, 0], s: [0.15, 0.13, 0.12] }, 12, 8);
    b.rod("paint", COW.body, [0.8, 1.1, 0], [0.97, 0.98, 0], 0.1, 10, undefined, 0.075);
    b.sphere("paint", COW.muzzle, 1, { p: [0.985, 0.96, 0], s: [0.075, 0.068, 0.085] }, 10, 7);
    for (const s of [-1, 1]) {
      b.sphere("paint", 0x2a2220, 0.018, { p: [1.045, 0.965, s * 0.035] }, 5, 4);
      b.sphere("paint", 0x111111, 0.023, { p: [0.87, 1.165, s * 0.103] }, 6, 5);
      // Drooping ears.
      b.sphere("paint", COW.shade, 1, { p: [0.79, 1.12, s * 0.17], s: [0.1, 0.03, 0.055], r: [s * 0.5, 0, -0.3] }, 8, 5);
      // Painted horns: orange base, brass band, blue tip.
      const base: Vec3 = [0.79, 1.23, s * 0.07];
      const mid: Vec3 = [0.8, 1.34, s * 0.12];
      const tip: Vec3 = [0.76, 1.44, s * 0.15];
      b.rod("paint", COW.hornBase, base, mid, 0.033, 7, undefined, 0.026);
      b.torus("metal", COW.brass, 0.027, 0.008, { p: mid, r: [Math.PI / 2, 0, 0] }, 4, 10);
      b.rod("paint", COW.hornTip, mid, tip, 0.026, 7, undefined, 0.01);
    }
    // Vermilion tilak on the forehead.
    b.box("glow", 0xff3d00, [0.012, 0.05, 0.022], { p: [0.946, 1.15, 0], r: [0, 0, -0.35] });

    // --- legs (hinged at shoulder / hip)
    const legNames = ["legFL", "legFR", "legBL", "legBR"] as const;
    legNames.forEach((name, i) => {
      const front = i < 2;
      const z = (i % 2 === 0 ? 1 : -1) * FRONT_HIP[2];
      const hip = front ? FRONT_HIP : BACK_HIP;
      b.part(name, hip[0], hip[1], z);
      if (front) {
        b.rod("paint", COW.body, [hip[0], hip[1], z], [hip[0] + 0.01, 0.45, z], 0.066, 8, undefined, 0.05);
        b.sphere("paint", COW.legs, 0.05, { p: [hip[0] + 0.01, 0.45, z] }, 7, 5);
        b.rod("paint", COW.legs, [hip[0] + 0.01, 0.45, z], [hip[0] + 0.015, 0.09, z], 0.042, 7, undefined, 0.036);
        b.cyl("paint", COW.hoof, 0.046, 0.052, 0.08, { p: [hip[0] + 0.02, 0.04, z] }, 8);
      } else {
        b.sphere("paint", COW.body, 1, { p: [hip[0], 0.74, z * 0.92], s: [0.13, 0.2, 0.1] }, 9, 7);
        b.rod("paint", COW.legs, [hip[0], 0.7, z], [hip[0] - 0.05, 0.42, z], 0.058, 8, undefined, 0.044);
        b.sphere("paint", COW.legs, 0.046, { p: [hip[0] - 0.05, 0.42, z] }, 7, 5);
        b.rod("paint", COW.legs, [hip[0] - 0.05, 0.42, z], [hip[0] - 0.02, 0.09, z], 0.04, 7, undefined, 0.035);
        b.cyl("paint", COW.hoof, 0.045, 0.05, 0.08, { p: [hip[0] - 0.015, 0.04, z] }, 8);
      }
    });

    // --- swishing tail
    b.part("tail", -0.8, 1.13, 0);
    b.rod("paint", COW.shade, [-0.8, 1.13, 0], [-0.86, 0.56, 0], 0.022, 6, undefined, 0.015);
    b.sphere("paint", COW.hoof, 1, { p: [-0.865, 0.49, 0], s: [0.045, 0.09, 0.045] }, 7, 5);
    b.base();
  },
  spawn(parts) {
    for (const p of parts) p.rotation.set(0, 0, 0);
  },
  animate(parts, s) {
    const g = gait(s.speed);
    const phase = s.travel * MOVER_ANIM.cowStridePerMeter;
    const swing = Math.sin(phase) * MOVER_ANIM.cowLegSwing * g;
    // Diagonal pairs move together (walk/trot).
    parts[1].rotation.z = swing;
    parts[4].rotation.z = swing;
    parts[2].rotation.z = -swing;
    parts[3].rotation.z = -swing;
    // Head nods with the stride; idles with a slow graze-bob.
    parts[0].rotation.z = Math.sin(phase * 2) * 0.05 * g + Math.sin(s.time * 0.9) * 0.06 * (1 - g);
    parts[0].rotation.y = Math.sin(s.time * 0.7) * 0.12;
    // Tail swats flies.
    parts[5].rotation.x = Math.sin(s.time * 2.6) * 0.38;
    parts[5].rotation.z = -0.1 + Math.sin(s.time * 1.3) * 0.08;
  },
};

// ------------------------------------------------------------ cycle rickshaw

const RICKSHAW = {
  frame: 0x1c1d24,
  carriage: 0x1565c0,
  trim: 0xffc107,
  seat: 0xc62828,
  hood: 0x6d1b3a,
  vest: 0xf1efe6,
  lungi: 0x00897b,
  gamchha: 0xd32f2f,
} as const;

const R_WHEEL = MOVER_ANIM.rickshawWheelRadius;
const FRONT_WHEEL: Vec3 = [0.8, R_WHEEL, 0];
const REAR_AXLE: Vec3 = [-0.62, R_WHEEL, 0];
const CRANK: Vec3 = [0.22, 0.42, 0];
const HIP_L: Vec3 = [0.16, 0.95, 0.1];
const HIP_R: Vec3 = [0.16, 0.95, -0.1];

export const CYCLE_RICKSHAW_SPEC: VariantSpec = {
  id: "cycleRickshaw",
  parts: ["wheelFront", "wheelsRear", "crank", "legL", "legR"],
  ao: { height: 0.35, min: 0.7 },
  build(b) {
    // --- frame
    const f = RICKSHAW.frame;
    b.rod("metal", f, [0.8, R_WHEEL, 0], [0.73, 0.95, 0], 0.026, 6);
    b.rod("metal", f, [0.73, 0.95, 0], [0.7, 1.05, 0], 0.022, 6);
    b.rod("metal", PAL.chrome, [0.68, 1.05, -0.27], [0.68, 1.05, 0.27], 0.017, 6);
    for (const z of [-0.29, 0.29]) b.cyl("paint", PAL.black, 0.024, 0.024, 0.09, { p: [0.68, 1.05, z], r: [Math.PI / 2, 0, 0] }, 6);
    b.lathe("metal", 0xd4a017, [[0.001, 0.04], [0.03, 0.03], [0.036, 0]], { p: [0.7, 1.07, 0.17] }, 8);
    b.rod("metal", f, [0.72, 0.9, 0], CRANK, 0.032, 6);
    b.rod("metal", f, [0.72, 0.93, 0], [0.18, 0.88, 0], 0.028, 6);
    b.rod("metal", f, [0.17, 0.92, 0], CRANK, 0.03, 6);
    b.rod("metal", f, CRANK, [-0.22, 0.5, 0], 0.03, 6);
    // Saddle.
    b.rbox("paint", 0x3e2723, [0.26, 0.07, 0.17], 0.03, { p: [0.16, 0.955, 0] });

    // --- passenger carriage
    b.rod("metal", f, [-0.22, 0.5, -0.42], [-0.22, 0.5, 0.42], 0.025, 6);
    for (const z of [-0.42, 0.42]) b.rod("metal", f, [-0.22, 0.5, z], [-0.92, 0.5, z], 0.024, 6);
    b.rod("metal", f, [-0.62, R_WHEEL, -0.5], [-0.62, R_WHEEL, 0.5], 0.022, 6);
    b.box("paint", PAL.woodLight, [0.22, 0.04, 0.9], { p: [-0.22, 0.54, 0] });
    b.rbox("paint", RICKSHAW.carriage, [0.54, 0.28, 0.9], 0.05, { p: [-0.6, 0.68, 0] });
    for (const z of [-0.452, 0.452]) {
      b.box("paint", RICKSHAW.trim, [0.5, 0.05, 0.01], { p: [-0.6, 0.66, z] });
      b.box("glow", PAL.reflectorRed, [0.08, 0.05, 0.01], { p: [-0.84, 0.66, z * 1.012] });
    }
    b.box("paint", RICKSHAW.trim, [0.01, 0.05, 0.84], { p: [-0.33, 0.66, 0] });
    b.rbox("paint", RICKSHAW.seat, [0.5, 0.11, 0.86], 0.04, { p: [-0.6, 0.87, 0] });
    b.rbox("paint", RICKSHAW.seat, [0.08, 0.36, 0.86], 0.035, { p: [-0.86, 1.03, 0], r: [0, 0, 0.14] });
    for (const z of [-0.43, 0.43]) b.rod("metal", PAL.chrome, [-0.86, 1.0, z], [-0.38, 0.93, z], 0.014, 5);
    // Mudguards over the rear wheels.
    for (const z of [-0.5, 0.5]) {
      b.torus("paint", RICKSHAW.carriage, R_WHEEL + 0.04, 0.02, { p: [-0.62, R_WHEEL, z], r: [0, 0, 0.35] }, 3, 12, Math.PI * 0.72);
    }

    // --- folded hood with a festive fringe
    b.add(
      "cloth",
      new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, Math.PI * 0.85, Math.PI * 0.75),
      RICKSHAW.hood,
      { p: [-0.9, 1.08, 0], r: [Math.PI / 2, 0, 0], s: [0.22, 0.88, 0.24] },
      { noAo: true }
    );
    for (let i = 0; i < 7; i++) {
      const z = -0.39 + i * 0.13;
      b.cone("paint", i % 2 === 0 ? RICKSHAW.trim : 0xff4081, 0.025, 0.07, { p: [-0.79, 1.255, z], r: [Math.PI, 0, 0] }, 5, { noAo: true });
    }

    // --- rider (hunched over the bars)
    b.rbox("paint", RICKSHAW.lungi, [0.26, 0.18, 0.3], 0.07, { p: [0.16, 0.99, 0] });
    b.sphere("paint", RICKSHAW.vest, 1, { p: [0.33, 1.17, 0], s: [0.15, 0.22, 0.165], r: [0, 0, -0.78] }, 12, 9);
    for (const s of [-1, 1]) {
      const shoulder: Vec3 = [0.45, 1.27, s * 0.15];
      const elbow: Vec3 = [0.55, 1.12, s * 0.21];
      const hand: Vec3 = [0.67, 1.06, s * 0.25];
      b.rod("paint", PAL.skin, shoulder, elbow, 0.042, 6, undefined, 0.036);
      b.rod("paint", PAL.skin, elbow, hand, 0.036, 6, undefined, 0.032);
      b.sphere("paint", PAL.skin, 0.036, { p: hand }, 6, 4);
    }
    b.rod("paint", PAL.skin, [0.46, 1.29, 0], [0.52, 1.34, 0], 0.045, 6);
    head(b, [0.565, 1.385, 0], 0.092, "x", 1);
    b.torus("cloth", RICKSHAW.gamchha, 0.093, 0.026, { p: [0.56, 1.41, 0], r: [Math.PI / 2, 0.12, 0] }, 5, 14, Math.PI * 2, { noAo: true });
    b.sphere("cloth", RICKSHAW.gamchha, 0.04, { p: [0.46, 1.41, 0] }, 6, 4, { noAo: true });

    // --- animated parts
    b.part("wheelFront", FRONT_WHEEL[0], FRONT_WHEEL[1], FRONT_WHEEL[2]);
    spokedWheel(b, FRONT_WHEEL, R_WHEEL, "z", 8);
    b.part("wheelsRear", REAR_AXLE[0], REAR_AXLE[1], REAR_AXLE[2]);
    for (const z of [-0.5, 0.5]) spokedWheel(b, [REAR_AXLE[0], R_WHEEL, z], R_WHEEL, "z", 8);
    b.part("crank", CRANK[0], CRANK[1], CRANK[2]);
    b.torus("metal", 0xb0b4bb, 0.1, 0.012, { p: [CRANK[0], CRANK[1], 0.05] }, 3, 16);
    b.rod("metal", PAL.chrome, [CRANK[0], CRANK[1], 0.08], [CRANK[0], CRANK[1] - 0.16, 0.08], 0.013, 4);
    b.rod("metal", PAL.chrome, [CRANK[0], CRANK[1], -0.08], [CRANK[0], CRANK[1] + 0.16, -0.08], 0.013, 4);
    b.box("paint", PAL.black, [0.09, 0.025, 0.07], { p: [CRANK[0], CRANK[1] - 0.16, 0.12] });
    b.box("paint", PAL.black, [0.09, 0.025, 0.07], { p: [CRANK[0], CRANK[1] + 0.16, -0.12] });
    for (const [name, hip] of [["legL", HIP_L], ["legR", HIP_R]] as const) {
      b.part(name, hip[0], hip[1], hip[2]);
      const knee: Vec3 = [0.39, 0.77, hip[2]];
      const ankle: Vec3 = [0.26, 0.37, hip[2]];
      b.rod("paint", RICKSHAW.lungi, hip, knee, 0.066, 7, undefined, 0.056);
      b.rod("paint", PAL.skin, knee, ankle, 0.046, 6, undefined, 0.038);
      b.rbox("paint", 0x4e342e, [0.15, 0.04, 0.075], 0.015, { p: [0.29, 0.34, hip[2]] });
    }
    b.base();
  },
  spawn(parts) {
    for (const p of parts) p.rotation.set(0, 0, 0);
  },
  animate(parts, s) {
    const roll = -s.travel / R_WHEEL;
    parts[0].rotation.z = roll;
    parts[1].rotation.z = roll;
    const crank = roll * MOVER_ANIM.rickshawCrankRatio;
    parts[2].rotation.z = crank;
    const g = gait(s.speed);
    const pump = Math.sin(crank) * MOVER_ANIM.rickshawLegSwing * (0.35 + 0.65 * g);
    parts[3].rotation.z = pump;
    parts[4].rotation.z = -pump;
  },
};

export const MOVER_SPECS: readonly VariantSpec[] = [COW_SPEC, CYCLE_RICKSHAW_SPEC];
