import type { ObstacleKind } from "@/game/entities/Obstacle";
import type { ObstacleVariantId } from "@/game/config/obstacles";

export interface PatternObstacle {
  kind: ObstacleKind;
  /** Lane index 0..2 (fractional allowed only for coins). */
  lane: number;
  /** Local z inside the segment (negative, extends forward). */
  z: number;
  moveAmp?: number;
  moveSpeed?: number;
  /**
   * Optional authored street prop for this slot (must belong to `kind`).
   * Purely visual — gameplay validity only depends on `kind`.
   */
  variant?: ObstacleVariantId;
}

export interface PatternCoin {
  x: number;
  z: number;
  y?: number;
  /** Jump-arc coin (scales with speed at spawn); ground lines leave it unset. */
  arc?: boolean;
}

export interface PatternDef {
  id: string;
  minTier: number;
  weight: number;
  obstacles: PatternObstacle[];
  coins: PatternCoin[];
}

const LANES = [-2.5, 0, 2.5];

/** Ground-level coin line in a lane. */
function line(lane: number, zStart: number, count: number, step = 4): PatternCoin[] {
  const out: PatternCoin[] = [];
  for (let i = 0; i < count; i++) out.push({ x: LANES[lane], z: zStart - i * step });
  return out;
}

/** Jump arc peaking over an obstacle at zCenter (default peak ≈ jump apex). */
function arc(lane: number, zCenter: number, peak = 2.7, count = 7, span = 12): PatternCoin[] {
  const out: PatternCoin[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = zCenter + span / 2 - t * span;
    const y = 0.75 + Math.sin(t * Math.PI) * peak;
    out.push({ x: LANES[lane], z, y, arc: true });
  }
  return out;
}

/**
 * Hand-authored, always-survivable pattern templates. Every row leaves at
 * least one valid action (lane change / jump / slide), satisfying the
 * "never generate impossible sequences" rule by construction.
 *
 * Base rows sit 16–18m apart: at start speed (12m/s) that is ~1.4s of
 * reaction time, and WorldManager stretches rows further apart as speed
 * rises so the *time* gap never collapses at 32m/s. Tails stay ≥ -42
 * (PATTERN.maxTailZ) so authored rows are never dropped at start speed.
 */
