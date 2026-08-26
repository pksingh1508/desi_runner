import type { PlayerStatsData } from "@/types/game";

/**
 * Data-driven achievements. `metric` indexes PlayerStatsData; progress is
 * derived from lifetime stats, so checks are pure functions of the save.
 */
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: keyof PlayerStatsData;
  target: number;
  rewardXp: number;
  rewardCoins: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-steps", title: "FIRST STEPS", description: "Finish your first run", icon: "▷", metric: "totalRuns", target: 1, rewardXp: 60, rewardCoins: 40 },
  { id: "regular", title: "REGULAR", description: "Finish 10 runs", icon: "▶", metric: "totalRuns", target: 10, rewardXp: 120, rewardCoins: 80 },
  { id: "veteran", title: "VETERAN", description: "Finish 50 runs", icon: "⏩", metric: "totalRuns", target: 50, rewardXp: 300, rewardCoins: 220 },
  { id: "centurion", title: "CENTURION", description: "Finish 100 runs", icon: "💯", metric: "totalRuns", target: 100, rewardXp: 600, rewardCoins: 450 },
  { id: "kilo", title: "KILOMETER CLUB", description: "Travel 1,000m total", icon: "📏", metric: "totalDistance", target: 1000, rewardXp: 80, rewardCoins: 50 },
  { id: "tenk", title: "ROAD WARRIOR", description: "Travel 10,000m total", icon: "🛣", metric: "totalDistance", target: 10000, rewardXp: 200, rewardCoins: 150 },
  { id: "marathon", title: "MARATHON", description: "Travel 50,000m total", icon: "🏃", metric: "totalDistance", target: 50000, rewardXp: 500, rewardCoins: 380 },
  { id: "coin-novice", title: "POCKET CHANGE", description: "Collect 500 coins", icon: "✦", metric: "totalCoins", target: 500, rewardXp: 90, rewardCoins: 60 },
  { id: "coin-master", title: "COIN MASTER", description: "Collect 10,000 coins", icon: "🌟", metric: "totalCoins", target: 10000, rewardXp: 400, rewardCoins: 320 },
  { id: "scorer-1", title: "WARMING UP", description: "Score 25,000 in one run", icon: "▲", metric: "bestScore", target: 25000, rewardXp: 120, rewardCoins: 90 },
  { id: "scorer-2", title: "HIGH VOLTAGE", description: "Score 150,000 in one run", icon: "⚡", metric: "bestScore", target: 150000, rewardXp: 350, rewardCoins: 260 },
  { id: "scorer-3", title: "OVERDRIVE LEGEND", description: "Score 500,000 in one run", icon: "🏆", metric: "bestScore", target: 500000, rewardXp: 800, rewardCoins: 650 },
  { id: "sprinter", title: "SPRINTER", description: "Travel 1,500m in one run", icon: "➤", metric: "bestDistance", target: 1500, rewardXp: 130, rewardCoins: 90 },
  { id: "distance-king", title: "DISTANCE KING", description: "Travel 5,000m in one run", icon: "👑", metric: "bestDistance", target: 5000, rewardXp: 420, rewardCoins: 330 },
  { id: "combo-10", title: "CHAIN REACTION", description: "Reach combo 10", icon: "×10", metric: "highestCombo", target: 10, rewardXp: 110, rewardCoins: 80 },
  { id: "combo-king", title: "COMBO KING", description: "Reach combo 30", icon: "×30", metric: "highestCombo", target: 30, rewardXp: 380, rewardCoins: 280 },
  { id: "combo-god", title: "UNSTOPPABLE", description: "Reach combo 50", icon: "∞", metric: "highestCombo", target: 50, rewardXp: 750, rewardCoins: 550 },
  { id: "close-1", title: "TOO CLOSE", description: "Perform 25 near misses", icon: "≈", metric: "totalNearMisses", target: 25, rewardXp: 130, rewardCoins: 90 },
  { id: "close-2", title: "PAINT TRADE", description: "Perform 200 near misses", icon: "⁓", metric: "totalNearMisses", target: 200, rewardXp: 460, rewardCoins: 350 },
  { id: "perfect-1", title: "CLEAN FORM", description: "50 perfect actions", icon: "◎", metric: "totalPerfectJumps", target: 50, rewardXp: 130, rewardCoins: 90 },
  {id: "perfect-2", title: "SURGEON", description: "250 perfect jumps", icon: "✚", metric: "totalPerfectJumps", target: 250, rewardXp: 420, rewardCoins: 320 },
  { id: "slider-1", title: "LIMBO", description: "50 perfect slides", icon: "▼", metric: "totalPerfectSlides", target: 50, rewardXp: 130, rewardCoins: 90 },
  { id: "gadget", title: "GADGET FAN", description: "Collect 30 power-ups", icon: "◇", metric: "totalPowerUps", target: 30, rewardXp: 180, rewardCoins: 140 },
  { id: "overcharged", title: "OVERCHARGED", description: "Activate Overdrive 20 times", icon: "⚡", metric: "totalOverdrives", target: 20, rewardXp: 260, rewardCoins: 200 },
  { id: "demolition", title: "DEMOLITION", description: "Smash 100 obstacles", icon: "💥", metric: "obstaclesSmashed", target: 100, rewardXp: 240, rewardCoins: 190 },
  { id: "dedication", title: "DEDICATED", description: "Play for 1 hour total", icon: "◷", metric: "totalPlayTime", target: 3600, rewardXp: 220, rewardCoins: 170 },
];
