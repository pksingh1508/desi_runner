/**
 * Biome palettes. Every value is lerped live by the BiomeManager — no
 * loading screens, transitions happen during gameplay via fog/light/material
 * blends. Colors are hex numbers for THREE.Color.
 */
export interface BiomeDefinition {
  id: string;
  name: string;
  background: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  rimColor: number;
  rimIntensity: number;
  glowColor: number;
  glowIntensity: number;
  road: number;
  strip: number;
  dash: number;
  edgeA: number;
  edgeB: number;
  postHead: number;
  building: number;
  /** Side aprons / sidewalks / flat-roof trim the street sits on. */
  sideGround: number;
  sidewalk: number;
  roofTrim: number;
  bands: [number, number, number];
  /** Billboard art hues (canvas textures generated per biome at boot). */
  billboardHues: [string, string, string];
  starOpacity: number;
}

export const NEON_CITY: BiomeDefinition = {
  id: "neonCity",
  name: "SUNNY METRO",
  background: 0x8ecfff,
  fogNear: 78,
  fogFar: 325,
  hemiSky: 0xd6f0ff,
  hemiGround: 0xfff2cc,
  hemiIntensity: 1.42,
  sunColor: 0xfffdf5,
  sunIntensity: 3.15,
  rimColor: 0x6aeefd,
  rimIntensity: 0.52,
  glowColor: 0xffd23f,
  glowIntensity: 10,
  road: 0xe6ddc3,
  strip: 0xffffff,
  dash: 0xffffff,
  edgeA: 0xfdd013,
  edgeB: 0x2eb5e5,
  postHead: 0xfdd013,
  building: 0xeae6da,
  sideGround: 0xcfd8cc,
  sidewalk: 0xf2ede0,
  roofTrim: 0xfff8ee,
  bands: [0xfdd013, 0xe31902, 0x6aeefd],
  billboardHues: ["#FDD013", "#6AEEFD", "#E31902"],
  starOpacity: 0.06,
};

export const UNDERGROUND: BiomeDefinition = {
  id: "underground",
  name: "SEASIDE LINE",
  background: 0x7ed4e8,
  fogNear: 82,
  fogFar: 335,
  hemiSky: 0xc6fefe,
  hemiGround: 0xfff0c2,
  hemiIntensity: 1.38,
  sunColor: 0xfff8e8,
  sunIntensity: 3.0,
  rimColor: 0x00c2d1,
  rimIntensity: 0.55,
  glowColor: 0x37d3e0,
  glowIntensity: 11,
  road: 0xdde8dc,
  strip: 0xffffff,
  dash: 0xe6f7ff,
  edgeA: 0x37d3e0,
  edgeB: 0x4f8dff,
  postHead: 0x37d3e0,
  building: 0xe3f2ff,
  sideGround: 0xc4ddd4,
  sidewalk: 0xeef4ea,
  roofTrim: 0xf4fbff,
  bands: [0x37d3e0, 0x4f8dff, 0xffb84f],
  billboardHues: ["#37D3E0", "#4F8DFF", "#F7BE76"],
  starOpacity: 0.04,
};

export const INDUSTRIAL: BiomeDefinition = {
  id: "industrial",
  name: "DESERT STATION",
  background: 0x9ad4ff,
  fogNear: 72,
  fogFar: 310,
  hemiSky: 0xffe9c2,
  hemiGround: 0xffd9a0,
  hemiIntensity: 1.32,
  sunColor: 0xfff1cc,
  sunIntensity: 3.1,
  rimColor: 0xffb84f,
  rimIntensity: 0.58,
  glowColor: 0xffa54f,
  glowIntensity: 12,
  road: 0xe8dcc2,
  strip: 0xffffff,
  dash: 0xfff0d0,
  edgeA: 0xeb7d26,
  edgeB: 0xe31902,
  postHead: 0xeb7d26,
  building: 0xf5e6cc,
  sideGround: 0xdccfae,
  sidewalk: 0xf5ecd8,
  roofTrim: 0xfff4e0,
  bands: [0xeb7d26, 0xe31902, 0xfdd013],
  billboardHues: ["#EB7D26", "#FDD013", "#E31902"],
  starOpacity: 0.05,
};

