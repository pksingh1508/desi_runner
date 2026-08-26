export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 0→1→0-eased step used for biome blending. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Frame-rate independent exponential damping towards a target. */
export function damp(
  current: number,
  target: number,
  lambda: number,
  delta: number
): number {
  return lerp(current, target, 1 - Math.exp(-lambda * delta));
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(randRange(minInclusive, maxInclusive + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Weighted pick; weights need not be normalized. Returns index. */
export function weightedIndex(weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}
