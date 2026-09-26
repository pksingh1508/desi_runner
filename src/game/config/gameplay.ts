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
  /** Time to roll fully into and recover from the low slide pose. */
  slideEnterTime: 0.18,
  slideExitTime: 0.14,
  /** Short mixer blend removes a hard cut while keeping the input immediate. */
  slideBlendTime: 0.06,
  /** Side roll (radians) used by the reference-style shoulder slide. The
   * negative sign drops the runner onto their right side from the rear view. */
  slideRollAngle: -1.34,
  /** Small backward pitch keeps the pose dimensional instead of reading as
   * a flat sprite rotated across the track. */
  slidePitchAngle: 0.12,
  /** Lift prevents the downhill hand/foot from clipping through the road. */
  slideVisualLift: 0.1,
  /** Slight forward (-Z) drive gives the low pose a committed glide. */
  slideShiftZ: -0.18,
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
  /** Ambient scroll during menu (0 = the street stands still behind the runner). */
  menuSpeed: 0,
  /** Deceleration (u/s^2) applied to the world after death. */
  deathDeceleration: 30,
} as const;

/** Life-Saver revive: how long the offer stays open + post-revive grace. */
export const REVIVE = {
  seconds: 6,
  invulnerableSeconds: 2.4,
} as const;

export const SCORE = {
  pointsPerMeter: 5,
  coinValue: 25,
} as const;

/**
 * TAAL: jumping on the dhol beat (as heard) scores a small streak bonus and a
 * pinch of JOSH. Lenient on purpose — it rewards feel, never punishes.
 */
export const TAAL = {
  /** Max distance from the nearest beat, in seconds. */
  windowSeconds: 0.08,
  bonus: 20,
  /** Bonus multiplies with the streak up to this cap. */
  maxStreak: 5,
  joshGain: 3,
  /** Single on-beat jumps toast at most this often (streaks always toast). */
  toastCooldown: 2.5,
} as const;

/** Extra score for desi near misses (on top of the +50 close call). */
export const DESI_BONUS = {
  /** Squeezing past a cow: "GAU MATA KI JAI!" */
  cowBlessing: 100,
  /** Squeezing past a Horn-OK-Please truck. */
  hornOkPlease: 50,
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
  /**
   * Portrait screens have a much narrower horizontal view at the same
   * vertical FOV; pull back, rise and widen so all three lanes stay visible
   * next to the runner (scaled in from aspect 1.0 down to 0.5).
   */
  portraitExtraZ: 3.4,
  portraitExtraY: 1.3,
  portraitExtraFov: 10,
} as const;

/**
 * Menu showcase camera: orbits in FRONT of the runner (the runner faces -Z).
 * `angle` is measured from straight-on toward the runner's left (camera
 * right). Framing shifts the runner right (landscape) or up (portrait) so the
 * UI panels never cover them.
 */
export const MENU_CAMERA = {
  home: { angle: 0.36, sway: 0.1, radius: 4.7, height: 1.55, lookY: 1.05, fov: 40 },
  gear: { angle: 0.5, sway: 0.14, radius: 3.25, height: 1.4, lookY: 1.0, fov: 36 },
  panel: { angle: 0.42, sway: 0.08, radius: 4.9, height: 1.6, lookY: 1.05, fov: 40 },
  /** Fraction of the viewport the runner is shifted by. */
  landscapeShiftX: 0.21,
  portraitShiftY: 0.25,
  /** Portrait phones: pull the showcase back so the whole runner fits above
   * the bottom sheet (scaled in fully at aspect ≤ 0.5). */
  portraitRadiusScale: 1.7,
  /** Seconds for the countdown swoop from the showcase to the chase cam. */
  swoopSeconds: 1.9,
  orbitDamp: 2.6,
} as const;

export const DIFFICULTY_TIERS = [
  { minDistance: 0, name: "CHALTA HAI", label: "I" },
  { minDistance: 300, name: "TEZ", label: "II" },
  { minDistance: 800, name: "TOOFAN", label: "III" },
  { minDistance: 1500, name: "BAWAAL", label: "IV" },
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

/**
 * Diwali-rocket ride: phased flight (launch → cruise → descend → touchdown).
 * Heights are feet height of the runner. Descent is a single eased curve
 * over `descendSeconds`, so the runner always touches down exactly when the
 * timer ends (the old competing damps stalled ~2.5 m up and dropped).
 */
export const ROCKET_RIDE = {
  cruiseY: 4.4,
  launchSeconds: 0.55,
  descendSeconds: 1.0,
  bobAmplitude: 0.12,
  bobFrequency: 3,
  /** Roll (radians per meter of lateral offset) while banking between lanes. */
  bankFactor: 0.2,
  /** Nose-up pitch during launch, nose-down during descent (radians). */
  launchPitch: 0.16,
  descendPitch: -0.12,
  /** Collision-free window after touchdown (the landing zone is also cleared). */
  landingGraceSeconds: 1.1,
  /**
   * Obstacles inside the landing window are cleared at launch. The window is
   * padded for mid-flight speed boosts (turbo / JOSH) so it always covers the
   * real touchdown point.
   */
  clearLeadSeconds: 1.2,
  clearTrailSeconds: 1.8,
  clearSpeedPadding: 1.5,
  /** Rider seat height above the runner origin (human riders). */
  seatHeight: 0.38,
  /** HUD rocket timer push interval (seconds). */
  hudInterval: 0.1,
} as const;

/**
 * Post-processing (desktop, non-performance mode): gentle daytime bloom that
 * rises at night so neon, diyas and fireworks glow. Threshold is on linear
 * HDR luminance before tone mapping.
 */
export const POST_FX = {
  bloomStrength: 0.22,
  bloomRadius: 0.55,
  bloomThreshold: 0.9,
  nightBloomStrength: 0.62,
  msaaSamples: 4,
} as const;

export const MODEL_URL = "/models/robot_expressive.glb";
