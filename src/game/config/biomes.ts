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
  bands: [number, number, number];
  /** Billboard art hues (canvas textures generated per biome at boot). */
  billboardHues: [string, string, string];
  starOpacity: number;
}

export const NEON_CITY: BiomeDefinition = {
  id: "neonCity",
  name: "NEON CITY",
  background: 0x070b09,
  fogNear: 55,
  fogFar: 235,
  hemiSky: 0xcfe6bd,
  hemiGround: 0x0d1a12,
  hemiIntensity: 1.15,
  sunColor: 0xdcefd0,
  sunIntensity: 2.2,
  rimColor: 0x86a95e,
  rimIntensity: 0.85,
  glowColor: 0xd9de7a,
  glowIntensity: 14,
  road: 0x121711,
  strip: 0xb7c968,
  dash: 0xdfe8cf,
  edgeA: 0xd9de7a,
  edgeB: 0x6f8d42,
  postHead: 0xd9de7a,
  building: 0x0a0f0c,
  bands: [0xd9de7a, 0x6f8d42, 0xe0a458],
  billboardHues: ["#d9de7a", "#9fca7d", "#e0a458"],
  starOpacity: 0.75,
};

export const UNDERGROUND: BiomeDefinition = {
  id: "underground",
  name: "UNDERGROUND",
  background: 0x04070c,
  fogNear: 42,
  fogFar: 185,
  hemiSky: 0x9fc5e8,
  hemiGround: 0x050a10,
  hemiIntensity: 0.95,
  sunColor: 0xbfe0ff,
  sunIntensity: 1.7,
  rimColor: 0x3f7bff,
  rimIntensity: 1.05,
  glowColor: 0x4fd8ff,
  glowIntensity: 16,
  road: 0x0b1016,
  strip: 0x4f9dd8,
  dash: 0xa8cdf0,
  edgeA: 0x37d3e0,
  edgeB: 0x2a5f8f,
  postHead: 0x37d3e0,
  building: 0x060a10,
  bands: [0x37d3e0, 0x2a5f8f, 0x4f8dff],
  billboardHues: ["#37d3e0", "#4f8dff", "#7ab8ff"],
  starOpacity: 0.15,
};

export const INDUSTRIAL: BiomeDefinition = {
  id: "industrial",
  name: "INDUSTRIAL DISTRICT",
  background: 0x0c0805,
  fogNear: 48,
  fogFar: 205,
  hemiSky: 0xe8cfa8,
  hemiGround: 0x140c06,
  hemiIntensity: 1.0,
  sunColor: 0xffd9a0,
  sunIntensity: 1.9,
  rimColor: 0xe07840,
  rimIntensity: 0.95,
  glowColor: 0xffa54f,
  glowIntensity: 15,
  road: 0x171008,
  strip: 0xe0a458,
  dash: 0xf0dcc0,
  edgeA: 0xffa54f,
  edgeB: 0xb06a30,
  postHead: 0xffa54f,
  building: 0x100a06,
  bands: [0xffa54f, 0xb06a30, 0xe05840],
  billboardHues: ["#ffa54f", "#e05840", "#ffd23f"],
  starOpacity: 0.35,
};

export const CYBER_VOID: BiomeDefinition = {
  id: "cyberVoid",
  name: "CYBER VOID",
  background: 0x060310,
  fogNear: 60,
  fogFar: 260,
  hemiSky: 0xc0a8ff,
  hemiGround: 0x0a0418,
  hemiIntensity: 1.05,
  sunColor: 0xd0b8ff,
  sunIntensity: 1.8,
  rimColor: 0xb46bff,
  rimIntensity: 1.15,
  glowColor: 0xc06bff,
  glowIntensity: 17,
  road: 0x0d0818,
  strip: 0x9a6ae0,
  dash: 0xd0c0f0,
  edgeA: 0xc06bff,
  edgeB: 0x5a2e9e,
  postHead: 0xc06bff,
  building: 0x080512,
  bands: [0xc06bff, 0x5a2e9e, 0xff4fa0],
  billboardHues: ["#c06bff", "#ff4fa0", "#7a5cff"],
  starOpacity: 1.0,
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
