import { SCORE } from "@/game/config/gameplay";

/**
 * Tracks score components for the current run. V2: score accrues through a
 * live multiplier (combo × power-ups × overdrive), so distance/coins feed an
 * accumulator instead of a pure formula. Raw coin count is kept separately
 * for persistence — multipliers never inflate the wallet.
 */
export class ScoreSystem {
  private distanceMeters = 0;
  private coinCount = 0;
  private scoreAccumulator = 0;

  reset(): void {
    this.distanceMeters = 0;
    this.coinCount = 0;
    this.scoreAccumulator = 0;
  }

  /** distanceDelta in meters; multiplier applies to run score only. */
  addDistance(delta: number, multiplier: number): void {
    this.distanceMeters += delta;
    this.scoreAccumulator += delta * SCORE.pointsPerMeter * multiplier;
  }

  addCoin(multiplier: number): void {
    this.coinCount += 1;
    this.scoreAccumulator += SCORE.coinValue * multiplier;
  }

  /** Flat bonus (smashes, chains, near misses). */
  addBonus(points: number, multiplier: number): void {
    this.scoreAccumulator += points * multiplier;
  }

  get distance(): number {
    return this.distanceMeters;
  }

  get coins(): number {
    return this.coinCount;
  }

  get score(): number {
    return Math.floor(this.scoreAccumulator);
  }
}
