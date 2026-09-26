export type GameState =
  | "loading"
  | "menu"
  | "countdown"
  | "playing"
  | "paused"
  | "revive"
  | "gameover";

export type PlayerAnimationState =
  | "idle"
  | "run"
  | "jump"
  | "slide"
  | "death"
  /** Menu flourish / celebration (human runners). */
  | "dance"
  /** Seated pose while riding the Diwali rocket (human runners). */
  | "ride";

export type LaneIndex = 0 | 1 | 2;

/** Menu tab the camera frames (GEAR zooms onto the runner). */
export type MenuFocus = "home" | "gear" | "missions" | "career" | "awards";

export type GameAction =
  | "left"
  | "right"
  | "jump"
  | "slide"
  | "pause"
  | "confirm"
  | "overdrive";

// ------------------------------------------------------------------ powerups

export type PowerUpType = "magnet" | "shield" | "scoreMultiplier" | "turbo";

// -------------------------------------------------------------------- skills

export type SkillEventKind =
  | "perfectJump"
  | "perfectSlide"
  | "nearMiss"
  | "coinStreak"
  | "obstacleChain";

// --------------------------------------------------------------- progression

export type MissionType =
  | "collectCoins"
  | "travelDistance"
  | "jumpObstacles"
  | "slideObstacles"
  | "nearMisses"
  | "perfectActions"
  | "reachCombo"
  | "useOverdrive"
  | "collectPowerUps"
  | "scoreInSingleRun"
  | "survivalTime";

export type RewardKind = "coins" | "character" | "badge";

export interface Reward {
  kind: RewardKind;
  /** Cosmetic id for character rewards. */
  id?: string;
  amount?: number;
  label: string;
}

export interface PlayerStatsData {
  totalRuns: number;
  totalDistance: number;
  totalCoins: number;
  bestScore: number;
  bestDistance: number;
  highestCombo: number;
  totalNearMisses: number;
  totalPerfectJumps: number;
  totalPerfectSlides: number;
  totalPowerUps: number;
  totalOverdrives: number;
  obstaclesSmashed: number;
  /** Seconds of active gameplay accumulated across all runs. */
  totalPlayTime: number;
  missionsCompleted: number;
}

// -------------------------------------------------------------- run summary

export interface CompletedMissionInfo {
  title: string;
  rewardXp: number;
  rewardCoins: number;
}

export interface CompletedAchievementInfo {
  title: string;
  icon: string;
  rewardXp: number;
  rewardCoins: number;
}

export interface LevelUpInfo {
  from: number;
  to: number;
  rewards: Reward[];
}

export interface UnlockInfo {
  kind: RewardKind;
  label: string;
}

export interface RunResult {
  score: number;
  distance: number;
  coins: number;
  isNewBestScore: boolean;
  isNewBestDistance: boolean;
  nearMisses: number;
  perfectJumps: number;
  perfectSlides: number;
  maxCombo: number;
  overdrives: number;
  powerUps: number;
  obstaclesSmashed: number;
  survivalTime: number;
  keysCollected: number;
  keysUsed: number;
  rocketsUsed: number;
  xpEarned: number;
  previousLevel: number;
  previousXp: number;
  missionsCompleted: CompletedMissionInfo[];
  achievementsCompleted: CompletedAchievementInfo[];
  levelUps: LevelUpInfo[];
  unlocks: UnlockInfo[];
}

/** Per-run counters fed into missions / achievements / stats. */
export interface RunTallyData {
  coins: number;
  distance: number;
  perfectJumps: number;
  perfectSlides: number;
  nearMisses: number;
  powerUps: number;
  overdrives: number;
  obstaclesSmashed: number;
  maxCombo: number;
  survivalTime: number;
  keysCollected: number;
  keysUsed: number;
  rocketsUsed: number;
}

// ----------------------------------------------------------------- HUD views

export interface HudPowerUp {
  type: PowerUpType;
  icon: string;
  label: string;
  remaining: number;
  fraction: number;
  colorHex: string;
}

export type FeedbackTone = "good" | "combo" | "warn" | "epic" | "meme";

/**
 * Gameplay moments that can trigger a desi meme voice line. The AudioSystem
 * owns cooldowns/chances, so the engine can report every moment freely.
 */
export type MemeEvent =
  | "start"
  | "crash"
  | "nearMiss"
  | "coinStreak"
  | "coinStorm"
  | "revive"
  | "newRecord"
  | "overdrive"
  | "rocket"
  | "powerup"
  | "combo";

export interface FeedbackItem {
  id: number;
  text: string;
  sub?: string;
  tone: FeedbackTone;
}

export interface EventBannerData {
  id: number;
  text: string;
}

// -------------------------------------------------------------- meta views

export interface MissionView {
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  completed: boolean;
  rewardXp: number;
  rewardCoins: number;
}

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  completed: boolean;
  rewardXp: number;
  rewardCoins: number;
}

export interface CharacterOptionView {
  id: string;
  name: string;
  gradient: string;
  locked: boolean;
  equipped: boolean;
  unlockLabel: string;
  icon: string;
  species: string;
  description: string;
  archetype: string;
  /** "desi" = realistic 3D human runners; "classic" = legacy stylized rigs. */
  group: "desi" | "classic";
  /** Short flavour line, e.g. "Galli ka Bolt". */
  tagline: string;
  /** Devanagari display name (empty for classic characters). */
  hindiName: string;
  /** Primary outfit / theme color for UI accents. */
  accentHex: string;
}
