import { ACHIEVEMENTS } from "@/game/config/achievements";
import { SaveService } from "@/game/core/SaveService";
import type {
  CompletedAchievementInfo,
  PlayerStatsData,
} from "@/types/game";

/**
 * Data-driven achievement checks. Purely derived from lifetime stats, so a
 * single check after each run (and after any reward grant) suffices.
 */
export class AchievementSystem {
  private pendingCompletion = false;

  /** Returns achievements newly completed by the current stats snapshot. */
  check(stats: PlayerStatsData): CompletedAchievementInfo[] {
    const completedNow: CompletedAchievementInfo[] = [];
    SaveService.update((save) => {
      for (const def of ACHIEVEMENTS) {
        if (save.achievements.completed.includes(def.id)) continue;
        const value = stats[def.metric];
        if (typeof value === "number" && value >= def.target) {
          save.achievements.completed.push(def.id);
          completedNow.push({
            title: def.title,
            icon: def.icon,
            rewardXp: def.rewardXp,
            rewardCoins: def.rewardCoins,
          });
          this.pendingCompletion = true;
        }
      }
    });
    return completedNow;
  }

  view(): {
    id: string;
    title: string;
    description: string;
    icon: string;
    target: number;
    progress: number;
    completed: boolean;
    rewardXp: number;
    rewardCoins: number;
  }[] {
    const save = SaveService.get();
    return ACHIEVEMENTS.map((def) => ({
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      target: def.target,
      progress: Math.min(
        typeof save.stats[def.metric] === "number"
          ? (save.stats[def.metric] as number)
          : 0,
        def.target
      ),
      completed: save.achievements.completed.includes(def.id),
      rewardXp: def.rewardXp,
      rewardCoins: def.rewardCoins,
    }));
  }

  get hasPendingFeedback(): boolean {
    return this.pendingCompletion;
  }

  clearPending(): void {
    this.pendingCompletion = false;
  }
}
