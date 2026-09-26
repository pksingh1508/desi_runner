/**
 * Ambient sky life + atmosphere tuning (kites, birds, sky lanterns,
 * fireworks, monsoon rain, sky dome). Biome weights (config/biomes.ts)
 * scale how much of each appears.
 */
export const AMBIENT = {
  sky: {
    radius: 480,
  },
  ground: {
    size: 1800,
    y: -0.14,
  },
  kites: {
    count: 18,
    minLateral: 3,
    maxLateral: 48,
    minHeight: 14,
    maxHeight: 38,
    /** Spawn distance ahead of the camera (meters, -Z). */
    spawnFar: 330,
    /** Wrap once this far behind the camera (+Z). */
    behindWrap: 170,
    retireDistance: 140,
    minScale: 2.0,
    maxScale: 3.0,
  },
  birds: {
    flocks: 4,
    perFlock: 7,
    minHeight: 12,
    maxHeight: 30,
    radius: [5, 13] as readonly [number, number],
    flapSpeed: [9, 13] as readonly [number, number],
    scale: 1.25,
  },
  skyLanterns: {
    count: 34,
    riseSpeed: [0.9, 1.8] as readonly [number, number],
    minHeight: 12,
    maxHeight: 95,
  },
  fireworks: {
    bursts: 10,
    particlesPerBurst: 96,
    interval: [0.45, 1.35] as readonly [number, number],
    /** Kept inside the street canyon's sky gap so buildings rarely hide them. */
    distance: [140, 210] as readonly [number, number],
    height: [30, 58] as readonly [number, number],
    lateral: 38,
    speed: [30, 46] as readonly [number, number],
    /** Spark lifetime + rocket rise time (seconds) — mirrored in the shader. */
    life: 2.4,
    rise: 1.1,
  },
  rain: {
    count: 2600,
    box: [46, 28, 74] as readonly [number, number, number],
    fallSpeed: 26,
    length: 1.25,
    width: 0.03,
  },
} as const;
