import { SaveService } from "@/game/core/SaveService";
import { CHARACTERS } from "@/game/config/characters";
import { xpRequiredForLevel } from "@/game/config/progression";
import type {
  CharacterOptionView,
  PlayerStatsData,
} from "@/types/game";

/**
 * View-model builders for the meta screens (menu tabs + run summary).
 * Read straight from the versioned save; React re-reads whenever the store's
 * metaVersion bumps. Missions/achievements views come from the engine-owned
 * systems (exposed through Game getters) since they own the definitions.
 */
export function levelInfo(): {
  level: number;
  xpInto: number;
  xpForNext: number;
} {
  const save = SaveService.get();
  return {
    level: save.progression.level,
    xpInto: save.progression.xp,
    xpForNext: xpRequiredForLevel(save.progression.level),
  };
}

export function characterOptions(): CharacterOptionView[] {
  const save = SaveService.get();
  const level = save.progression.level;
  return CHARACTERS.map((c) => ({
    id: c.id,
    name: c.name,
    gradient: c.gradient,
    locked: level < c.unlockLevel,
    equipped: save.customization.character === c.id,
    unlockLabel: c.unlockLevel > 1 ? `LEVEL ${c.unlockLevel}` : "DEFAULT",
    icon: c.icon,
    species: c.species,
    description: c.description,
    archetype: c.archetype,
  }));
}

export interface CareerStatsGroup {
  label: string;
  rows: { label: string; value: string }[];
}

export function careerGroups(stats: PlayerStatsData): CareerStatsGroup[] {
  return [
    {
      label: "CAREER",
      rows: [
        { label: "Total Runs", value: stats.totalRuns.toLocaleString() },
        { label: "Distance", value: formatDistance(stats.totalDistance) },
        { label: "Coins", value: stats.totalCoins.toLocaleString() },
        { label: "Play Time", value: formatDuration(stats.totalPlayTime) },
        { label: "Missions Done", value: stats.missionsCompleted.toLocaleString() },
      ],
    },
    {
      label: "BEST",
      rows: [
        { label: "Score", value: stats.bestScore.toLocaleString() },
        { label: "Distance", value: `${stats.bestDistance.toLocaleString()}m` },
        { label: "Combo", value: `×${stats.highestCombo.toLocaleString()}` },
      ],
    },
    {
      label: "SKILLS",
      rows: [
        { label: "Near Misses", value: stats.totalNearMisses.toLocaleString() },
        { label: "Perfect Jumps", value: stats.totalPerfectJumps.toLocaleString() },
        { label: "Perfect Slides", value: stats.totalPerfectSlides.toLocaleString() },
        { label: "Power-ups", value: stats.totalPowerUps.toLocaleString() },
        { label: "Overdrives", value: stats.totalOverdrives.toLocaleString() },
        { label: "Smashes", value: stats.obstaclesSmashed.toLocaleString() },
      ],
    },
  ];
}

export function formatDistance(meters: number): string {
  if (meters >= 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters.toLocaleString()} m`;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}
