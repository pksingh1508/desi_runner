export type GameState =
  | "loading"
  | "menu"
  | "countdown"
  | "playing"
  | "paused"
  | "gameover";

export type PlayerAnimationState =
  | "idle"
  | "run"
  | "jump"
  | "slide"
  | "death";

export type ObstacleKind = "barrier" | "overhead" | "block" | "moving";

export type LaneIndex = 0 | 1 | 2;

export interface BestStats {
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
}

export interface RunResult {
  score: number;
  distance: number;
  coins: number;
  isNewBestScore: boolean;
  isNewBestDistance: boolean;
}

export type GameAction =
  | "left"
  | "right"
  | "jump"
  | "slide"
  | "pause"
  | "confirm";
