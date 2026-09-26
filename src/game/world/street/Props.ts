import { FACE_ALL, FACE_NY, type GeometryBuilder, type UvRect } from "../gfx/GeometryBuilder";
import { rChance, rInt, rPick, rRange, type Rng } from "../gfx/random";
import type { FacadeAtlas } from "../textures/FacadeAtlas";
import type { PropKind } from "@/game/config/buildings";

/**
 * Low-poly roadside props baked into row variants. Each builder works in a
 * local frame: origin on the footpath surface, +X toward the road, +Z along
 * the street. Callers position/rotate via the builder transform stack and
 * use PROP_RADIUS to keep props outside the lanes (|x| ≥ STREET.propMinX).
 */

export const PROP_RADIUS: Readonly<Record<PropKind, number>> = {
  scooter: 0.95,
  cycle: 0.9,
  cart: 1.05,
  cow: 0.95,
  bench: 0.85,
  shrine: 0.5,
  sacks: 0.6,
  drum: 0.36,
  cylinders: 0.45,
  chairs: 0.6,
  pots: 0.7,
  umbrella: 1.05,
  crates: 0.6,
};

const SCOOTER_COLORS = [0xc0271f, 0x1f4fa8, 0x1b1b1b, 0xf1efe8, 0xe8b21a, 0x2f7a4a, 0x7a1f5a, 0x9aa3ab];
const CHAIR_COLORS = [0xd8322a, 0x2a6fd6, 0x2f9e4f, 0xf2f2f2];

interface PropUvs {
  white: UvRect;
  wood: UvRect;
  metal: UvRect;
  fabric: UvRect;
  wheel: UvRect;
  wheelSolid: UvRect;
  tank: UvRect;
  sacks: UvRect;
  fruit: UvRect;
  veg: UvRect;
  lamp: UvRect;
  shrine: UvRect;
  concrete: UvRect;
}

function uvsFor(atlas: FacadeAtlas): PropUvs {
  return {
    white: atlas.uv("white"),
    wood: atlas.uv("wood"),
    metal: atlas.uv("metal"),
    fabric: atlas.uv("fabric"),
    wheel: atlas.uv("wheel"),
    wheelSolid: atlas.uv("wheelSolid"),
    tank: atlas.uv("tank"),
    sacks: atlas.uv("sacks"),
    fruit: atlas.uv("fruit"),
    veg: atlas.uv("veg"),
    lamp: atlas.uv("lamp"),
    shrine: atlas.uv("shrine"),
    concrete: atlas.uv("concrete"),
  };
}

export function buildProp(b: GeometryBuilder, atlas: FacadeAtlas, kind: PropKind, rng: Rng, festive: boolean): void {
  const uv = uvsFor(atlas);
  const prev = b.color;
  switch (kind) {
    case "scooter":
      scooter(b, uv, rng);
      break;
    case "cycle":
      cycle(b, uv, rng);
      break;
    case "cart":
      cart(b, uv, rng);
      break;
    case "cow":
      cow(b, uv, rng, festive);
      break;
    case "bench":
      bench(b, uv, rng);
      break;
    case "shrine":
      shrine(b, uv);
      break;
    case "sacks":
      sacks(b, uv, rng);
      break;
    case "drum":
      b.color = 0x2a6fd6;
      b.cylinder(0, 0, 0, 0.3, 0.3, 0.88, 10, uv.white, true);
      b.color = 0x1f55a8;
      b.cylinder(0, 0.88, 0, 0.26, 0.26, 0.05, 10, uv.white, true);
      b.cylinder(0, 0.3, 0, 0.31, 0.31, 0.05, 10, uv.white, false);
      b.cylinder(0, 0.6, 0, 0.31, 0.31, 0.05, 10, uv.white, false);
      break;
    case "cylinders":
      for (let i = 0; i < rInt(rng, 2, 3); i++) {
        b.push().translate(rRange(rng, -0.2, 0.2), 0, -0.22 + i * 0.28);
        b.color = 0xd23427;
        b.cylinder(0, 0, 0, 0.15, 0.15, 0.58, 10, uv.white, false);
        b.sphere(0, 0.58, 0, 0.15, 0.08, 0.15, 10, 3, uv.white, Math.PI / 2);
        b.color = 0x3a3a3a;
        b.cylinder(0, 0.64, 0, 0.05, 0.05, 0.1, 6, uv.white, true);
        b.pop();
      }
      break;
    case "chairs":
      for (let i = 0; i < 2; i++) {
        b.push().translate(0, 0, i * 0.62 - 0.3).rotateY(rRange(rng, -0.4, 0.4));
        chair(b, uv, rPick(rng, CHAIR_COLORS));
        b.pop();
      }
      break;
    case "pots":
      pots(b, uv, rng);
      break;
    case "umbrella":
      umbrellaStall(b, uv, rng);
      break;
    case "crates":
      crates(b, uv, rng);
      break;
  }
  b.color = prev;
}

