import { SCORE } from "@/game/config/gameplay";

/** Tracks score components for the current run. */
export class ScoreSystem {
  private distanceMeters = 0;
  private coinCount = 0;

  reset(): void {
    this.distanceMeters = 0;
    this.coinCount = 0;
  }

  /** distanceDelta in meters (world units). */
  addDistance(delta: number): void {
    this.distanceMeters += delta;
  }

  addCoin(): void {
    this.coinCount += 1;
  }

  get distance(): number {
    return this.distanceMeters;
  }

  get coins(): number {
    return this.coinCount;
  }

  get score(): number {
    return (
      Math.floor(this.distanceMeters * SCORE.pointsPerMeter) +
      this.coinCount * SCORE.coinValue
    );
  }
}
