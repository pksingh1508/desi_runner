import type { ObstacleKind } from "@/game/entities/Obstacle";

/**
 * Indian-street obstacle variants. Every pooled obstacle carries all visual
 * variants of its gameplay kind and shows one per spawn; the collider box is
 * taken from the active variant so what the runner sees is what it hits.
 *
 * Fairness envelope per kind (see Obstacle / SkillSystem):
 *  - barrier / moving : jumpable, top ≤ 1.5 m
 *  - block            : dodge only, top ≥ 2.6 m
 *  - overhead1 / 3    : slide only — bottom 1.45 m (slide height 0.95 m,
 *                       standing 1.9 m), top above the 3.45 m jump apex
 *
 * Camera clearance: nothing inside the lane corridor (|x| < 3.5) may sit
 * between 4.1 m and 7.8 m, or the chase camera would clip through it.
 */

export type ObstacleVariantId =
  // barrier
  | "policeBarricade"
  | "thela"
  | "roadWork"
  // moving
  | "cow"
  | "cycleRickshaw"
  // block
  | "truck"
  | "chaiTapri"
  | "sackCart"
  | "autoLoaded"
  // overhead1
  | "signboard"
  | "clothesline"
  | "banner"
  // overhead3
  | "phaatak"
  | "swagatArch";

export type ApproachCue = "honk" | "moo" | "bell";

/**
 * Collider box in obstacle-local space (origin on the road at the lane
 * center). For movers `hx` is the half LENGTH along the travel direction and
 * `hz` the half WIDTH — the box is re-projected as the mover turns around.
 */
export interface ObstacleColliderDims {
  hx: number;
  minY: number;
  maxY: number;
  hz: number;
}

export interface ObstacleVariantDef {
  id: ObstacleVariantId;
  kind: ObstacleKind;
  dims: ObstacleColliderDims;
  cue: ApproachCue | null;
  /**
   * Spawn weight per biome index:
   * [Chandni Chowk, Pink City, Mumbai Monsoon, Diwali Night].
   */
  biomeWeights: readonly [number, number, number, number];
  /**
   * Static props may be mirrored per spawn for free visual variety — only
   * variants without readable text art (mirrored signage reads backwards).
   */
  mirrorable: boolean;
}