function wheelPair(b: GeometryBuilder, uv: UvRect, radius: number, zFront: number, zBack: number, halfWidth = 0): void {
  for (const z of [zFront, zBack]) {
    b.discX(halfWidth, radius, z, radius, 12, uv);
  }
}

function scooter(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  const body = rPick(rng, SCOOTER_COLORS);
  b.color = 0xffffff;
  wheelPair(b, uv.wheelSolid, 0.23, 0.6, -0.62);
  b.color = 0x2a2a2a;
  b.box(-0.18, 0.28, -0.3, 0.18, 0.38, 0.4, uv.white);
  b.color = body;
  // Rear body shell + tail.
  b.box(-0.24, 0.34, -0.82, 0.24, 0.78, -0.12, uv.metal);
  b.box(-0.2, 0.5, -0.95, 0.2, 0.74, -0.82, uv.metal);
  // Leg shield + front mudguard.
  b.push().translate(0, 0.35, 0.42).rotateX(-0.18);
  b.box(-0.22, 0, -0.06, 0.22, 0.66, 0.06, uv.metal);
  b.pop();
  b.box(-0.12, 0.42, 0.44, 0.12, 0.52, 0.8, uv.metal);
  // Seat.
  b.color = 0x1c1c1c;
  b.box(-0.17, 0.78, -0.72, 0.17, 0.9, -0.14, uv.white);
  // Handlebar column + bar + headlight.
  b.color = body;
  b.box(-0.06, 0.95, 0.4, 0.06, 1.12, 0.52, uv.metal);
  b.color = 0x1c1c1c;
  b.box(-0.36, 1.1, 0.42, 0.36, 1.15, 0.5, uv.white);
  b.color = 0xffffff;
  b.box(-0.08, 0.98, 0.53, 0.08, 1.08, 0.58, uv.lamp);
  // Side stand lean: rear mirrors.
  b.color = 0x2a2a2a;
  b.box(-0.3, 1.15, 0.44, -0.27, 1.32, 0.47, uv.white);
  b.box(0.27, 1.15, 0.44, 0.3, 1.32, 0.47, uv.white);
}

