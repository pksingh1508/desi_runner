import type * as THREE from "three";
import { GeometryBuilder, type UvRect } from "../gfx/GeometryBuilder";
import { rChance, rInt, rPick, rRange, type Rng } from "../gfx/random";
import type { StreetAtlas } from "../textures/StreetAtlas";
import { STREET } from "@/game/config/street";
import { WORLD } from "@/game/config/gameplay";

/**
 * One 48 m street surface: asphalt with lane markings, yellow-black kerbs,
 * tiled footpaths and a random set of flat decals (zebra crossing,
 * speed-breaker paint, manholes, drain grates, Diwali rangoli). Everything
 * shares the street material → one draw call per segment.
 */

const L = WORLD.segmentLength;
const PERIOD = STREET.texturePeriod;
const DECAL_Y = 0.014;

export interface StreetVariantOptions {
  zebra: boolean;
  speedBreaker: boolean;
  manholes: number;
  grates: number;
  rangoli: number;
}

export function randomStreetOptions(rng: Rng, festive: boolean): StreetVariantOptions {
  return {
    zebra: rChance(rng, 0.3),
    speedBreaker: rChance(rng, 0.25),
    manholes: rInt(rng, 0, 3),
    grates: rInt(rng, 1, 4),
    rangoli: festive ? rInt(rng, 2, 4) : 0,
  };
}

export function buildStreetGeometry(atlas: StreetAtlas, rng: Rng, options: StreetVariantOptions): THREE.BufferGeometry {
  const b = new GeometryBuilder();
  const road = atlas.column("road");
  const kerbFace = atlas.column("kerbFace");
  const kerbTop = atlas.column("kerbTop");
  const foot = atlas.column("footpath");
  const R = STREET.roadHalfWidth;
  const K = STREET.kerbHeight;
  const kerbOuter = R + STREET.kerbWidth;
  const vFar = L / PERIOD;

  // Asphalt.
  flat(b, -R, R, 0, 0, -L, road.u0, road.u1, 0, vFar);
  for (const s of [-1, 1]) {
    // Kerb face (vertical, facing the road): u runs bottom→top.
    const x = s * R;
    if (s < 0) {
      b.quad([x, 0, -L], [x, K, -L], [x, K, 0], [x, 0, 0], { u0: kerbFace.u0, u1: kerbFace.u1, v0: vFar, v1: 0 });
    } else {
      b.quad([x, 0, 0], [x, K, 0], [x, K, -L], [x, 0, -L], { u0: kerbFace.u0, u1: kerbFace.u1, v0: 0, v1: vFar });
    }
    // Kerb top + footpath.
    flat(b, s * R, s * kerbOuter, K, 0, -L, kerbTop.u0, kerbTop.u1, 0, vFar);
    flat(b, s * kerbOuter, s * STREET.footpathOuterX, K, 0, -L, foot.u0, foot.u1, 0, vFar);
  }

  // ------------------------------------------------------------- decals
  const usedZ: number[] = [];
  const freeZ = (min: number, max: number, span: number): number | null => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const z = -rRange(rng, min, max);
      if (usedZ.every((u) => Math.abs(u - z) > span)) {
        usedZ.push(z);
        return z;
      }
    }
    return null;
  };

  if (options.zebra) {
    const z0 = freeZ(10, L - 10, 6);
    if (z0 !== null) {
      const bar = atlas.decal("zebra");
      for (let x = -R + 0.45; x < R - 0.5; x += 1.0) {
        flat(b, x, x + 0.5, DECAL_Y, z0 + 1.5, z0 - 1.5, bar.u0, bar.u1, bar.v0, bar.v1);
      }
    }
  }
  if (options.speedBreaker) {
    const z0 = freeZ(8, L - 8, 5);
    if (z0 !== null) {
      const cell = atlas.decal("speed");
      const pieces = 8;
      const w = (2 * (R - 0.25)) / pieces;
      for (let i = 0; i < pieces; i++) {
        const x = -R + 0.25 + i * w;
        flat(b, x, x + w, DECAL_Y, z0 + 0.6, z0 - 0.6, cell.u0, cell.u1, cell.v0, cell.v1);
      }
    }
  }
  const manhole = atlas.decal("manhole");
  for (let i = 0; i < options.manholes; i++) {
    const z = freeZ(3, L - 3, 2.5);
    if (z === null) continue;
    const x = rPick(rng, [-2.5, 0, 2.5]) + rPick(rng, [-0.85, 0.85]);
    b.discY(x, DECAL_Y, z, 0.42, 14, manhole);
  }
  const grate = atlas.decal("grate");
  for (let i = 0; i < options.grates; i++) {
    const z = -rRange(rng, 2, L - 2);
    const s = rChance(rng, 0.5) ? -1 : 1;
    const x = s * (R - 0.32);
    flat(b, x - 0.22, x + 0.22, DECAL_Y, z + 0.45, z - 0.45, grate.u0, grate.u1, grate.v0, grate.v1);
  }
  for (let i = 0; i < options.rangoli; i++) {
    const cell = atlas.decal(rPick(rng, ["rangoli0", "rangoli1", "rangoli2"] as const));
    const s = i % 2 === 0 ? -1 : 1;
    const z = -rRange(rng, 3, L - 3);
    b.discY(s * rRange(rng, 7.2, 8.2), K + DECAL_Y, z, rRange(rng, 0.55, 0.75), 18, cell);
  }

  return b.toGeometry();
}

/**
 * Horizontal (+Y facing) quad between x0..x1 and zNear..zFar with u
 * following x (u0 at x0) and v following z (vNear at zNear). Winding is
 * chosen so the face always points up regardless of x direction.
 */
function flat(
  b: GeometryBuilder,
  x0: number,
  x1: number,
  y: number,
  zNear: number,
  zFar: number,
  u0: number,
  u1: number,
  vNear: number,
  vFar: number
): void {
  const uv: UvRect = { u0, u1, v0: vNear, v1: vFar };
  if ((x1 - x0) * (zFar - zNear) < 0) {
    b.quad([x0, y, zNear], [x1, y, zNear], [x1, y, zFar], [x0, y, zFar], uv);
  } else {
    b.quad([x0, y, zFar], [x1, y, zFar], [x1, y, zNear], [x0, y, zNear], { u0, u1, v0: vFar, v1: vNear });
  }
}