export const CYBER_VOID: BiomeDefinition = {
  id: "cyberVoid",
  name: "GREEN PARK",
  background: 0x87e0ff,
  fogNear: 86,
  fogFar: 345,
  hemiSky: 0xd4f0d4,
  hemiGround: 0xe0ffcc,
  hemiIntensity: 1.4,
  sunColor: 0xfffff0,
  sunIntensity: 3.2,
  rimColor: 0x7ac74f,
  rimIntensity: 0.5,
  glowColor: 0xb7f34f,
  glowIntensity: 10,
  road: 0xe2e8d0,
  strip: 0xffffff,
  dash: 0xe8ffd0,
  edgeA: 0x7ac74f,
  edgeB: 0xfdd013,
  postHead: 0x7ac74f,
  building: 0xe6efe0,
  sideGround: 0xc2d8b2,
  sidewalk: 0xeef3e2,
  roofTrim: 0xfbfff2,
  bands: [0x7ac74f, 0xfdd013, 0x6aeefd],
  billboardHues: ["#7AC74F", "#FDD013", "#6AEEFD"],
  starOpacity: 0.05,
};

/** Fixed progression for the first lap, then Industrial/Cyber Void alternate. */
export const FIRST_LAP_DISTANCES = [0, 1000, 2000, 3000] as const;
export const LAP_ALTERNATION_DISTANCE = 1500;
export const BIOME_BLEND_METERS = 120;

export const BIOMES: BiomeDefinition[] = [
  NEON_CITY,
  UNDERGROUND,
  INDUSTRIAL,
  CYBER_VOID,
];

export interface BiomeSlot {
  startDistance: number;
  biomeIndex: number;
}

function buildScheduleEntry(index: number): BiomeSlot {
  if (index < FIRST_LAP_DISTANCES.length) {
    return { startDistance: FIRST_LAP_DISTANCES[index], biomeIndex: index };
  }
  const afterFirstLap = index - FIRST_LAP_DISTANCES.length;
  const startDistance =
    FIRST_LAP_DISTANCES[FIRST_LAP_DISTANCES.length - 1] +
    (afterFirstLap + 1) * LAP_ALTERNATION_DISTANCE;
  // Alternate Industrial (2) / Cyber Void (3) after the first lap.
  return {
    startDistance,
    biomeIndex: afterFirstLap % 2 === 0 ? 2 : 3,
  };
}

/** Returns the schedule slot active at `distance` plus the next slot ahead. */
export function biomeSlotsForDistance(distance: number): {
  current: BiomeSlot;
  next: BiomeSlot;
} {
  let index = 0;
  while (buildScheduleEntry(index + 1).startDistance <= distance) index++;
  return { current: buildScheduleEntry(index), next: buildScheduleEntry(index + 1) };
}

// Tiny monotonic cache — the hot loop queries this every frame and distance
// only ever grows during a run, so memoize the last index probed.
let cachedIndex = -1;
const scratchPair = {
  current: { startDistance: 0, biomeIndex: 0 },
  next: { startDistance: 0, biomeIndex: 0 },
};

/** Allocation-free variant for the frame loop (reuses a shared result). */
export function biomeSlotsForDistanceCached(distance: number): typeof scratchPair {
  if (
    cachedIndex >= 0 &&
    buildScheduleEntry(cachedIndex).startDistance <= distance &&
    buildScheduleEntry(cachedIndex + 1).startDistance > distance
  ) {
    // still inside cached slot
  } else {
    let index = 0;
    while (buildScheduleEntry(index + 1).startDistance <= distance) index++;
    cachedIndex = index;
  }
  const cur = buildScheduleEntry(cachedIndex);
  const nxt = buildScheduleEntry(cachedIndex + 1);
  scratchPair.current.startDistance = cur.startDistance;
  scratchPair.current.biomeIndex = cur.biomeIndex;
  scratchPair.next.startDistance = nxt.startDistance;
  scratchPair.next.biomeIndex = nxt.biomeIndex;
  return scratchPair;
}

export function resetBiomeCache(): void {
  cachedIndex = -1;
}
