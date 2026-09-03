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
  // Apex ≈ v²/(2g) = 3.45m — the runner visibly towers over barriers (~0.96m)
  // with a long readable arc; blocks (2.7m) can only be skimmed with near-
  // perfect timing, and overhead beams still demand a slide.
  gravity: 38,
  jumpVelocity: 16.2,
  /** Extra downward velocity when slide is requested mid-air. */
  fastFallVelocity: 30,
  slideDuration: 0.85,
  /** Lean-back angle (radians) of the slide pose: a reclined feet-first
   * powerslide (~62°), not an upright sit. Head lands ≈ slide height. */
  slideLeanAngle: 1.08,
  /** Forward (-Z) shift of the rig while sliding so the feet lead. */
  slideShiftZ: -0.3,
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
  fogNear: 78,
  fogFar: 325,
  backgroundColor: 0x8ecfff,
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
  /** Pure-gold disc size (larger than the old embossed token). */
  radius: 0.46,
  thickness: 0.1,
} as const;

export const CAMERA_CFG = {
  fovNormal: 62,
  fovMax: 74,
  offset: { x: 0, y: 4.7, z: 8.2 },
  lookOffset: { x: 0, y: 1.55, z: -7.5 },
  positionDamp: 6.5,
  fovDamp: 2.2,
  /** Fraction of player height the camera follows vertically. */
  jumpFollow: 0.68,
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
  /**
   * Fairness floor for consecutive obstacle rows at any speed: the required
   * gap is max(minDistanceGap, speed * minTimeGap). Fixed-distance patterns
   * feel fine at start speed but collapse in *reaction time* as the world
   * accelerates (14m = 1.17s @12m/s but only 0.44s @32m/s — shorter than a
   * jump/slide at 0.85s). WorldManager stretches rows apart to honor this.
   */
  minTimeGap: 0.62,
  minDistanceGap: 13,
  /** Stretched patterns are never pushed past this local z (segment budget). */
  maxTailZ: -42,
  /** Empty (breather) patterns get +this weight per difficulty tier so late
   * runs keep recovery windows instead of wall-to-wall obstacles. */
  breatherBonusPerTier: 0.9,
  /** Jump-arc coins grow by up to +this fraction (height and span) from start
   * to max speed, tracking the longer/faster jump trajectory so high-speed
   * arcs stay collectible instead of flat and out of reach. */
  arcSpeedBoost: 0.35,
} as const;

export const COLORS = {
  /** Subway Surfers yellow — primary accent (high visibility outdoors). */
  signalLime: 0xfdd013,
  /** Subway cyan — secondary accent. */
  signalGreen: 0x6aeefd,
  /** Subway red — tertiary accent. */
  militaryMid: 0xe31902,
  warnAmber: 0xeb7d26,
  coinGold: 0xfdd013,
  dangerRed: 0xe31902,
  buildingBody: 0xeae6da,
  roadBody: 0xe6ddc3,
} as const;

/**
 * High-contrast obstacle paint: one instantly-readable hue per threat type
 * (jump = red-orange, weave = magenta, wall = amber, duck = blue) with
 * self-lit warning strips so obstacles pop against the bright daylight road
 * instead of washing out. Emissive intensities survive the 3.15 sun.
 */
export const OBSTACLE_COLORS = {
  /** Jump barriers: vivid safety red-orange body + dark legs. */
  barrierBody: 0xff3d00,
  barrierBodyEmissive: 0xff3d00,
  barrierBodyEmissiveIntensity: 0.38,
  barrierLeg: 0x2b2f36,
  /** Weaving threats: electric magenta shell + dark skids. */
  movingBody: 0xc81cff,
  movingBodyEmissive: 0xc81cff,
  movingBodyEmissiveIntensity: 0.45,
  movingSkid: 0x23262e,
  /** Tall walls: saturated amber crate + hot red core/edges. */
  blockBody: 0xff9500,
  blockBodyEmissive: 0xff6a00,
  blockBodyEmissiveIntensity: 0.3,
  blockEdge: 0xff1744,
  /** Duck gates: saturated cobalt beam + dark posts. */
  gateBeam: 0x2255ff,
  gateBeamEmissive: 0x2255ff,
  gateBeamEmissiveIntensity: 0.42,
  gatePost: 0x1c2230,
  /** Unlit warning glows (MeshBasicMaterial — always full-bright). */
  warnStrip: 0xffe600,
  dangerUnder: 0xff1744,
  footGlow: 0xffb300,
} as const;

/**
 * Pickup readability tuning: world-space scale + glow strength so power-ups,
 * keys and rockets read from 30m+ away. Gameplay collection radii already
 * cover these sizes — visuals only.
 */
export const PICKUP_VISUAL = {
  pickupScale: 1.35,
  pickupCoreEmissiveIntensity: 2.6,
  pickupRingOpacity: 0.9,
  keyScale: 1.4,
  keyGoldEmissiveIntensity: 0.6,
  keyGemEmissiveIntensity: 2.0,
  keyHaloOpacity: 0.35,
  rocketScale: 1.35,
  rocketGlowEmissiveIntensity: 0.9,
  rocketFlameOpacity: 0.9,
} as const;

/**
 * Rocket-flight coin trail: coins arrive in ~1s bursts separated by ~1s gaps
 * (each burst holds one lane so the player weaves between paydays) instead
 * of one endless line. Distances derive from flight speed × time so the trail
 * always covers the whole flight.
 */
export const ROCKET_TRAIL = {
  coinY: 4.45,
  leadDistance: 10,
  burstSeconds: 1.0,
  gapSeconds: 1.0,
  coinSpacing: 3.0,
  /** Trail covers the flight plus this buffer (speed keeps ramping mid-flight). */
  extraSeconds: 1.4,
} as const;

/**
 * Escalating rocket flights: the 1st rocket of a run flies firstSeconds,
 * the 2nd adds stepSeconds, and so on up to maxSeconds. Later pickups feel
 * progressively more rewarding without breaking early-run balance.
 */
export const ROCKET_FLIGHT = {
  firstSeconds: 3,
  stepSeconds: 1,
  maxSeconds: 6,
} as const;

export const MODEL_URL = "/models/robot_expressive.glb";
