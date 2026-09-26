import type * as THREE from "three";
import type { AoOptions, ModelBuilder } from "./ModelBuilder";
import type { ObstacleVariantId } from "@/game/config/obstacles";

/** Per-frame inputs for a variant's procedural animation (no allocations). */
export interface VariantAnimState {
  /** Seconds since spawn (randomized start so instances desync). */
  time: number;
  delta: number;
  /** Current lateral speed in m/s (movers; 0 for static props). */
  speed: number;
  /** Meters walked / rolled since spawn (movers). */
  travel: number;
}

/**
 * Declarative description of one visual variant: how to build its merged
 * geometry once, which named parts it animates / toggles, and how.
 * `parts` order defines the index order handed to spawn()/animate().
 */
export interface VariantSpec {
  id: ObstacleVariantId;
  parts?: readonly string[];
  /** Ground-contact darkening (null = none, e.g. hanging props). */
  ao?: AoOptions | null;
  build(b: ModelBuilder): void;
  /** Per-spawn setup: alternates, random start poses. */
  spawn?(parts: readonly THREE.Object3D[], biomeIndex: number): void;
  animate?(parts: readonly THREE.Object3D[], s: VariantAnimState): void;
}
