import type { Reward } from "@/types/game";

/**
 * XP curve and level rewards. xpRequired(level) grows polynomially so the
 * first levels arrive quickly and later ones demand real mileage.
 */
export const XP_CFG = {
  base: 80,
  exponent: 1.35,
  maxLevel: 50,
  /** Hard cap on XP a single run can grant. */
  capPerRun: 2600,
} as const;

export function xpRequiredForLevel(level: number): number {
  return Math.round(XP_CFG.base * Math.pow(level, XP_CFG.exponent));
}

/** Run → XP weights (kept deliberately sub-linear vs. score). */
export const RUN_XP = {
  perMeter: 0.35,
  distanceCap: 9000,
  perCoin: 1.5,
  perScorePoint: 0.008,
  scoreCap: 160000,
  perNearMiss: 6,
  perPerfectAction: 4,
  perComboPoint: 3,
  comboCap: 60,
  perOverdrive: 15,
  perSmash: 2,
} as const;

/** Small coin gift every time the player levels up, on top of the table. */
export const LEVEL_BONUS_COINS = 30;

/**
 * Data-driven level rewards. Levels without entries simply grant
 * LEVEL_BONUS_COINS. Cosmetic ids reference config/characters.ts.
 */
export const LEVEL_REWARDS: Record<number, Reward[]> = {
  2: [{ kind: "coins", amount: 100, label: "100 COINS" }],
  3: [{ kind: "character", id: "ember", label: "EMBER UNIT" }],
  4: [{ kind: "coins", amount: 150, label: "150 COINS" }],
  5: [{ kind: "trail", id: "electric", label: "ELECTRIC TRAIL" }],
  6: [{ kind: "character", id: "wraith", label: "WRAITH UNIT" }],
  7: [{ kind: "coins", amount: 200, label: "200 COINS" }],
  9: [{ kind: "badge", id: "spark", label: "SPARK BADGE" }],
  10: [{ kind: "character", id: "aurora", label: "AURORA UNIT" }],
  12: [{ kind: "trail", id: "fire", label: "FIRE TRAIL" }],
  14: [{ kind: "coins", amount: 400, label: "400 COINS" }],
  15: [{ kind: "trail", id: "neonPurple", label: "NEON PURPLE TRAIL" }],
  18: [{ kind: "coins", amount: 500, label: "500 COINS" }],
  20: [{ kind: "trail", id: "void", label: "VOID TRAIL" }],
  22: [{ kind: "badge", id: "surge", label: "SURGE BADGE" }],
  25: [{ kind: "coins", amount: 800, label: "800 COINS" }],
  30: [{ kind: "coins", amount: 1500, label: "1500 COINS" }],
};
