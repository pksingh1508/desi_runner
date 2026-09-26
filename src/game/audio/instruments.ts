import type { AudioGraph } from "./AudioGraph";
import {
  SILENT,
  connectPanned,
  makeFilter,
  noiseBurst,
  pluckEnvelope,
  releaseWhenDone,
  tone,
} from "./synth";

/**
 * Synthesized desi percussion and colour instruments. Every function is a
 * one-shot: it creates a handful of nodes at time `t`, connects them to
 * `dest` and releases them when finished. `vel` is 0..1 loudness.
 */

// ------------------------------------------------------------------- dhol

/** Dhol bass head (dagga): deep pitch-dropping boom + thick-stick thump. */
export function dholBass(g: AudioGraph, dest: AudioNode, t: number, vel: number, tune = 1): void {
  const ctx = g.ctx;
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(150 * tune, t);
  body.frequency.exponentialRampToValueAtTime(80 * tune, t + 0.05);
  body.frequency.exponentialRampToValueAtTime(64 * tune, t + 0.45);
  const env = ctx.createGain();
  const end = pluckEnvelope(env.gain, t, 0.85 * vel, 0.004, 0.42);
  body.connect(env);
  env.connect(dest);
  body.start(t);
  body.stop(end + 0.02);
  releaseWhenDone(body, env);
  // Membrane overtone (~1.6×) keeps the boom audible on phone speakers.
  tone(g, dest, t, "triangle", 245 * tune, 128 * tune, 0.05, 0.22 * vel, 0.002, 0.16);
  noiseBurst(g, dest, t, "lowpass", 1500, 600, 0.8, 0.28 * vel, 0.001, 0.03);
}

/** Dhol treble head (tilli): sharp cane crack with a tight ring. */
export function dholTreble(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "bandpass", 2800, 2000, 1.1, 0.42 * vel, 0.001, 0.04);
  tone(g, dest, t, "triangle", 520, 430, 0.03, 0.2 * vel, 0.001, 0.08);
}

/** Tasha: small kettle drum of the dhol-tasha troupes — brighter, ringing. */
export function tasha(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "bandpass", 4200, 3200, 1.3, 0.36 * vel, 0.001, 0.05);
  tone(g, dest, t, "triangle", 900, 780, 0.03, 0.16 * vel, 0.001, 0.1);
}

/** Chimta: fire-tong jingles, the Punjabi folk tick. */
export function chimta(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "bandpass", 7200, 5600, 1.6, 0.4 * vel, 0.001, 0.09);
  tone(g, dest, t, "sine", 3150, 3100, 0.05, 0.06 * vel, 0.001, 0.12);
}

// ----------------------------------------------------------------- dholak

export function dholakBass(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  tone(g, dest, t, "sine", 190, 105, 0.05, 0.6 * vel, 0.003, 0.3);
  tone(g, dest, t, "triangle", 300, 170, 0.04, 0.12 * vel, 0.002, 0.12);
  noiseBurst(g, dest, t, "lowpass", 1200, 500, 0.7, 0.18 * vel, 0.001, 0.025);
}

export function dholakSlap(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "bandpass", 1900, 1500, 1.4, 0.36 * vel, 0.001, 0.045);
  tone(g, dest, t, "sine", 680, 600, 0.02, 0.16 * vel, 0.001, 0.07);
}

// ---------------------------------------------------------------- khartal

/** Khartal: dry wooden clapper click. */
export function khartal(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "bandpass", 2600, 2400, 2.6, 0.9 * vel, 0.001, 0.026);
  tone(g, dest, t, "sine", 1320, 1250, 0.015, 0.22 * vel, 0.001, 0.02);
}

/** The classic "trr-ka" khartal flourish: three clicks crescendo. */
export function khartalRoll(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  khartal(g, dest, t, vel * 0.62);
  khartal(g, dest, t + 0.034, vel * 0.78);
  khartal(g, dest, t + 0.068, vel);
}

// ------------------------------------------------------------------ tabla

export type TablaBol = "dha" | "dhin" | "na" | "tin" | "ta" | "ti" | "ra" | "ki" | "ge" | "ka";

