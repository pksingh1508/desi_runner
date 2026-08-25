import type { ObstacleKind } from "@/game/entities/Obstacle";

export interface PatternObstacle {
  kind: ObstacleKind;
  /** Lane index 0..2 (fractional allowed only for coins). */
  lane: number;
  /** Local z inside the segment (negative, extends forward). */
  z: number;
  moveAmp?: number;
  moveSpeed?: number;
}

export interface PatternCoin {
  x: number;
  z: number;
  y?: number;
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
    out.push({ x: LANES[lane], z, y });
  }
  return out;
}

/**
 * Hand-authored, always-survivable pattern templates. Every row leaves at
 * least one valid action (lane change / jump / slide), satisfying the
 * "never generate impossible sequences" rule by construction.
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
      { kind: "barrier", lane: 2, z: -26 },
    ],
    coins: [...arc(0, -12), ...line(1, -18, 3), ...arc(2, -26)],
  },
  {
    id: "dodge-blocks",
    minTier: 1,
    weight: 2,
    obstacles: [
      { kind: "block", lane: 0, z: -10 },
      { kind: "block", lane: 2, z: -10 },
      { kind: "block", lane: 1, z: -25 },
      { kind: "block", lane: 2, z: -25 },
    ],
    // Open path: center @-10 then left @-25; coins trace the safe route.
    coins: [...line(1, -6, 3), ...line(0, -21, 4)],
  },
  {
    id: "weave",
    minTier: 1,
    weight: 1.8,
    obstacles: [
      { kind: "block", lane: 1, z: -9 },
      { kind: "overhead1", lane: 0, z: -21 },
      { kind: "block", lane: 2, z: -33 },
    ],
    coins: [...line(0, -6, 2), ...line(1, -17, 3), ...line(1, -29, 3)],
  },
  {
    id: "double-slide",
    minTier: 1,
    weight: 1.6,
    obstacles: [
      { kind: "overhead3", lane: 1, z: -11 },
      { kind: "overhead3", lane: 1, z: -27 },
    ],
    coins: [...line(1, -15, 3), ...line(1, -32, 4)],
  },
  {
    id: "gauntlet",
    minTier: 2,
    weight: 2,
    obstacles: [
      { kind: "overhead3", lane: 1, z: -10 },
      { kind: "barrier", lane: 1, z: -24 },
      { kind: "moving", lane: 1, z: -38, moveAmp: 2.5, moveSpeed: 1.7 },
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
      { kind: "overhead3", lane: 1, z: -22 },
      { kind: "moving", lane: 1, z: -36, moveAmp: 2.5, moveSpeed: 2.1 },
    ],
    coins: [...line(1, -13, 3), ...line(1, -28, 2)],
  },
  {
    id: "slalom",
    minTier: 3,
    weight: 1.6,
    obstacles: [
      { kind: "moving", lane: 1, z: -10, moveAmp: 2.5, moveSpeed: 2.4 },
      { kind: "block", lane: 0, z: -23 },
      { kind: "barrier", lane: 1, z: -23 },
      { kind: "overhead3", lane: 1, z: -37 },
    ],
    coins: [...line(2, -19, 3), ...arc(1, -23)],
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
];

/** Weighted pick among patterns unlocked for the tier, avoiding immediate repeats. */
export function pickPattern(
  tierIndex: number,
  lastPatternId: string | null
): PatternDef {
  const eligible = PATTERNS.filter((p) => p.minTier <= tierIndex);
  let pool = eligible.filter((p) => p.id !== lastPatternId);
  if (pool.length === 0) pool = eligible;
  const weights = pool.map((p) => p.weight);
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