export const PATTERNS: PatternDef[] = [
  {
    id: "warmup-line",
    minTier: 0,
    weight: 1.2,
    obstacles: [],
    coins: [...line(1, -10, 8)],
  },
  {
    id: "jump-single",
    minTier: 0,
    weight: 2,
    obstacles: [{ kind: "barrier", lane: 1, z: -16 }],
    coins: [...arc(1, -16), ...line(0, -30, 3)],
  },
  {
    id: "slide-gate",
    minTier: 0,
    weight: 2,
    obstacles: [{ kind: "overhead3", lane: 1, z: -14 }],
    coins: [...line(1, -20, 4), ...line(2, -34, 3)],
  },
  {
    id: "side-jumps",
    minTier: 0,
    weight: 1.6,
    obstacles: [
      { kind: "barrier", lane: 0, z: -12 },
      { kind: "barrier", lane: 2, z: -30 },
    ],
    coins: [...arc(0, -12), ...line(1, -19, 3), ...arc(2, -30)],
  },
  {
    id: "dodge-blocks",
    minTier: 1,
    weight: 2,
    obstacles: [
      { kind: "block", lane: 0, z: -10 },
      { kind: "block", lane: 2, z: -10 },
      { kind: "block", lane: 1, z: -28 },
      { kind: "block", lane: 2, z: -28 },
    ],
    // Open path: center @-10 then left @-28; coins trace the safe route.
    coins: [...line(1, -6, 3), ...line(0, -23, 4)],
  },
  {
    id: "weave",
    minTier: 1,
    weight: 1.8,
    obstacles: [
      { kind: "block", lane: 1, z: -8 },
      { kind: "overhead1", lane: 0, z: -24 },
      { kind: "block", lane: 2, z: -40 },
    ],
    coins: [...line(0, -5, 2), ...line(1, -19, 3), ...line(1, -35, 3)],
  },
  {
    id: "double-slide",
    minTier: 1,
    weight: 1.6,
    obstacles: [
      { kind: "overhead3", lane: 1, z: -11 },
      { kind: "overhead3", lane: 1, z: -29 },
    ],
    coins: [...line(1, -16, 3), ...line(1, -34, 4)],
  },
  {
    id: "gauntlet",
    minTier: 2,
    weight: 2,
    obstacles: [
      { kind: "overhead3", lane: 1, z: -8 },
      { kind: "barrier", lane: 1, z: -24 },
      { kind: "moving", lane: 1, z: -40, moveAmp: 2.5, moveSpeed: 1.7 },
    ],
    coins: [...arc(1, -24), ...line(0, -31, 2)],
  },
  {
    id: "pinch",
    minTier: 2,
    weight: 1.8,
    obstacles: [
      { kind: "block", lane: 0, z: -8 },
      { kind: "block", lane: 2, z: -8 },
      { kind: "overhead3", lane: 1, z: -24 },
      { kind: "moving", lane: 1, z: -40, moveAmp: 2.5, moveSpeed: 2.1 },
    ],
    coins: [...line(1, -13, 3), ...line(1, -30, 2)],
  },
  {
    id: "slalom",
    minTier: 3,
    weight: 1.6,
    obstacles: [
      { kind: "moving", lane: 1, z: -8, moveAmp: 2.5, moveSpeed: 2.4 },
      { kind: "block", lane: 0, z: -24 },
      { kind: "barrier", lane: 1, z: -24 },
      { kind: "overhead3", lane: 1, z: -40 },
    ],
    coins: [...line(2, -19, 3), ...arc(1, -24)],
  },
  {
    id: "coin-rush",
    minTier: 1,
    weight: 0.9,
    obstacles: [],
    coins: [
      ...line(0, -8, 4),
      ...line(1, -22, 4),
      ...line(2, -36, 4),
    ],
  },

  // ------------------------------------------------ Indian street patterns
  {
    // A lazy cow ambles across all three lanes: jump her (or time the gap).
    id: "cow-crossing",
    minTier: 1,
    weight: 1.4,
    obstacles: [{ kind: "moving", lane: 1, z: -14, moveAmp: 2.5, moveSpeed: 1.45, variant: "cow" }],
    coins: [...arc(1, -14), ...line(0, -27, 3)],
  },
  {
    // Slide under the railway phaatak, then hop the sabzi thelas (or swerve right).
    id: "phaatak-thela",
    minTier: 1,
    weight: 1.5,
    obstacles: [
      { kind: "overhead3", lane: 1, z: -10, variant: "phaatak" },
      { kind: "barrier", lane: 0, z: -28, variant: "thela" },
      { kind: "barrier", lane: 1, z: -28, variant: "thela" },
    ],
    coins: [...line(1, -14, 2), ...arc(1, -28), ...line(2, -36, 2)],
  },
  {
    // Weave between chai stalls: open lane goes center → right → right.
    id: "chai-slalom",
    minTier: 2,
    weight: 1.3,
    obstacles: [
      { kind: "block", lane: 0, z: -8, variant: "chaiTapri" },
      { kind: "block", lane: 2, z: -8, variant: "truck" },
      { kind: "block", lane: 1, z: -24, variant: "chaiTapri" },
      { kind: "block", lane: 0, z: -40, variant: "sackCart" },
      { kind: "block", lane: 1, z: -40, variant: "autoLoaded" },
    ],
    coins: [...line(1, -4, 2), ...line(2, -18, 3), ...line(2, -36, 3)],
  },
  {
    // Bell-ringing rickshaw, a shop sign + barricade row, then another cow.
    id: "rickshaw-rush",
    minTier: 2,
    weight: 1.2,
    obstacles: [
      { kind: "moving", lane: 1, z: -8, moveAmp: 2.5, moveSpeed: 1.9, variant: "cycleRickshaw" },
      { kind: "overhead1", lane: 0, z: -24, variant: "signboard" },
      { kind: "barrier", lane: 2, z: -24, variant: "policeBarricade" },
      { kind: "moving", lane: 1, z: -40, moveAmp: 2.2, moveSpeed: 1.6, variant: "cow" },
    ],
    coins: [...arc(1, -8), ...line(1, -19, 3), ...arc(1, -40)],
  },
  {
    // Bazaar gauntlet: slide under laundry, jump the barricade row, slide the arch.
    id: "bazaar-gauntlet",
    minTier: 3,
    weight: 1.2,
    obstacles: [
      { kind: "overhead1", lane: 0, z: -8, variant: "clothesline" },
      { kind: "block", lane: 1, z: -8, variant: "truck" },
      { kind: "overhead1", lane: 2, z: -8, variant: "clothesline" },
      { kind: "barrier", lane: 0, z: -24, variant: "thela" },
      { kind: "barrier", lane: 1, z: -24, variant: "policeBarricade" },
      { kind: "barrier", lane: 2, z: -24, variant: "roadWork" },
      { kind: "overhead3", lane: 1, z: -40, variant: "swagatArch" },
    ],
    coins: [...line(0, -4, 3), ...arc(1, -24), ...line(1, -34, 3)],
  },
];