function cycle(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  const frame = rPick(rng, [0x1d1d1d, 0x2f5a2f, 0x7a1f1f, 0x1f3f7a]);
  b.color = 0xffffff;
  wheelPair(b, uv.wheel, 0.34, 0.55, -0.55);
  b.color = frame;
  const tube = (p0: [number, number, number], p1: [number, number, number]): void => {
    b.tube([p0, p1], 0.025, uv.white);
  };
  tube([0, 0.34, -0.55], [0, 0.72, -0.2]);
  tube([0, 0.34, -0.55], [0, 0.34, 0.05]);
  tube([0, 0.34, 0.05], [0, 0.72, -0.2]);
  tube([0, 0.72, -0.2], [0, 0.78, 0.42]);
  tube([0, 0.34, 0.05], [0, 0.78, 0.42]);
  tube([0, 0.78, 0.42], [0, 0.34, 0.55]);
  tube([0, 0.78, 0.42], [0, 0.98, 0.4]);
  tube([-0.28, 0.98, 0.4], [0.28, 0.98, 0.4]);
  b.color = 0x1a1a1a;
  b.box(-0.08, 0.8, -0.3, 0.08, 0.85, -0.1, uv.white);
  // Carrier rack + basket sometimes.
  if (rChance(rng, 0.5)) {
    b.color = 0x6b5a3a;
    b.box(-0.16, 0.8, 0.46, 0.16, 1.0, 0.72, uv.wood, FACE_ALL & ~FACE_NY);
  }
}

function cart(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  const wood = rPick(rng, [0x8a5a34, 0x6b4a2a, 0x2f6b8a]);
  b.color = wood;
  // Platform on legs.
  b.box(-0.48, 0.72, -0.9, 0.48, 0.82, 0.9, uv.wood);
  for (const z of [-0.8, 0.8]) {
    b.box(-0.04, 0, z - 0.04, 0.04, 0.72, z + 0.04, uv.wood);
  }
  b.color = 0xffffff;
  b.discX(0.52, 0.42, 0, 0.42, 14, uv.wheel);
  b.discX(-0.52, 0.42, 0, 0.42, 14, uv.wheel);
  // Handles.
  b.color = wood;
  b.tube([[-0.35, 0.8, -0.9], [-0.35, 0.95, -1.35]], 0.03, uv.white);
  b.tube([[0.35, 0.8, -0.9], [0.35, 0.95, -1.35]], 0.03, uv.white);
  // Heap of produce (two mounds).
  b.color = 0xffffff;
  const produce = rChance(rng, 0.5) ? uv.fruit : uv.veg;
  b.sphere(0, 0.82, -0.4, 0.44, 0.26, 0.42, 8, 4, produce, Math.PI / 2);
  b.sphere(0, 0.82, 0.4, 0.44, 0.24, 0.42, 8, 4, produce, Math.PI / 2);
  if (rChance(rng, 0.45)) {
    // Faded market umbrella.
    b.color = rPick(rng, [0xe0452b, 0x2a6fd6, 0xf2c21a, 0x2f9e4f]);
    b.tube([[0, 0.82, 0.9], [0, 2.1, 0.2]], 0.025, uv.white);
    b.push().translate(0, 2.08, 0.15);
    b.cylinder(0, 0, 0, 0.95, 0.02, 0.45, 8, uv.fabric, false, true);
    b.pop();
  }
}

