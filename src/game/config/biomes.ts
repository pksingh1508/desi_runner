/**
 * Biome atmospheres. Every value is lerped live by the BiomeManager (fog,
 * sky, lights, environment, street wetness, facade night glow, skyline,
 * ambient life) — no loading screens. Colors are sRGB hex.
 *
 * Index order is shared with other systems (music themes, obstacle
 * variants): 0 CHANDNI CHOWK, 1 PINK CITY, 2 MUMBAI MONSOON, 3 DIWALI NIGHT.
 * Street architecture per biome lives in config/buildings.ts (by `id`).
 */

export interface BiomeSky {
  zenith: number;
  horizon: number;
  /** Below-horizon haze (matches fog so the far city melts into it). */
  ground: number;
  /** Direction of the visible sun / moon (normalized at runtime). */
  sunDir: readonly [number, number, number];
  sunColor: number;
  /** Angular radius of the disc (radians). 0 hides it. */
  sunSize: number;
  sunGlow: number;
  /** Horizon glow falloff (higher = thinner band). */
  haze: number;
  cloudCover: number;
  cloudOpacity: number;
  cloudColor: number;
  cloudShade: number;
  stars: number;
}

export interface BiomeDefinition {
  id: string;
  /** Short uppercase name shown in the HUD. */
  name: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  sky: BiomeSky;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  rimColor: number;
  rimIntensity: number;
  glowColor: number;
  glowIntensity: number;
  /** scene.environmentIntensity (IBL from a sky-matched PMREM). */
  envIntensity: number;
  street: {
    /** Multiplies the asphalt/footpath atlas. */
    tint: number;
    /** 0 dry → 1 monsoon-soaked (dark, glossy, puddles). */
    wetness: number;
  };
  facade: {
    tint: number;
    /** Night emissive strength (windows, signs, string lights). */
    emissive: number;
    /** Festive bulb twinkle amount. */
    twinkle: number;
  };
  skyline: {
    near: number;
    far: number;
    windowColor: number;
    windowGlow: number;
    haze: number;
    /** 0 = old-city silhouettes (domes, shikharas, forts), 1 = high-rises. */
    modern: number;
  };
  ground: number;
  ambient: {
    kites: number;
    birds: number;
    fireworks: number;
    rain: number;
    skyLanterns: number;
  };
  /** Legacy (Game passes these to SharedAssets; the Indian street ignores them). */
  billboardHues: [string, string, string];
}

export const CHANDNI_CHOWK: BiomeDefinition = {
  id: "chandniChowk",
  name: "CHANDNI CHOWK",
  fog: 0xe0c29a,
  fogNear: 55,
  fogFar: 320,
  sky: {
    zenith: 0x2f74cf,
    horizon: 0xf2d9b2,
    ground: 0xd9bd94,
    sunDir: [0.5, 0.36, 0.79],
    sunColor: 0xffdfa6,
    sunSize: 0.034,
    sunGlow: 1.0,
    haze: 6,
    cloudCover: 0.3,
    cloudOpacity: 0.75,
    cloudColor: 0xffffff,
    cloudShade: 0xd3c2ae,
    stars: 0,
  },
  hemiSky: 0xd6e4f2,
  hemiGround: 0xa38a6a,
  hemiIntensity: 0.8,
  sunColor: 0xffdfb4,
  sunIntensity: 3.2,
  rimColor: 0xffc27a,
  rimIntensity: 0.9,
  glowColor: 0xffd28a,
  glowIntensity: 5,
  envIntensity: 0.45,
  street: { tint: 0xffffff, wetness: 0 },
  facade: { tint: 0xffffff, emissive: 0.1, twinkle: 0 },
  skyline: { near: 0xa88f7d, far: 0xc6b19b, windowColor: 0xffc46b, windowGlow: 0, haze: 0.62, modern: 0 },
  ground: 0x9a8a74,
  ambient: { kites: 1, birds: 1, fireworks: 0, rain: 0, skyLanterns: 0 },
  billboardHues: ["#FF9933", "#FFD166", "#E4572E"],
};