/** Tabla stroke; the dayan (treble drum) is tuned to `saHz`. */
export function tabla(g: AudioGraph, dest: AudioNode, t: number, bol: TablaBol, vel: number, saHz: number): void {
  switch (bol) {
    case "dha":
      dayanOpen(g, dest, t, vel, saHz, 1);
      bayanGe(g, dest, t, vel);
      break;
    case "dhin":
      dayanTin(g, dest, t, vel, saHz);
      bayanGe(g, dest, t, vel * 0.85);
      break;
    case "na":
      dayanOpen(g, dest, t, vel, saHz, 0.9);
      break;
    case "ta":
      dayanOpen(g, dest, t, vel, saHz, 1.15);
      break;
    case "tin":
      dayanTin(g, dest, t, vel, saHz);
      break;
    case "ti":
    case "ki":
      dayanClosed(g, dest, t, vel, saHz);
      break;
    case "ra":
      dayanClosed(g, dest, t, vel * 0.7, saHz);
      break;
    case "ge":
      bayanGe(g, dest, t, vel);
      break;
    case "ka":
      bayanKa(g, dest, t, vel);
      break;
  }
}

/** Open ringing "na": harmonic partials, brightness decays fast. */
function dayanOpen(g: AudioGraph, dest: AudioNode, t: number, vel: number, saHz: number, brightness: number): void {
  const ctx = g.ctx;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(g.waves.tabla);
  osc.frequency.setValueAtTime(saHz * 1.03, t);
  osc.frequency.exponentialRampToValueAtTime(saHz, t + 0.025);
  const lowpass = makeFilter(ctx, "lowpass", 4200 * brightness, 0.9);
  lowpass.frequency.setValueAtTime(4200 * brightness, t);
  lowpass.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  const env = ctx.createGain();
  const end = pluckEnvelope(env.gain, t, 0.42 * vel, 0.002, 0.38);
  osc.connect(lowpass);
  lowpass.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  releaseWhenDone(osc, lowpass, env);
  noiseBurst(g, dest, t, "bandpass", 5200, 4000, 1.2, 0.12 * vel, 0.0005, 0.012);
}

/** Resonant "tin": the dayan's pure, long fundamental. */
function dayanTin(g: AudioGraph, dest: AudioNode, t: number, vel: number, saHz: number): void {
  tone(g, dest, t, "sine", saHz * 1.01, saHz, 0.03, 0.32 * vel, 0.004, 0.55);
  tone(g, dest, t, "sine", saHz * 2, saHz * 2, 0, 0.06 * vel, 0.003, 0.25);
}

/** Damped "ti / ra / ki": short finger slaps. */
function dayanClosed(g: AudioGraph, dest: AudioNode, t: number, vel: number, saHz: number): void {
  tone(g, dest, t, "sine", saHz * 1.6, saHz * 1.45, 0.03, 0.14 * vel, 0.001, 0.045);
  noiseBurst(g, dest, t, "bandpass", 3200, 2600, 1.8, 0.26 * vel, 0.0008, 0.022);
}

/** Bayan "ghe": bass stroke whose pitch rises as the wrist presses. */
function bayanGe(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  const ctx = g.ctx;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(88, t);
  osc.frequency.linearRampToValueAtTime(122, t + 0.26);
  const env = ctx.createGain();
  const end = pluckEnvelope(env.gain, t, 0.55 * vel, 0.005, 0.5);
  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  releaseWhenDone(osc, env);
  tone(g, dest, t, "triangle", 176, 240, 0.26, 0.1 * vel, 0.004, 0.2);
}

/** Bayan "ka": flat-palm muted slap. */
function bayanKa(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "lowpass", 520, 300, 0.8, 0.34 * vel, 0.001, 0.035);
  tone(g, dest, t, "sine", 120, 90, 0.03, 0.2 * vel, 0.001, 0.04);
}

// ------------------------------------------------------------------ bells

const BELL_RATIOS = [1, 2.32, 4.25, 6.63];
const BELL_LEVELS = [1, 0.42, 0.22, 0.1];
const BELL_DECAYS = [1, 0.55, 0.3, 0.18];

/** Temple bell (ghanti) — inharmonic partials with staggered decays. */
export function bell(
  g: AudioGraph,
  dest: AudioNode,
  t: number,
  hz: number,
  vel: number,
  decay = 1.4,
  partials = 4
): void {
  const count = Math.min(partials, BELL_RATIOS.length);
  for (let i = 0; i < count; i++) {
    const f = hz * BELL_RATIOS[i];
    // Slight detune on the fundamental gives the bell its shimmer/beating.
    tone(g, dest, t, "sine", f, f, 0, 0.22 * vel * BELL_LEVELS[i], 0.002, decay * BELL_DECAYS[i], i === 0 ? 3 : 0);
  }
}

// --------------------------------------------------------------- strings

/**
 * Plucked string from the pre-rendered Karplus–Strong buffer. `bendSemis`
 * adds the ektara "squeeze" (pitch pushed up, then released).
 */
