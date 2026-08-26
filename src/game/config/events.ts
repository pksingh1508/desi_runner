/**
 * Dynamic run event tuning. Events never fire during the opening stretch,
 * respect a cooldown window, and never repeat back-to-back.
 */
export const RUN_EVENTS_CFG = {
  /** Minimum distance before any event can trigger. */
  minDistance: 380,
  /** Random cooldown window (seconds) between events. */
  minInterval: 26,
  maxInterval: 40,
  announceDuration: 1.7,
} as const;

export const COIN_STORM = {
  duration: 10,
  lineInterval: 0.5,
  coinsPerLine: 5,
  coinSpacing: 2.3,
  spawnZ: -95,
} as const;

export const DRONE_ATTACK = {
  waves: 3,
  waveGap: 2.4,
  warnTime: 1.5,
  /** Drone closure speed = worldSpeed × factor while charging. */
  speedFactor: 2.35,
  hoverZ: -55,
  /** Tiers ≥ this send two drones per wave (one lane always stays open). */
  doubleWaveTier: 2,
} as const;

export const LASER_GRID = {
  /** Authored laser chain patterns queued into upcoming recycled segments. */
  patternCount: 2,
} as const;
