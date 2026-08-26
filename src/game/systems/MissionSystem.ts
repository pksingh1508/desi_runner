import {
  generateDailyMissions,
  getMissionTemplate,
  todayKey,
} from "@/game/config/missions";
import { SaveService } from "@/game/core/SaveService";
import type { CompletedMissionInfo, MissionType } from "@/types/game";

/** Deltas for cumulative missions + absolute values for "max" missions. */
export interface MissionProgressInput {
  deltas: Partial<
    Record<
      | "collectCoins"
      | "travelDistance"
      | "jumpObstacles"
      | "slideObstacles"
      | "nearMisses"
      | "perfectActions"
      | "useOverdrive"
      | "collectPowerUps",
      number
    >
  >;
  absolutes: Partial<
    Record<"reachCombo" | "scoreInSingleRun" | "survivalTime", number>
  >;
}

const TYPE_TO_DELTA = new Map<MissionType, keyof NonNullable<MissionProgressInput["deltas"]>>([
  ["collectCoins", "collectCoins"],
  ["travelDistance", "travelDistance"],
  ["jumpObstacles", "jumpObstacles"],
  ["slideObstacles", "slideObstacles"],
  ["nearMisses", "nearMisses"],
  ["perfectActions", "perfectActions"],
  ["useOverdrive", "useOverdrive"],
  ["collectPowerUps", "collectPowerUps"],
]);

/**
 * Tracks the three daily missions. Generation is deterministic per calendar
 * date (documented device-clock limitation). Completion fires mid-run
 * feedback; all rewards are banked at run end and itemized in the summary.
 */
export class MissionSystem {
  private pendingCompletion = false;

  /** Regenerates the daily set when the calendar date changed. */
  ensureToday(): void {
    const dateKey = todayKey();
    SaveService.update((save) => {
      if (save.missions.date === dateKey && save.missions.entries.length > 0) return;
      const generated = generateDailyMissions(dateKey);
      save.missions.date = dateKey;
      save.missions.entries = generated.map((m) => ({
        id: m.id,
        templateId: m.templateId,
        target: m.target,
      }));
      save.missions.progress = {};
      save.missions.completed = [];
    });
  }

  /**
   * Feed live run values. Called periodically during a run and once at the
   * end. Returns missions completed by this call (for instant feedback).
   */
  progress(input: MissionProgressInput): CompletedMissionInfo[] {
    const completedNow: CompletedMissionInfo[] = [];
    SaveService.update((save) => {
      for (const entry of save.missions.entries) {
        if (save.missions.completed.includes(entry.id)) continue;
        const template = getMissionTemplate(entry.templateId);
        let current = save.missions.progress[entry.id] ?? 0;

        if (template.mode === "cumulative") {
          const deltaKey = TYPE_TO_DELTA.get(template.type);
          current += deltaKey ? input.deltas[deltaKey] ?? 0 : 0;
        } else {
          const absolute =
            template.type === "reachCombo"
              ? input.absolutes.reachCombo ?? 0
              : template.type === "scoreInSingleRun"
                ? input.absolutes.scoreInSingleRun ?? 0
                : input.absolutes.survivalTime ?? 0;
          current = Math.max(current, absolute);
        }

        save.missions.progress[entry.id] = Math.min(current, entry.target);
        if (current >= entry.target) {
          save.missions.completed.push(entry.id);
          save.stats.missionsCompleted += 1;
          completedNow.push({
            title: `${template.title} — ${describe(template.type, entry.target)}`,
            rewardXp: template.rewardXp,
            rewardCoins: template.rewardCoins,
          });
          this.pendingCompletion = true;
        }
      }
    });
    return completedNow;
  }

  /** Rewards for every mission completed today (banked at run end). */
  claimRewards(): CompletedMissionInfo[] {
    const save = SaveService.get();
    return save.missions.entries
      .filter((entry) => save.missions.completed.includes(entry.id))
      .map((entry) => {
        const template = getMissionTemplate(entry.templateId);
        return {
          title: `${template.title} — ${describe(template.type, entry.target)}`,
          rewardXp: template.rewardXp,
          rewardCoins: template.rewardCoins,
        };
      });
  }

  get hasPendingFeedback(): boolean {
    return this.pendingCompletion;
  }

  clearPending(): void {
    this.pendingCompletion = false;
  }

  view(): {
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
    return save.missions.entries.map((entry) => {
      const template = getMissionTemplate(entry.templateId);
      return {
        title: template.title,
        description: describe(template.type, entry.target),
        icon: template.icon,
        target: entry.target,
        progress: Math.min(save.missions.progress[entry.id] ?? 0, entry.target),
        completed: save.missions.completed.includes(entry.id),
        rewardXp: template.rewardXp,
        rewardCoins: template.rewardCoins,
      };
    });
  }

  resetRunFlags(): void {
    this.pendingCompletion = false;
  }
}

function describe(type: MissionType, target: number): string {
  switch (type) {
    case "collectCoins": return `Collect ${target} coins`;
    case "travelDistance": return `Travel ${target.toLocaleString()}m`;
    case "jumpObstacles": return `Land ${target} perfect jumps`;
    case "slideObstacles": return `Make ${target} perfect slides`;
    case "nearMisses": return `Perform ${target} near misses`;
    case "perfectActions": return `Perform ${target} perfect actions`;
    case "reachCombo": return `Reach combo ×${target}`;
    case "useOverdrive": return `Activate Overdrive ×${target}`;
    case "collectPowerUps": return `Grab ${target} power-ups`;
    case "scoreInSingleRun": return `Score ${target.toLocaleString()} in one run`;
    case "survivalTime": return `Survive ${target}s in one run`;
  }
}
