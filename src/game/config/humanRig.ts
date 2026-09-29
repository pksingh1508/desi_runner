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

/**
 * Logical animation states → clip names. Everything comes from the UAL
 * except the slide: the pack only has a forward "Roll", so the lean-back
 * slide is authored in code (see HUMAN_SLIDE / SlideClip).
 */
export const HUMAN_CLIPS = {
  idle: "Idle_Loop",
  run: "Sprint_Loop",
  jump: "Jump_Loop",
  land: "Jump_Land",
  slide: "Desi_Slide",
  /** Used only if a body can't bake the slide (missing UAL bones). */
  slideFallback: "Roll",
  death: "Death01",
  dance: "Dance_Loop",
  ride: "Driving_Loop",
} as const;

type Vec3 = readonly [number, number, number];

/**
 * One slide keyframe pose in rig space (+Y up, +Z forward = running
 * direction, +X = the runner's left), measured on the unscaled body.
 */
export interface SlidePose {
  /** Pelvis joint position — drops the body to the road. */
  pelvis: Vec3;
  /** Direction each bone points (joint → child joint); unlisted bones keep
   * their rest pose relative to their parent. */
  aim: Readonly<Record<string, Vec3>>;
  /** Hinge flexion in radians (knees / elbows bend on their own axis). */
  bend: Readonly<Record<string, number>>;
}

/** Spine-style aim: upright, leaned back by `degrees`, drifting sideways. */
function leanBack(degrees: number, side = 0): Vec3 {
  const r = (degrees * Math.PI) / 180;
  return [side, Math.cos(r), -Math.sin(r)];
}

/**
 * Opening of the slide, straight out of a sprint stride: lead foot reaching
 * forward to the road, trailing foot pushing off behind, weight going back.
 */
const SLIDE_DROP: SlidePose = {
  pelvis: [0, 0.72, -0.04],
  aim: {
    pelvis: leanBack(16),
    spine_01: leanBack(14),
    spine_02: leanBack(11),
    spine_03: leanBack(8),
    neck_01: leanBack(-2),
    Head: leanBack(-4),
    upperarm_l: [0.42, -0.3, 0.86],
    upperarm_r: [-0.3, -0.9, -0.32],
    thigh_l: [0.04, -0.7, 0.71],
    thigh_r: [-0.04, -0.94, -0.34],
    foot_r: [-0.02, -0.5, -0.87],
  },
  bend: { lowerarm_l: 0.5, lowerarm_r: 0.3, calf_l: 0.25, calf_r: 0.7 },
};

/**
 * Full slide: hips on the road, torso leaned far back, lead (left) leg
 * stretched forward heel-first, trailing knee up with that foot planted,
 * right hand trailing by the road for balance and left arm thrown up.
 * Everything stays below ~1 m, under the 0.95 m slide collider's gates.
 */
const SLIDE_LOW: SlidePose = {
  pelvis: [0, 0.22, -0.08],
  aim: {
    pelvis: leanBack(62, -0.08),
    spine_01: leanBack(58, -0.08),
    spine_02: leanBack(52, -0.06),
    spine_03: leanBack(44, -0.04),
    neck_01: leanBack(22),
    Head: leanBack(12),
    upperarm_l: [0.55, 0.62, 0.56],
    upperarm_r: [-0.42, -0.82, -0.38],
    thigh_l: [0.05, -0.1, 0.99],
    thigh_r: [-0.14, 0.34, 0.93],
    foot_r: [-0.05, -0.1, 0.99],
  },
  bend: { lowerarm_l: 0.5, lowerarm_r: 0.45, calf_l: 0.12, calf_r: 0.85 },
};

/** Mid-slide settle: a touch lower and further back so the hold breathes. */
const SLIDE_SETTLE: SlidePose = {
  ...SLIDE_LOW,
  pelvis: [0, 0.2, -0.08],
  aim: {
    ...SLIDE_LOW.aim,
    pelvis: leanBack(65, -0.08),
    spine_01: leanBack(61, -0.08),
    spine_02: leanBack(55, -0.06),
    upperarm_l: [0.5, 0.7, 0.51],
  },
};

/**
 * Pop-up: lead foot planted under the hips, trailing leg swinging through,
 * torso back over the feet — close to a sprint stride for the crossfade.
 */
const SLIDE_RISE: SlidePose = {
  pelvis: [0, 0.8, -0.02],
  aim: {
    pelvis: leanBack(6),
    spine_01: leanBack(3),
    spine_02: leanBack(0),
    spine_03: leanBack(-3),
    neck_01: leanBack(-8),
    Head: leanBack(-4),
    upperarm_l: [0.3, -0.62, 0.72],
    upperarm_r: [-0.28, -0.86, -0.42],
    thigh_l: [0.03, -0.8, 0.6],
    thigh_r: [-0.03, -0.97, -0.25],
    foot_l: [0, -0.3, 0.95],
  },
  bend: { lowerarm_l: 0.95, lowerarm_r: 0.55, calf_l: 1.27, calf_r: 0.9 },
};

/**
 * Lean-back slide keyframes. `at` is a fraction of PLAYER.slideDuration;
 * the controller fades the sprint out/in around the clip.
 */
export const HUMAN_SLIDE = {
  keys: [
    { at: 0, pose: SLIDE_DROP },
    { at: 0.2, pose: SLIDE_LOW },
    { at: 0.52, pose: SLIDE_SETTLE },
    { at: 0.8, pose: SLIDE_LOW },
    { at: 1, pose: SLIDE_RISE },
  ],
  /** Bones copied from this clip's first frame (relaxed running hands). */
  handReference: "Sprint_Loop",
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
