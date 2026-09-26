import type { HairStyle, HumanBody } from "./characters";

/**
 * Realistic human runner assets + rig tuning.
 *
 * Bodies: Quaternius "Universal Base Characters" (CC0), animations:
 * Quaternius "Universal Animation Library" (CC0) — both share the same
 * 65-bone humanoid skeleton, so clips bind to every body by bone name.
 * Assets were optimized offline (WebP textures, stripped attributes,
 * rotation-only clips + pelvis translation). See ASSETS.md.
 */
export const HUMAN_ASSETS = {
  bodies: {
    male: "/models/desi/runner_male.glb",
    female: "/models/desi/runner_female.glb",
  } satisfies Record<HumanBody, string>,
  hair: "/models/desi/hair.glb",
  animations: "/models/desi/anims.glb",
} as const;

/** Mesh node names inside hair.glb. */
export const HAIR_MESH: Record<HairStyle | "Beard", string> = {
  SimpleParted: "Hair_SimpleParted",
  Buzzed: "Hair_Buzzed",
  Long: "Hair_Long",
  Buns: "Hair_Buns",
  BuzzedFemale: "Hair_BuzzedFemale",
  Beard: "Hair_Beard",
};

/** Logical animation states → UAL clip names. */
export const HUMAN_CLIPS = {
  idle: "Idle_Loop",
  run: "Sprint_Loop",
  jump: "Jump_Loop",
  land: "Jump_Land",
  slide: "Roll",
  death: "Death01",
  dance: "Dance_Loop",
  ride: "Driving_Loop",
} as const;

/**
 * Pelvis rest translation of the UAL mannequin (parent/root space). Clips are
 * re-offset per body so feet stay planted on differently proportioned rigs.
 */
export const UAL_PELVIS_REST: readonly [number, number, number] = [0, 0.0501, 0.9167];

/**
 * Bind-pose (T-pose, Y-up, meters, face +Z) landmarks per body — the outfit
 * shader cuts garments against these, accessories anchor to them.
 */
export interface BodyLandmarks {
  shoulderX: number;
  elbowX: number;
  wristX: number;
  armY: number;
  neckY: number;
  headY: number;
  headTopY: number;
  waistY: number;
  hipX: number;
  kneeY: number;
  ankleY: number;
  /** Visual scale applied to the rig so the runner reads ~1.85 m tall. */
  scale: number;
}

export const BODY_LANDMARKS: Record<HumanBody, BodyLandmarks> = {
  male: {
    shoulderX: 0.212,
    elbowX: 0.463,
    wristX: 0.706,
    armY: 1.455,
    neckY: 1.52,
    headY: 1.6,
    headTopY: 1.81,
    waistY: 0.985,
    hipX: 0.114,
    kneeY: 0.542,
    ankleY: 0.086,
    scale: 1.03,
  },
  female: {
    shoulderX: 0.152,
    elbowX: 0.392,
    wristX: 0.641,
    armY: 1.418,
    neckY: 1.485,
    headY: 1.55,
    headTopY: 1.767,
    waistY: 0.97,
    hipX: 0.111,
    kneeY: 0.535,
    ankleY: 0.071,
    scale: 1.05,
  },
};

/** Runtime tuning for the human rig. */
export const HUMAN_RIG = {
  /** Sprint clip speed range mapped from the run speed ratio. */
  runTimeScaleMin: 0.92,
  runTimeScaleMax: 1.38,
  /** Crossfade durations (seconds). */
  fadeFast: 0.12,
  fadeRun: 0.18,
  fadeDeath: 0.08,
  /** Cloth (dupatta / gamcha tail) simulation. */
  cloth: {
    segments: 12,
    gravity: 9.5,
    damping: 0.9,
    /** Relative wind from forward motion, scaled by world speed. */
    windPerSpeed: 0.55,
    windMax: 16,
    iterations: 3,
  },
} as const;
