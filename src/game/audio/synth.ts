import type { AudioGraph } from "./AudioGraph";

/**
 * Tiny Web Audio building blocks shared by the SFX, music and voice synths.
 * Positional arguments (no option objects) keep note scheduling free of
 * per-call garbage beyond the audio nodes themselves.
 */

/** Smallest level exponential ramps may target (≈ −80 dB) — never zero. */
export const SILENT = 0.0001;

export function makeGain(ctx: BaseAudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

export function makeFilter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = Math.SQRT1_2,
  gainDb = 0
): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  if (gainDb !== 0) node.gain.value = gainDb;
  return node;
}

/** StereoPanner when the browser has one (very old Safari doesn't). */
export function makePanner(ctx: BaseAudioContext, pan: number): StereoPannerNode | null {
  if (typeof ctx.createStereoPanner !== "function") return null;
  const node = ctx.createStereoPanner();
  node.pan.value = pan;
  return node;
}

/** Connects `node → panner → dest`, or straight through when unsupported. */
export function connectPanned(ctx: BaseAudioContext, node: AudioNode, dest: AudioNode, pan: number): AudioNode | null {
  const panner = makePanner(ctx, pan);
  if (!panner) {
    node.connect(dest);
    return null;
  }
  node.connect(panner);
  panner.connect(dest);
  return panner;
}

/**
 * Percussive attack/decay starting from silence (click-free). Returns the
 * time the envelope reaches silence.
 */
export function pluckEnvelope(param: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const a = Math.max(attack, 0.001);
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 1.5), t + a);
  param.exponentialRampToValueAtTime(SILENT, t + a + decay);
  return t + a + decay;
}

/** Disconnects a finished voice so its nodes can be garbage-collected. */
export function releaseWhenDone(source: AudioScheduledSourceNode, ...nodes: (AudioNode | null)[]): void {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node?.disconnect();
  };
}

/** Safe stop (a second stop() on some engines throws). */
export function stopSafely(source: AudioScheduledSourceNode, when: number): void {
  try {
    source.stop(when);
  } catch {
    /* already stopped */
  }
}

/** White-noise source from a random offset, already started and stopped. */
export function noiseSource(g: AudioGraph, t: number, duration: number): AudioBufferSourceNode {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const room = g.noise.duration - duration - 0.02;
  if (room <= 0) src.loop = true;
  src.start(t, room > 0 ? Math.random() * room : 0);
  src.stop(t + duration);
  return src;
}

/**
 * Oscillator blip with a pitch sweep (`from` → `to` over `glide` seconds)
 * and a percussive envelope. `wave` is an OscillatorType or a PeriodicWave.
 */
export function tone(
  g: AudioGraph,
  dest: AudioNode,
  t: number,
  wave: OscillatorType | PeriodicWave,
  from: number,
  to: number,
  glide: number,
  peak: number,
  attack: number,
  decay: number,
  detuneCents = 0
): OscillatorNode {
  const ctx = g.ctx;
  const osc = ctx.createOscillator();
  // PeriodicWave is an empty interface in lib.dom, so narrow on "object".
  if (typeof wave === "object") osc.setPeriodicWave(wave);
  else osc.type = wave as OscillatorType;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(glide, 0.001));
  if (detuneCents !== 0) osc.detune.value = detuneCents;
  const env = ctx.createGain();
  const end = pluckEnvelope(env.gain, t, peak, attack, decay);
  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  releaseWhenDone(osc, env);
  return osc;
}

/** Filtered noise hit with an optional filter sweep. */
export function noiseBurst(
  g: AudioGraph,
  dest: AudioNode,
  t: number,
  type: BiquadFilterType,
  fromHz: number,
  toHz: number,
  q: number,
  peak: number,
  attack: number,
  decay: number
): void {
  const ctx = g.ctx;
  const length = Math.max(attack, 0.001) + decay;
  const src = noiseSource(g, t, length + 0.03);
  const filter = makeFilter(ctx, type, fromHz, q);
  if (toHz !== fromHz) {
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), t + length);
  }
  const env = ctx.createGain();
  pluckEnvelope(env.gain, t, peak, attack, decay);
  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  releaseWhenDone(src, filter, env);
}

/** Equal-tempered ratio for a semitone offset. */
export function semitones(n: number): number {
  return Math.pow(2, n / 12);
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