function cow(b: GeometryBuilder, uv: PropUvs, rng: Rng, festive: boolean): void {
  // Street cow resting on the footpath (+Z = head): zebu hump, folded legs.
  const hide = rPick(rng, [0xf1ece0, 0xe6dfd0, 0xd4ccbd, 0x9a8570, 0xc9b79c]);
  const dark = 0x2e2926;
  b.color = hide;
  b.sphere(0, 0.36, -0.1, 0.36, 0.3, 0.72, 10, 6, uv.white);
  b.sphere(0, 0.64, 0.3, 0.2, 0.2, 0.22, 8, 5, uv.white);
  b.push().translate(0, 0.62, 0.62).rotateX(-0.35);
  b.box(-0.13, -0.12, -0.18, 0.13, 0.14, 0.2, uv.white);
  b.pop();
  // Dewlap under the neck.
  b.color = scale(hide, 0.9);
  b.box(-0.05, 0.3, 0.52, 0.05, 0.55, 0.72, uv.white);
  // Head (slightly lowered, looking at the street).
  b.push().translate(0.04, 0.72, 0.9).rotateX(0.45).rotateY(0.25);
  b.color = hide;
  b.box(-0.14, -0.13, -0.14, 0.14, 0.13, 0.26, uv.white);
  b.color = dark;
  b.box(-0.11, -0.12, 0.25, 0.11, 0.06, 0.32, uv.white);
  b.box(-0.145, 0.0, 0.02, -0.135, 0.05, 0.08, uv.white);
  b.box(0.135, 0.0, 0.02, 0.145, 0.05, 0.08, uv.white);
  b.color = scale(hide, 0.85);
  b.box(-0.3, 0.05, -0.08, -0.13, 0.11, 0.02, uv.white);
  b.box(0.13, 0.05, -0.08, 0.3, 0.11, 0.02, uv.white);
  b.color = 0x4a3f36;
  b.tube([[-0.09, 0.12, -0.04], [-0.2, 0.3, -0.12], [-0.17, 0.42, -0.2]], 0.03, uv.white);
  b.tube([[0.09, 0.12, -0.04], [0.2, 0.3, -0.12], [0.17, 0.42, -0.2]], 0.03, uv.white);
  b.pop();
  // Folded legs with dark hooves + tail.
  b.color = hide;
  b.box(-0.36, 0.02, 0.33, -0.12, 0.15, 0.62, uv.white);
  b.box(0.12, 0.02, -0.74, 0.38, 0.15, -0.42, uv.white);
  b.color = dark;
  b.box(-0.36, 0.02, 0.62, -0.2, 0.1, 0.7, uv.white);
  b.box(0.26, 0.02, -0.42, 0.4, 0.1, -0.34, uv.white);
  b.color = 0x5a4e44;
  b.tube([[0, 0.42, -0.8], [0.14, 0.2, -0.96], [0.18, 0.05, -0.98]], 0.02, uv.white);
  // Colourful rope collar (marigolds on festive streets).
  b.color = festive ? 0xff8f00 : rPick(rng, [0xd8322a, 0x2a6fd6, 0xf2c21a]);
  b.tube([[-0.15, 0.56, 0.5], [0, 0.46, 0.62], [0.15, 0.56, 0.5]], festive ? 0.05 : 0.025, uv.white);
}

function scale(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const bl = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | bl;
}

function bench(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  b.color = rPick(rng, [0x8a6a44, 0x6b4a2a, 0x2f5f8a]);
  b.box(-0.2, 0.42, -0.75, 0.2, 0.48, 0.75, uv.wood);
  for (const z of [-0.65, 0.65]) {
    b.box(-0.17, 0, z - 0.04, -0.12, 0.42, z + 0.04, uv.wood);
    b.box(0.12, 0, z - 0.04, 0.17, 0.42, z + 0.04, uv.wood);
  }
  // Chai glasses + a steel kettle.
  b.color = 0xd9c09a;
  for (let i = 0; i < 3; i++) b.cylinder(rRange(rng, -0.1, 0.1), 0.48, -0.4 + i * 0.12, 0.03, 0.035, 0.09, 6, uv.white, true);
  b.color = 0xd8dde0;
  b.sphere(0, 0.6, 0.4, 0.13, 0.12, 0.13, 8, 5, uv.metal);
}

function shrine(b: GeometryBuilder, uv: PropUvs): void {
  // Small whitewashed roadside shrine against the wall (faces +X).
  b.color = 0xf3eee4;
  b.box(-0.02, 0, -0.4, 0.46, 0.55, 0.4, uv.concrete);
  b.color = 0xffffff;
  b.box(-0.02, 0.55, -0.34, 0.42, 1.25, 0.34, { all: uv.concrete, px: uv.shrine });
  b.color = 0xf07a1e;
  b.push().translate(0.2, 1.25, 0);
  b.cylinder(0, 0, 0, 0.3, 0.02, 0.62, 8, uv.white, false);
  b.pop();
  b.color = 0x6b4a2f;
  b.tube([[0.2, 1.8, 0], [0.2, 2.3, 0]], 0.015, uv.white);
  b.color = 0xff7a00;
  const cu = (uv.white.u0 + uv.white.u1) / 2;
  const cv = (uv.white.v0 + uv.white.v1) / 2;
  b.tri([0.2, 2.3, 0], [0.2, 2.18, 0], [0.2, 2.24, 0.26], [cu, cv], [cu, cv], [cu, cv], true);
}