export const OBSTACLE_VARIANTS: Record<ObstacleVariantId, ObstacleVariantDef> = {
  // ----------------------------------------------------------- barrier (jump)
  policeBarricade: {
    id: "policeBarricade",
    kind: "barrier",
    dims: { hx: 1.05, minY: 0, maxY: 1.14, hz: 0.22 },
    cue: null,
    biomeWeights: [1.0, 0.8, 0.9, 1.1],
    mirrorable: false,
  },
  thela: {
    id: "thela",
    kind: "barrier",
    dims: { hx: 1.06, minY: 0, maxY: 1.2, hz: 0.55 },
    cue: null,
    biomeWeights: [1.3, 1.1, 0.8, 0.9],
    mirrorable: true,
  },
  roadWork: {
    id: "roadWork",
    kind: "barrier",
    dims: { hx: 1.05, minY: 0, maxY: 1.1, hz: 0.24 },
    cue: null,
    biomeWeights: [0.6, 0.7, 1.3, 0.6],
    mirrorable: false,
  },
  // ------------------------------------------------ moving (weave, jumpable)
  cow: {
    id: "cow",
    kind: "moving",
    dims: { hx: 1.0, minY: 0, maxY: 1.45, hz: 0.34 },
    cue: "moo",
    biomeWeights: [1.4, 1.2, 0.8, 1.0],
    mirrorable: false,
  },
  cycleRickshaw: {
    id: "cycleRickshaw",
    kind: "moving",
    dims: { hx: 1.13, minY: 0, maxY: 1.5, hz: 0.5 },
    cue: "bell",
    biomeWeights: [1.0, 0.9, 1.2, 1.0],
    mirrorable: false,
  },
  // ------------------------------------------------------- block (dodge only)
  truck: {
    id: "truck",
    kind: "block",
    dims: { hx: 1.12, minY: 0, maxY: 3.0, hz: 1.75 },
    cue: "honk",
    biomeWeights: [1.0, 1.0, 1.2, 1.0],
    mirrorable: false,
  },
  chaiTapri: {
    id: "chaiTapri",
    kind: "block",
    dims: { hx: 1.1, minY: 0, maxY: 2.95, hz: 0.55 },
    cue: null,
    biomeWeights: [1.0, 1.0, 1.1, 0.9],
    mirrorable: false,
  },
  sackCart: {
    id: "sackCart",
    kind: "block",
    dims: { hx: 1.06, minY: 0, maxY: 2.75, hz: 0.55 },
    cue: null,
    biomeWeights: [1.1, 1.0, 0.7, 0.8],
    mirrorable: false,
  },
  autoLoaded: {
    id: "autoLoaded",
    kind: "block",
    dims: { hx: 0.76, minY: 0, maxY: 2.75, hz: 1.34 },
    cue: "honk",
    biomeWeights: [1.0, 0.9, 1.2, 1.0],
    mirrorable: false,
  },
  // ------------------------------------------------ overhead1 (slide, 1 lane)
  signboard: {
    id: "signboard",
    kind: "overhead1",
    dims: { hx: 1.1, minY: 1.45, maxY: 3.7, hz: 0.16 },
    cue: null,
    biomeWeights: [1.3, 1.1, 0.9, 1.0],
    mirrorable: false,
  },
  clothesline: {
    id: "clothesline",
    kind: "overhead1",
    dims: { hx: 1.15, minY: 1.45, maxY: 3.5, hz: 0.2 },
    cue: null,
    biomeWeights: [0.9, 1.1, 1.3, 0.6],
    mirrorable: true,
  },
  banner: {
    id: "banner",
    kind: "overhead1",
    dims: { hx: 1.15, minY: 1.45, maxY: 3.6, hz: 0.16 },
    cue: null,
    biomeWeights: [0.8, 0.9, 1.0, 1.3],
    mirrorable: false,
  },
  // ------------------------------------ overhead3 (slide, full width, solid)
  phaatak: {
    id: "phaatak",
    kind: "overhead3",
    dims: { hx: 3.85, minY: 1.45, maxY: 3.95, hz: 0.3 },
    cue: "bell",
    biomeWeights: [1.0, 0.9, 1.4, 0.8],
    mirrorable: false,
  },
  swagatArch: {
    id: "swagatArch",
    kind: "overhead3",
    dims: { hx: 3.85, minY: 1.45, maxY: 4.0, hz: 0.3 },
    cue: null,
    biomeWeights: [0.9, 1.2, 0.7, 1.5],
    mirrorable: false,
  },
};

export const VARIANTS_BY_KIND: Record<ObstacleKind, readonly ObstacleVariantId[]> = {
  barrier: ["policeBarricade", "thela", "roadWork"],
  moving: ["cow", "cycleRickshaw"],
  block: ["truck", "chaiTapri", "sackCart", "autoLoaded"],
  overhead1: ["signboard", "clothesline", "banner"],
  overhead3: ["phaatak", "swagatArch"],
};

/** Variant picking: repeats of the previous pick of a kind are damped. */
export const VARIANT_PICK = {
  repeatWeightFactor: 0.35,
} as const;

/** Mover animation tuning (visual only — gameplay motion lives in patterns). */
export const MOVER_ANIM = {
  /** Yaw damping (1/s) when a mover turns around at the end of a sweep. */
  turnLambda: 7.5,
  /** Lateral speed (m/s) at which walk/pedal cycles reach full amplitude. */
  fullGaitSpeed: 1.6,
  cowStridePerMeter: 4.6,
  cowLegSwing: 0.46,
  rickshawWheelRadius: 0.33,
  rickshawCrankRatio: 0.55,
  rickshawLegSwing: 0.34,
} as const;

/**
 * Night readability: obstacle paint gains self-illumination as the scene
 * fog/background darkens (luminance in linear space).
 */
export const OBSTACLE_NIGHT = {
  darkLuminance: 0.035,
  dayLuminance: 0.2,
  /** emissiveIntensity per material layer at full night (day values in kit). */
  paintLift: 0.32,
  metalLift: 0.2,
  clothLift: 0.34,
  artLift: 0.62,
} as const;