export const PINK_CITY: BiomeDefinition = {
  id: "pinkCity",
  name: "PINK CITY",
  fog: 0xeaa982,
  fogNear: 45,
  fogFar: 290,
  sky: {
    zenith: 0x5566b0,
    horizon: 0xffae6e,
    ground: 0xe29e7a,
    sunDir: [-0.46, 0.12, -0.88],
    sunColor: 0xffae58,
    sunSize: 0.045,
    sunGlow: 1.7,
    haze: 3.4,
    cloudCover: 0.42,
    cloudOpacity: 0.8,
    cloudColor: 0xffcf9c,
    cloudShade: 0xa86a86,
    stars: 0,
  },
  hemiSky: 0xffd0ae,
  hemiGround: 0x8a5a4a,
  hemiIntensity: 0.8,
  sunColor: 0xffbd82,
  sunIntensity: 2.35,
  rimColor: 0xffa24a,
  rimIntensity: 2.2,
  glowColor: 0xffb070,
  glowIntensity: 6,
  envIntensity: 0.5,
  street: { tint: 0xfff0e8, wetness: 0 },
  facade: { tint: 0xffffff, emissive: 0.35, twinkle: 0 },
  skyline: { near: 0x94647a, far: 0xc28488, windowColor: 0xffc070, windowGlow: 0.25, haze: 0.55, modern: 0 },
  ground: 0xa0705a,
  ambient: { kites: 1, birds: 1, fireworks: 0, rain: 0, skyLanterns: 0 },
  billboardHues: ["#FF6F91", "#FFC75F", "#F9A03F"],
};

export const MUMBAI_MONSOON: BiomeDefinition = {
  id: "mumbaiMonsoon",
  name: "MUMBAI MONSOON",
  fog: 0x8ea2a4,
  fogNear: 18,
  fogFar: 225,
  sky: {
    zenith: 0x56686e,
    horizon: 0xa0b2b1,
    ground: 0x889a9a,
    sunDir: [0.3, 0.62, -0.5],
    sunColor: 0xdce8e8,
    sunSize: 0,
    sunGlow: 0.25,
    haze: 2.5,
    cloudCover: 0.96,
    cloudOpacity: 1,
    cloudColor: 0xb2c0c2,
    cloudShade: 0x55636a,
    stars: 0,
  },
  hemiSky: 0xc0d0d2,
  hemiGround: 0x3f4b4b,
  hemiIntensity: 1.3,
  sunColor: 0xd8e6e8,
  sunIntensity: 1.3,
  rimColor: 0x9fd0d6,
  rimIntensity: 0.55,
  glowColor: 0xbfe0ff,
  glowIntensity: 6,
  envIntensity: 0.75,
  street: { tint: 0xd9dddd, wetness: 1 },
  facade: { tint: 0xf2f4f4, emissive: 0.5, twinkle: 0 },
  skyline: { near: 0x5c6c70, far: 0x7d8e90, windowColor: 0xfff0c8, windowGlow: 0.35, haze: 0.66, modern: 1 },
  ground: 0x56615f,
  ambient: { kites: 0, birds: 0.35, fireworks: 0, rain: 1, skyLanterns: 0 },
  billboardHues: ["#3AAFA9", "#DEF2F1", "#FEFFFF"],
};

export const DIWALI_NIGHT: BiomeDefinition = {
  id: "diwaliNight",
  name: "DIWALI NIGHT",
  fog: 0x2b1f48,
  fogNear: 24,
  fogFar: 240,
  sky: {
    zenith: 0x060920,
    horizon: 0x3c2559,
    ground: 0x261a3c,
    sunDir: [-0.34, 0.42, -0.84],
    sunColor: 0xe2e8ff,
    sunSize: 0.022,
    sunGlow: 0.35,
    haze: 4,
    cloudCover: 0.3,
    cloudOpacity: 0.45,
    cloudColor: 0x4a3a6c,
    cloudShade: 0x1a1430,
    stars: 1,
  },
  hemiSky: 0x6a66b8,
  hemiGround: 0x4a2c26,
  hemiIntensity: 0.9,
  sunColor: 0xa4b4ff,
  sunIntensity: 0.8,
  rimColor: 0xff9a3c,
  rimIntensity: 1.4,
  glowColor: 0xffb35c,
  glowIntensity: 16,
  envIntensity: 0.35,
  street: { tint: 0xe6e0ff, wetness: 0.35 },
  facade: { tint: 0xffffff, emissive: 1.7, twinkle: 1 },
  skyline: { near: 0x14112a, far: 0x241c40, windowColor: 0xffc46b, windowGlow: 1.3, haze: 0.5, modern: 0 },
  ground: 0x201830,
  ambient: { kites: 0, birds: 0, fireworks: 1, rain: 0, skyLanterns: 1 },
  billboardHues: ["#FFB300", "#FF3D00", "#FFE082"],
};

