import type { MissionType } from "@/types/game";

/**
 * Mission templates are data-driven; daily missions pick 3 distinct
 * templates deterministically from the calendar date so every device sees
 * the same set on the same day (no backend required).
 *
 * mode:
 *  - "cumulative": progress accumulates across runs until target reached.
 *  - "max": progress records the best single-run value.
 */
export interface MissionTemplate {
  templateId: string;
  type: MissionType;
  title: string;
  icon: string;
  /** Candidate targets; the seeded roll picks one. */
  targets: number[];
  rewardXp: number;
  rewardCoins: number;
  mode: "cumulative" | "max";
}

export const DAILY_MISSION_COUNT = 3;

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    templateId: "collector",
    type: "collectCoins",
    title: "COLLECTOR",
    icon: "✦",
    targets: [300, 450],
    rewardXp: 220,
    rewardCoins: 90,
    mode: "cumulative",
  },
  {
    templateId: "longhaul",
    type: "travelDistance",
    title: "LONG HAUL",
    icon: "⇥",
    targets: [2500, 4000],
    rewardXp: 260,
    rewardCoins: 110,
    mode: "cumulative",
  },
  {
    templateId: "jumper",
    type: "jumpObstacles",
    title: "SKY HOPPER",
    icon: "▲",
    targets: [12, 18],
    rewardXp: 200,
    rewardCoins: 80,
    mode: "cumulative",
  },
  {
    templateId: "slider",
    type: "slideObstacles",
    title: "UNDERPASS",
    icon: "▼",
    targets: [10, 16],
    rewardXp: 200,
    rewardCoins: 80,
    mode: "cumulative",
  },
  {
    templateId: "daredevil",
    type: "nearMisses",
    title: "DAREDEVIL",
    icon: "≈",
    targets: [10, 15],
    rewardXp: 240,
    rewardCoins: 100,
    mode: "cumulative",
  },
  {
    templateId: "flawless",
    type: "perfectActions",
    title: "FLAWLESS",
    icon: "◎",
    targets: [18, 28],
    rewardXp: 240,
    rewardCoins: 100,
    mode: "cumulative",
  },
  {
    templateId: "comboRookie",
    type: "reachCombo",
    title: "CHAIN STARTER",
    icon: "×",
    targets: [10],
    rewardXp: 180,
    rewardCoins: 80,
    mode: "max",
  },
  {
    templateId: "comboMaster",
    type: "reachCombo",
    title: "COMBO MASTER",
    icon: "××",
    targets: [20, 25],
    rewardXp: 320,
    rewardCoins: 140,
    mode: "max",
  },
  {
    templateId: "overcharged",
    type: "useOverdrive",
    title: "OVERCHARGED",
    icon: "⚡",
    targets: [3],
    rewardXp: 220,
    rewardCoins: 90,
    mode: "cumulative",
  },
  {
    templateId: "gadgeteer",
    type: "collectPowerUps",
    title: "GADGETEER",
    icon: "◇",
    targets: [4, 6],
    rewardXp: 200,
    rewardCoins: 90,
    mode: "cumulative",
  },
  {
    templateId: "scorer",
    type: "scoreInSingleRun",
    title: "HIGH ROLLER",
    icon: "$",
    targets: [50000, 80000],
    rewardXp: 300,
    rewardCoins: 130,
    mode: "max",
  },
  {
    templateId: "survivor",
    type: "survivalTime",
    title: "SURVIVOR",
    icon: "◷",
    targets: [120, 180],
    rewardXp: 280,
    rewardCoins: 120,
    mode: "max",
  },
];

export interface GeneratedMission {
  id: string;
  templateId: string;
  target: number;
}

/** Deterministic per local calendar date, e.g. "2026-08-26". */
export function generateDailyMissions(dateKey: string): GeneratedMission[] {
  const rng = mulberry32(hashString(`neonrun-${dateKey}`));
  const pool = [...MISSION_TEMPLATES];
  const picked: MissionTemplate[] = [];
  while (picked.length < DAILY_MISSION_COUNT && pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked.map((template) => ({
    id: `daily_${dateKey}_${template.templateId}`,
    templateId: template.templateId,
    target: template.targets[Math.floor(rng() * template.targets.length)],
  }));
}

export function getMissionTemplate(templateId: string): MissionTemplate {
  const found = MISSION_TEMPLATES.find((t) => t.templateId === templateId);
  return found ?? MISSION_TEMPLATES[0];
}

/** Local calendar date key — device-clock manipulation is an accepted V2 limitation. */
export function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