function sacks(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  b.color = 0xffffff;
  const n = rInt(rng, 3, 5);
  for (let i = 0; i < n; i++) {
    const x = rRange(rng, -0.25, 0.25);
    const z = -0.45 + i * 0.3;
    const h = rRange(rng, 0.5, 0.7);
    b.box(x - 0.2, 0, z - 0.14, x + 0.2, h, z + 0.14, uv.sacks);
    b.sphere(x, h, z, 0.19, 0.08, 0.13, 6, 3, uv.sacks, Math.PI / 2);
  }
}

function chair(b: GeometryBuilder, uv: PropUvs, color: number): void {
  b.color = color;
  b.box(-0.22, 0.42, -0.22, 0.22, 0.46, 0.22, uv.white);
  b.box(-0.24, 0.46, -0.24, -0.2, 0.9, 0.22, uv.white);
  for (const [x, z] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ]) {
    b.box(x - 0.025, 0, z - 0.025, x + 0.025, 0.42, z + 0.025, uv.white);
  }
}

function pots(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  const n = rInt(rng, 4, 7);
  for (let i = 0; i < n; i++) {
    const r = rRange(rng, 0.14, 0.24);
    const x = rRange(rng, -0.35, 0.35);
    const z = rRange(rng, -0.55, 0.55);
    b.color = rPick(rng, [0xb5623a, 0xa0522d, 0xc0703f, 0x8f4a2a]);
    b.sphere(x, r * 0.9, z, r, r * 0.9, r, 8, 5, uv.concrete);
    b.cylinder(x, r * 1.6, z, r * 0.45, r * 0.55, r * 0.35, 8, uv.concrete, false);
  }
}

function umbrellaStall(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  b.color = 0x6b5a44;
  b.box(-0.4, 0.7, -0.55, 0.4, 0.78, 0.55, uv.wood);
  for (const [x, z] of [
    [-0.35, -0.5],
    [0.35, -0.5],
    [-0.35, 0.5],
    [0.35, 0.5],
  ]) {
    b.box(x - 0.03, 0, z - 0.03, x + 0.03, 0.7, z + 0.03, uv.wood);
  }
  b.color = 0xffffff;
  b.box(-0.35, 0.78, -0.5, 0.35, 0.9, 0.5, { all: uv.white, py: rChance(rng, 0.5) ? uv.fruit : uv.veg });
  b.color = 0x3a3a3a;
  b.tube([[0, 0.78, 0], [0, 2.25, 0]], 0.02, uv.white);
  b.color = rPick(rng, [0x1f4fa8, 0xd8322a, 0x1b1b1b, 0x2f9e4f, 0xf2c21a]);
  b.push().translate(0, 2.05, 0);
  b.cylinder(0, 0, 0, 1.0, 0.02, 0.45, 10, uv.fabric, false, true);
  b.pop();
}

function crates(b: GeometryBuilder, uv: PropUvs, rng: Rng): void {
  const n = rInt(rng, 2, 4);
  for (let i = 0; i < n; i++) {
    const stack = i % 2 === 0 ? 0 : 0.34;
    const z = -0.3 + Math.floor(i / 2) * 0.46;
    b.color = rPick(rng, [0xd8322a, 0x2a6fd6, 0x2f9e4f, 0xf2c21a]);
    b.box(-0.22, stack, z - 0.2, 0.22, stack + 0.32, z + 0.2, { all: uv.white, py: rChance(rng, 0.6) ? uv.fruit : uv.veg });
  }
}