/** Weighted pick among patterns unlocked for the tier, avoiding immediate repeats.
 * @param emptyBonus added to the weight of obstacle-free (breather) patterns
 * so late runs keep recovery windows as speed rises.
 */
export function pickPattern(
  tierIndex: number,
  lastPatternId: string | null,
  emptyBonus = 0
): PatternDef {
  const eligible = PATTERNS.filter((p) => p.minTier <= tierIndex);
  let pool = eligible.filter((p) => p.id !== lastPatternId);
  if (pool.length === 0) pool = eligible;
  const weights = pool.map((p) => p.weight + (p.obstacles.length === 0 ? emptyBonus : 0));
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * TRAFFIC JAM chains injected by the RunEventSystem (the "laserGrid" event).
 * Never picked by random generation (kept out of PATTERNS) but validated
 * like every other template: each row leaves one open lane (or a jump /
 * slide), and the open lane only ever shifts by one lane between rows.
 */
export const LASER_PATTERNS: PatternDef[] = [
  {
    // Snake through stalled traffic: open lane right → center → left.
    id: "jam-chain-a",
    minTier: 0,
    weight: 0,
    obstacles: [
      { kind: "block", lane: 0, z: -8, variant: "truck" },
      { kind: "block", lane: 1, z: -8, variant: "autoLoaded" },
      { kind: "block", lane: 0, z: -24, variant: "truck" },
      { kind: "block", lane: 2, z: -24, variant: "truck" },
      { kind: "block", lane: 1, z: -40, variant: "autoLoaded" },
      { kind: "block", lane: 2, z: -40, variant: "truck" },
    ],
    coins: [...line(2, -4, 3), ...line(1, -20, 3), ...line(0, -36, 3)],
  },
  {
    // Jam with a cow wandering through it: dodge left, jump the cow, go center.
    id: "jam-chain-b",
    minTier: 0,
    weight: 0,
    obstacles: [
      { kind: "block", lane: 1, z: -8, variant: "sackCart" },
      { kind: "block", lane: 2, z: -8, variant: "truck" },
      { kind: "moving", lane: 1, z: -24, moveAmp: 2.5, moveSpeed: 1.5, variant: "cow" },
      { kind: "block", lane: 0, z: -40, variant: "truck" },
      { kind: "block", lane: 2, z: -40, variant: "chaiTapri" },
    ],
    coins: [...line(0, -4, 3), ...arc(0, -24), ...line(1, -36, 3)],
  },
];

/** Number of traffic-jam patterns queued per event. */
export const LASER_PATTERN_COUNT = LASER_PATTERNS.length;
