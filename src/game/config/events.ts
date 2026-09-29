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
  /**
   * Drone attacks and traffic jams play out on a reserved stretch of road
   * (spawned far beyond the fog). The banner goes up once that stretch is
   * this many seconds ahead, so the warning matches what's coming.
   */
  stretchLeadSeconds: 2.4,
  /** Give up on a reserved stretch that never comes into range. */
  approachTimeout: 60,
} as const;

/** Internal ids stay stable; labels carry the desi flavour. */
export type RunEventKind = "coinStorm" | "droneAttack" | "laserGrid";

export interface RunEventDef {
  kind: RunEventKind;
  label: string;
  weight: number;
}

export const RUN_EVENT_DEFS: readonly RunEventDef[] = [
  { kind: "coinStorm", label: "💰 PAISA BAARISH!", weight: 0.4 },
  { kind: "droneAttack", label: "⚠ SHAADI DRONE ATTACK", weight: 0.33 },
  { kind: "laserGrid", label: "⚠ TRAFFIC JAM AHEAD", weight: 0.27 },
];

export const COIN_STORM = {
  duration: 10,
  lineInterval: 0.5,
  coinsPerLine: 5,
  coinSpacing: 2.3,
  spawnZ: -95,
} as const;

/** Cosmetic rupee-note confetti that flutters down during a Paisa Baarish. */
export const PAISA_RAIN = {
  /** Pooled notes (one InstancedMesh draw call). */
  count: 72,
  /** Notes spawned per second while the storm is live. */
  spawnRate: 26,
  width: 0.56,
  height: 0.27,
  minY: 3.6,
  maxY: 9,
  /** Half-width of the spawn band (x); the road is ±5.4. */
  halfX: 6.2,
  nearZ: -14,
  farZ: -58,
  fallSpeedMin: 1.0,
  fallSpeedMax: 1.9,
  /** Notes shrink away over this distance before reaching the camera. */
  fadeStartZ: -9,
  fadeEndZ: -2,
} as const;

export const DRONE_ATTACK = {
  waves: 3,
  waveGap: 2.4,
  warnTime: 1.5,
  /** Drone closure speed = worldSpeed × factor while charging. */
  speedFactor: 2.35,
  hoverZ: -55,
  /** Hover height of the drone body (collider center). */
  hoverY: 1.15,
  /** Half extent of the drone's cubic collider. */
  halfSize: 0.55,
  /** Tiers ≥ this send two drones per wave (one lane always stays open). */
  doubleWaveTier: 2,
  /**
   * Seconds of obstacle-free road (coins only) reserved for the attack, so
   * the charging drones are the only threat — never a drone in one lane
   * and a truck in the "open" one.
   */
  openRoadSeconds: 7,
} as const;

/** Wedding-videography quadcopter visuals. */
export const SHAADI_DRONE = {
  propSpin: 48,
  bobAmplitude: 0.045,
  bobSpeed: 3.2,
  /** REC light blink rate (Hz) while filming / while locking on. */
  recBlink: 2,
  recBlinkWarning: 7,
  /** Lane telegraph strip length (m) drawn ahead of the drone. */
  laneStripLength: 10,
  laneStripWidth: 1.5,
  laneStripOpacityWarning: 0.9,
  laneStripOpacityCharging: 0.55,
  /** Nose-down pitch while charging (radians). */
  chargePitch: 0.32,
} as const;