export const BIOMES: BiomeDefinition[] = [CHANDNI_CHOWK, PINK_CITY, MUMBAI_MONSOON, DIWALI_NIGHT];

/** Fixed first lap (0 → 1 → 2 → 3), then every biome cycles again. */
export const FIRST_LAP_DISTANCES = [0, 1000, 2000, 3000] as const;
export const LAP_ALTERNATION_DISTANCE = 1500;
export const BIOME_BLEND_METERS = 120;

export interface BiomeSlot {
  startDistance: number;
  biomeIndex: number;
}

function entryStart(index: number): number {
  if (index < FIRST_LAP_DISTANCES.length) return FIRST_LAP_DISTANCES[index];
  const afterFirstLap = index - FIRST_LAP_DISTANCES.length;
  return FIRST_LAP_DISTANCES[FIRST_LAP_DISTANCES.length - 1] + (afterFirstLap + 1) * LAP_ALTERNATION_DISTANCE;
}

function entryBiome(index: number): number {
  if (index < FIRST_LAP_DISTANCES.length) return index;
  return (index - FIRST_LAP_DISTANCES.length) % BIOMES.length;
}

/** Schedule index active at `distance` (allocation-free). */
function slotIndexAt(distance: number): number {
  if (distance < FIRST_LAP_DISTANCES[FIRST_LAP_DISTANCES.length - 1] + LAP_ALTERNATION_DISTANCE) {
    let index = 0;
    while (index + 1 < FIRST_LAP_DISTANCES.length + 1 && entryStart(index + 1) <= distance) index++;
    return index;
  }
  const beyond = distance - FIRST_LAP_DISTANCES[FIRST_LAP_DISTANCES.length - 1];
  return FIRST_LAP_DISTANCES.length - 1 + Math.floor(beyond / LAP_ALTERNATION_DISTANCE);
}

/** Biome index at a run distance (allocation-free; used for decor lookahead). */
export function biomeIndexAt(distance: number): number {
  return entryBiome(slotIndexAt(Math.max(0, distance)));
}

/** Returns the schedule slot active at `distance` plus the next slot ahead. */
export function biomeSlotsForDistance(distance: number): { current: BiomeSlot; next: BiomeSlot } {
  const index = slotIndexAt(Math.max(0, distance));
  return {
    current: { startDistance: entryStart(index), biomeIndex: entryBiome(index) },
    next: { startDistance: entryStart(index + 1), biomeIndex: entryBiome(index + 1) },
  };
}

let cachedIndex = -1;
const scratchPair = {
  current: { startDistance: 0, biomeIndex: 0 },
  next: { startDistance: 0, biomeIndex: 0 },
};

/** Allocation-free variant for the frame loop (reuses a shared result). */
export function biomeSlotsForDistanceCached(distance: number): typeof scratchPair {
  const d = Math.max(0, distance);
  if (!(cachedIndex >= 0 && entryStart(cachedIndex) <= d && entryStart(cachedIndex + 1) > d)) {
    cachedIndex = slotIndexAt(d);
  }
  scratchPair.current.startDistance = entryStart(cachedIndex);
  scratchPair.current.biomeIndex = entryBiome(cachedIndex);
  scratchPair.next.startDistance = entryStart(cachedIndex + 1);
  scratchPair.next.biomeIndex = entryBiome(cachedIndex + 1);
  return scratchPair;
}

export function resetBiomeCache(): void {
  cachedIndex = -1;
}
