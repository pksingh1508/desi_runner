/**
 * Deterministic seeded randomness for boot-time content generation
 * (textures, building rows, street furniture). Seeds keep every variant
 * reproducible between sessions so art tuning is stable.
 */
export type Rng = () => number;

/** mulberry32 — tiny, fast, good enough for procedural art. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function rInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return Math.floor(rRange(rng, minInclusive, maxInclusive + 1));
}

export function rPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function rChance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

/** Weighted pick over `[item, weight]` pairs. */
export function rWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [item, w] of entries) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}