export function stringPluck(
  g: AudioGraph,
  dest: AudioNode,
  t: number,
  hz: number,
  vel: number,
  bendSemis = 0,
  maxDuration = 1.6
): void {
  const ctx = g.ctx;
  const src = ctx.createBufferSource();
  src.buffer = g.pluck.buffer;
  const rate = hz / g.pluck.baseHz;
  src.playbackRate.setValueAtTime(rate, t);
  if (bendSemis !== 0) {
    src.playbackRate.setValueAtTime(rate, t + 0.09);
    src.playbackRate.linearRampToValueAtTime(rate * Math.pow(2, bendSemis / 12), t + 0.2);
    src.playbackRate.linearRampToValueAtTime(rate, t + 0.42);
  }
  const duration = Math.min(maxDuration, g.pluck.buffer.duration / rate);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.5 * vel, t);
  env.gain.setValueAtTime(0.5 * vel, t + duration * 0.7);
  env.gain.exponentialRampToValueAtTime(SILENT, t + duration);
  src.connect(env);
  env.connect(dest);
  src.start(t);
  src.stop(t + duration + 0.01);
  releaseWhenDone(src, env);
}

/** Tanpura string: buzzy saw pair whose brightness blooms (jawari). */
export function tanpuraPluck(g: AudioGraph, dest: AudioNode, t: number, hz: number, vel: number, duration: number): void {
  const ctx = g.ctx;
  const a = ctx.createOscillator();
  a.type = "sawtooth";
  a.frequency.value = hz;
  a.detune.value = -3;
  const b = ctx.createOscillator();
  b.type = "sawtooth";
  b.frequency.value = hz;
  b.detune.value = 5;
  const lowpass = makeFilter(ctx, "lowpass", 480, 2.4);
  lowpass.frequency.setValueAtTime(480, t);
  lowpass.frequency.linearRampToValueAtTime(2300, t + 0.22);
  lowpass.frequency.exponentialRampToValueAtTime(700, t + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, t);
  env.gain.exponentialRampToValueAtTime(Math.max(vel, SILENT * 2), t + 0.02);
  env.gain.exponentialRampToValueAtTime(Math.max(vel * 0.35, SILENT * 1.5), t + duration * 0.45);
  env.gain.exponentialRampToValueAtTime(SILENT, t + duration);
  a.connect(lowpass);
  b.connect(lowpass);
  lowpass.connect(env);
  env.connect(dest);
  a.start(t);
  b.start(t);
  a.stop(t + duration + 0.02);
  b.stop(t + duration + 0.02);
  releaseWhenDone(a, b, lowpass, env);
}

// ------------------------------------------------------------ festive fx

/** Firecracker / sparkler crackle from the pre-rendered pop buffer. */
export function crackle(
  g: AudioGraph,
  dest: AudioNode,
  t: number,
  duration: number,
  vel: number,
  highpassHz = 2200,
  pan = 0
): void {
  const ctx = g.ctx;
  const src = ctx.createBufferSource();
  src.buffer = g.crackle;
  const room = g.crackle.duration - duration - 0.02;
  if (room <= 0) src.loop = true;
  const highpass = makeFilter(ctx, "highpass", highpassHz, 0.7);
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, t);
  env.gain.exponentialRampToValueAtTime(Math.max(vel, SILENT * 2), t + 0.02);
  env.gain.setValueAtTime(Math.max(vel, SILENT * 2), t + duration * 0.5);
  env.gain.exponentialRampToValueAtTime(SILENT, t + duration);
  src.connect(highpass);
  highpass.connect(env);
  const panner = connectPanned(ctx, env, dest, pan);
  src.start(t, room > 0 ? Math.random() * room : 0);
  src.stop(t + duration + 0.01);
  releaseWhenDone(src, highpass, env, panner);
}

/** Distant sutli-bomb boom. */
export function boom(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  tone(g, dest, t, "sine", 70, 38, 0.5, 0.5 * vel, 0.01, 0.9);
  noiseBurst(g, dest, t, "lowpass", 400, 120, 0.7, 0.3 * vel, 0.005, 0.8);
}

/** Single rain drop plink on a tin roof / puddle. */
export function drip(g: AudioGraph, dest: AudioNode, t: number, hz: number, vel: number): void {
  tone(g, dest, t, "sine", hz, hz * 0.62, 0.025, vel, 0.001, 0.035);
}

/** Far-away monsoon thunder roll. */
export function thunder(g: AudioGraph, dest: AudioNode, t: number, vel: number): void {
  noiseBurst(g, dest, t, "lowpass", 180, 90, 0.8, vel, 0.35, 2.6);
}

/** Looping noise source helper for long beds (rain, rocket hiss). */
export function loopedNoise(g: AudioGraph, t: number, buffer: AudioBuffer = g.noise): AudioBufferSourceNode {
  const src = g.ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(t, Math.random() * buffer.duration * 0.9);
  return src;
}
