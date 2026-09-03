import {
  LEVEL_BONUS_COINS,
  LEVEL_REWARDS,
  RUN_XP,
  XP_CFG,
  xpRequiredForLevel,
} from "@/game/config/progression";
import type { LevelUpInfo, PlayerStatsData, RewardKind, RunTallyData, UnlockInfo } from "@/types/game";
import { clamp } from "@/game/utils/math";
import { SaveService } from "@/game/core/SaveService";

export interface XpGainResult {
  xpEarned: number;
  levelUps: LevelUpInfo[];
  unlocks: UnlockInfo[];
}

/**
 * Owns the XP curve, player levels and level-up reward granting. All state
 * lives in the versioned save; this system is the only writer.
 */
export class ProgressionSystem {
  /** Wallet coins earned outside runs (level/mission/achievement rewards). */
  bonusCoins = 0;

  calculateRunXp(tally: RunTallyData, score: number): number {
    const distancePart =
      Math.min(tally.distance, RUN_XP.distanceCap) * RUN_XP.perMeter;
    const coinPart = tally.coins * RUN_XP.perCoin;
    const scorePart =
      Math.min(score, RUN_XP.scoreCap) * RUN_XP.perScorePoint;
    const skillPart =
      tally.nearMisses * RUN_XP.perNearMiss +
      (tally.perfectJumps + tally.perfectSlides) * RUN_XP.perPerfectAction +
      Math.min(tally.maxCombo, RUN_XP.comboCap) * RUN_XP.perComboPoint +
      tally.overdrives * RUN_XP.perOverdrive +
      tally.obstaclesSmashed * RUN_XP.perSmash;
    return Math.min(
      Math.floor(distancePart + coinPart + scorePart + skillPart),
      XP_CFG.capPerRun
    );
  }

  applyXp(amount: number): XpGainResult {
    const save = SaveService.get();
    save.progression.xp += amount;
    const levelUps: LevelUpInfo[] = [];
    let guard = 0;
    while (
      save.progression.level < XP_CFG.maxLevel &&
      save.progression.xp >= xpRequiredForLevel(save.progression.level) &&
      guard++ < XP_CFG.maxLevel
    ) {
      const from = save.progression.level;
      save.progression.xp -= xpRequiredForLevel(from);
      save.progression.level = from + 1;
      const rewards = [
        ...(LEVEL_REWARDS[save.progression.level] ?? []),
        {
          kind: "coins" as const,
          amount: LEVEL_BONUS_COINS,
          label: `${LEVEL_BONUS_COINS} COINS`,
        },
      ];
      for (const reward of rewards) {
        if (reward.kind === "coins") this.bonusCoins += reward.amount ?? 0;
        if (reward.kind === "character") {
          if (!save.customization.unlockedCharacters.includes(reward.id!)) {
            save.customization.unlockedCharacters.push(reward.id!);
          }
        }
        if (reward.kind === "badge") {
          if (!save.customization.badges.includes(reward.id!)) {
            save.customization.badges.push(reward.id!);
          }
        }
      }
      levelUps.push({ from, to: save.progression.level, rewards });
    }
    SaveService.persist();
    return {
      xpEarned: amount,
      levelUps,
      unlocks: levelUps.flatMap((lu) =>
        lu.rewards
          .filter((r) => r.kind !== "coins")
          .map((r): UnlockInfo => ({ kind: r.kind as RewardKind, label: r.label }))
      ),
    };
  }

  get level(): number {
    return SaveService.get().progression.level;
  }

  get xpIntoLevel(): number {
    return SaveService.get().progression.xp;
  }

  xpForNext(level = this.level): number {
    return xpRequiredForLevel(level);
  }

  addBonusCoins(amount: number): void {
    this.bonusCoins += amount;
  }

  resetRunState(): void {
    this.bonusCoins = 0;
  }

  mergeRunStats(tally: RunTallyData, score: number): void {
    SaveService.update((save) => {
      const stats: PlayerStatsData = save.stats;
      stats.totalRuns += 1;
      stats.totalDistance += Math.floor(tally.distance);
      stats.totalCoins += tally.coins;
      stats.bestScore = Math.max(stats.bestScore, score);
      stats.bestDistance = Math.max(stats.bestDistance, Math.floor(tally.distance));
      stats.highestCombo = Math.max(stats.highestCombo, tally.maxCombo);
      stats.totalNearMisses += tally.nearMisses;
      stats.totalPerfectJumps += tally.perfectJumps;
      stats.totalPerfectSlides += tally.perfectSlides;
      stats.totalPowerUps += tally.powerUps;
      stats.totalOverdrives += tally.overdrives;
      stats.obstaclesSmashed += tally.obstaclesSmashed;
      stats.totalPlayTime += Math.floor(clamp(tally.survivalTime, 0, 24 * 3600));
    });
  }
}
