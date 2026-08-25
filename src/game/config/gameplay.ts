/**
 * Central gameplay tuning constants.
 * All world units are meters; forward travel is -Z, the world moves toward +Z.
 */

import type { LaneIndex } from "@/types/game";

export const LANES: readonly [number, number, number] = [-2.5, 0, 2.5];
export const CENTER_LANE: LaneIndex = 1;

export const PLAYER = {
  /** Horizontal interpolation speed for lane changes (higher = snappier). */
  laneDampSpeed: 13,
  width: 0.7,
  depth: 0.7,
  standingHeight: 1.9,
  slideHeight: 0.95,
  // Apex ≈ v²/(2g) = 2.57m — clears barriers (~0.96m) with a big readable
  // arc, but stays under blocks (2.7m) so they always require a lane change.
  gravity: 36,
  jumpVelocity: 13.6,
  /** Extra downward velocity when slide is requested mid-air. */
  fastFallVelocity: 26,
  slideDuration: 0.85,
  /** Seconds a jump press stays buffered before landing. */
  jumpBufferTime: 0.12,
  /** Visual roll while switching lanes (radians per meter of offset). */
  laneRollFactor: 0.1,
} as const;

export const WORLD = {
  segmentLength: 48,
  segmentCount: 9,
  roadHalfWidth: 5.4,
  /** A segment is recycled once its far edge passes this z. */
  recycleBehindZ: 18,
  fogNear: 55,
  fogFar: 235,
  backgroundColor: 0x05060e,
  groundY: 0,
} as const;

export const SPEED = {
  start: 12,
  max: 32,
  /** Meters of distance over which speed ramps from start to max. */
  rampDistance: 2200,
  /** World scroll factor during countdown (no scoring yet). */
  countdownFactor: 0.55,
  /** Ambient scroll during menu. */
  menuSpeed: 6,
  /** Deceleration (u/s^2) applied to the world after death. */
  deathDeceleration: 30,
} as const;

export const SCORE = {
  pointsPerMeter: 5,
  coinValue: 25,
} as const;

export const COIN = {
  value: SCORE.coinValue,
  collectRadiusXZ: 1.05,
  collectRadiusY: 1.25,
  baseY: 0.8,
  spinSpeed: 3.4,
  bobAmplitude: 0.12,
  bobSpeed: 3.1,
  poolSize: 140,
} as const;

export const CAMERA_CFG = {
  fovNormal: 62,
  fovMax: 74,
  offset: { x: 0, y: 4.7, z: 8.2 },
  lookOffset: { x: 0, y: 1.55, z: -7.5 },
  positionDamp: 6.5,
  fovDamp: 2.2,
  /** Fraction of player height the camera follows vertically. */
  jumpFollow: 0.55,
  /** Fraction of lateral player motion the camera follows. */
  lateralFollow: 0.45,
  shakeDecay: 4.5,
  shakeAmpOnHit: 0.55,
  bobAmplitude: 0.05,
  bobFrequencyPerUnit: 0.85,
} as const;

export const DIFFICULTY_TIERS = [
  { minDistance: 0, name: "WARM-UP", label: "I" },
  { minDistance: 300, name: "HEAT-UP", label: "II" },
  { minDistance: 800, name: "OVERDRIVE", label: "III" },
  { minDistance: 1500, name: "MELTDOWN", label: "IV" },
] as const;

export const PATTERN = {
  /** Longitudinal gap between obstacle rows inside one segment. */
  rowGap: 13,
  /** First row offset from segment origin (segment extends toward -Z). */
  firstRowZ: -9,
  marginFromEdges: 5,
} as const;

export const COLORS = {
  neonCyan: 0x27e6ff,
  neonPurple: 0xa64bff,
  neonPink: 0xff3fa4,
  warmOrange: 0xff9a3d,
  coinGold: 0xffd23f,
  dangerRed: 0xff4560,
  buildingBody: 0x0a0d1c,
  roadBody: 0x11131f,
} as const;

export const MODEL_URL = "/models/robot_expressive.glb";
