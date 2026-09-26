import type { AudioGraph } from "./AudioGraph";
import { SILENT, connectPanned, makeFilter, makeGain, stopSafely } from "./synth";

/**
 * Parallel formant synthesizer (Klatt-style parallel branch) for short
 * vocal gestures: the "FAAAH!" crash shout and the cow moo.
 *
 *   glottal pulse (pitch contour + vibrato + jitter) ─┐
 *   aspiration noise ─────────────────────────────────┴► F1..F4 bandpass (±) ─► tanh grit ─► tone ─► out
 *   frication noise (made at the lips — bypasses the tract) ────────────────────────────────────┘
 */

type Point = readonly [time: number, value: number];
type FormantFrame = readonly [time: number, f1: number, f2: number, f3: number, f4: number];

export interface FormantPreset {
  /** Source spectrum: bright glottal pulse (human) or raw saw (animal). */
  wave: "glottal" | "saw";
  /** Length in seconds before time scaling. */
  duration: number;
  /** Fundamental contour, Hz. */
  pitch: readonly Point[];
  /** Voicing amplitude contour (0..1). */
  voicing: readonly Point[];
  /** Breath noise through the vocal tract ("h"), 0..1. */
  aspiration: readonly Point[];
  /** Lip / teeth noise ("f"), 0..1. Empty = none. */
  frication: readonly Point[];
  fricationBand: readonly [number, number];
  /** F1..F4 trajectories. */
  formants: readonly FormantFrame[];
  /** Formant bandwidths, Hz. */
  bandwidths: readonly [number, number, number, number];
  /** Parallel amplitudes; alternating signs give cascade-like valleys. */
  formantGains: readonly [number, number, number, number];
  vibratoHz: number;
  /** Vibrato depth contour, cents. */
  vibrato: readonly Point[];
  /** Random pitch jitter contour, cents. */
  jitter: readonly Point[];
  /** Scales the aspiration contour (noise is spread thinner than harmonics). */
  aspirationGain: number;
  /** tanh saturation amount for shout grit (0 = clean). */
  drive: number;
  level: number;
  /** Final lowpass (brightness / distance). */
  lowpass: number;
  /** Send level into the voice echo. */
  echo: number;
}

/**
 * The viral desi "FAAAH!" — a dramatic, despairing shout: a breathy "f",
 * a pressed open "aaa" (F1≈820, F2≈1220, F3≈2500) whose pitch leaps up then
 * sags, heavy vibrato and a long breathy decay.
 */
export const FAAAH_PRESET: FormantPreset = {
  wave: "glottal",
  duration: 1.62,
  pitch: [
    [0, 185],
    [0.13, 190],
    [0.27, 335],
    [0.42, 352],
    [0.7, 318],
    [1.05, 240],
    [1.62, 150],
  ],
  voicing: [
    [0, SILENT],
    [0.13, SILENT],
    [0.2, 1],
    [0.55, 0.92],
    [0.95, 0.62],
    [1.45, 0.08],
    [1.62, SILENT],
  ],
  aspiration: [
    [0, SILENT],
    [0.1, SILENT],
    [0.16, 0.9],
    [0.26, 0.25],
    [1.0, 0.22],
    [1.42, 0.45],
    [1.62, SILENT],
  ],
  frication: [
    [0, SILENT],
    [0.025, 0.14],
    [0.12, 0.16],
    [0.19, SILENT],
  ],
  fricationBand: [1400, 8500],
  formants: [
    [0, 380, 1050, 2350, 3300],
    [0.13, 420, 1100, 2400, 3350],
    [0.24, 820, 1220, 2500, 3500],
    [1.0, 800, 1200, 2480, 3450],
    [1.62, 640, 1100, 2400, 3300],
  ],
  bandwidths: [95, 115, 170, 260],
  formantGains: [1, -0.72, 0.4, -0.2],
  vibratoHz: 5.6,
  vibrato: [
    [0, 0],
    [0.3, 0],
    [0.55, 45],
    [1.62, 55],
  ],
  jitter: [
    [0, 10],
    [1.0, 14],
    [1.62, 30],
  ],
  aspirationGain: 0.75,
  drive: 2.2,
  level: 1,
  lowpass: 7000,
  echo: 0.4,
};

/** Cow moo: nasal "mm" opening to a rough "oooh" and closing again. */
export const MOO_PRESET: FormantPreset = {
  wave: "saw",
  duration: 1.35,
  pitch: [
    [0, 100],
    [0.25, 148],
    [0.7, 138],
    [1.1, 112],
    [1.35, 92],
  ],
  voicing: [
    [0, SILENT],
    [0.12, 0.7],
    [0.3, 1],
    [0.95, 0.85],
    [1.35, SILENT],
  ],
  aspiration: [
    [0, SILENT],
    [0.1, 0.1],
    [1.2, 0.14],
    [1.35, SILENT],
  ],
  frication: [],
  fricationBand: [1000, 4000],
  formants: [
    [0, 260, 780, 2250, 3100],
    [0.3, 520, 940, 2300, 3200],
    [0.9, 480, 900, 2200, 3100],
    [1.35, 300, 800, 2150, 3000],
  ],
  bandwidths: [120, 150, 260, 380],
  formantGains: [1, -0.55, 0.12, -0.05],
  vibratoHz: 4.2,
  vibrato: [
    [0, 0],
    [0.4, 18],
    [1.35, 22],
  ],
  jitter: [
    [0, 25],
    [1.35, 35],
  ],
  aspirationGain: 2,
  drive: 2.8,
  level: 0.5,
  lowpass: 2400,
  echo: 0,
};

export interface VoiceHandle {
  /** Seconds from now until the gesture ends. */
  readonly duration: number;
  /** Fires once the voice has fully stopped (natural end or stop()). */
  onEnded: (() => void) | null;
  /** Fades out over `fade` seconds and stops. */
  stop(fade?: number): void;
}

const curveCache = new Map<number, Float32Array<ArrayBuffer>>();

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  let curve = curveCache.get(drive);
  if (!curve) {
    curve = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    curveCache.set(drive, curve);
  }
  return curve;
}

/** Applies a contour to an AudioParam (exponential for amplitudes / pitch). */
function schedule(
  param: AudioParam,
  points: readonly Point[],
  t0: number,
  timeScale: number,
  valueScale: number,
  exponential: boolean
): void {
  if (points.length === 0) return;
  const floor = exponential ? SILENT : -Infinity;
  param.setValueAtTime(Math.max(points[0][1] * valueScale, floor), t0 + points[0][0] * timeScale);
  for (let i = 1; i < points.length; i++) {
    const time = t0 + points[i][0] * timeScale;
    const value = Math.max(points[i][1] * valueScale, floor);
    if (exponential) param.exponentialRampToValueAtTime(value, time);
    else param.linearRampToValueAtTime(value, time);
  }
}

/**
 * Speaks a formant gesture into `dest`. `pitchScale` / `timeScale` vary each
 * take so repeats never sound copy-pasted.
 */
export function speakFormants(
  g: AudioGraph,
  dest: AudioNode,
  preset: FormantPreset,
  pitchScale = 1,
  timeScale = 1,
  pan = 0,
  echo: AudioNode | null = null
): VoiceHandle {
  const ctx = g.ctx;
  const t0 = ctx.currentTime + 0.01;
  const duration = preset.duration * timeScale;
  const end = t0 + duration;
  const sources: AudioScheduledSourceNode[] = [];
  /** Noise sources start at random offsets so repeated takes differ. */
  const noises: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [];

  // --- glottal source: pitch contour, vibrato and jitter on detune
  const glottis = ctx.createOscillator();
  if (preset.wave === "glottal") glottis.setPeriodicWave(g.waves.glottal);
  else glottis.type = "sawtooth";
  schedule(glottis.frequency, preset.pitch, t0, timeScale, pitchScale, true);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = preset.vibratoHz;
  const vibrato = makeGain(ctx, 0);
  schedule(vibrato.gain, preset.vibrato, t0, timeScale, 1, false);
  lfo.connect(vibrato);
  vibrato.connect(glottis.detune);

  const wobble = ctx.createBufferSource();
  wobble.buffer = g.wobble;
  wobble.loop = true;
  wobble.playbackRate.value = 1.3;
  const jitter = makeGain(ctx, 0);
  schedule(jitter.gain, preset.jitter, t0, timeScale, 1, false);
  wobble.connect(jitter);
  jitter.connect(glottis.detune);

  const voicing = makeGain(ctx, SILENT);
  schedule(voicing.gain, preset.voicing, t0, timeScale, 1, true);
  glottis.connect(voicing);

  // --- breath through the tract
  const breath = ctx.createBufferSource();
  breath.buffer = g.noise;
  breath.loop = true;
  const aspiration = makeGain(ctx, SILENT);
  schedule(aspiration.gain, preset.aspiration, t0, timeScale, preset.aspirationGain, true);
  breath.connect(aspiration);

  // --- parallel formant bank
  const tract = makeGain(ctx, 1);
  const first = preset.formants[0];
  for (let i = 0; i < 4; i++) {
    const bandwidth = preset.bandwidths[i];
    const band = makeFilter(ctx, "bandpass", first[i + 1], first[i + 1] / bandwidth);
    for (let k = 0; k < preset.formants.length; k++) {
      const frame = preset.formants[k];
      const time = t0 + frame[0] * timeScale;
      const hz = frame[i + 1];
      if (k === 0) {
        band.frequency.setValueAtTime(hz, time);
        band.Q.setValueAtTime(hz / bandwidth, time);
      } else {
        band.frequency.exponentialRampToValueAtTime(hz, time);
        band.Q.linearRampToValueAtTime(hz / bandwidth, time);
      }
    }
    const amplitude = makeGain(ctx, preset.formantGains[i]);
    voicing.connect(band);
    aspiration.connect(band);
    band.connect(amplitude);
    amplitude.connect(tract);
    nodes.push(band, amplitude);
  }

  // --- grit, tone and output
  let head: AudioNode = tract;
  if (preset.drive > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve(preset.drive);
    shaper.oversample = "2x";
    tract.connect(shaper);
    head = shaper;
    nodes.push(shaper);
  }
  const tone = makeFilter(ctx, "lowpass", preset.lowpass, 0.7);
  head.connect(tone);
  const out = makeGain(ctx, preset.level);
  tone.connect(out);
  nodes.push(tract, tone, voicing, aspiration, vibrato, jitter);

  sources.push(glottis, lfo, wobble, breath);
  noises.push(breath);
  if (preset.frication.length > 0) {
    const hiss = ctx.createBufferSource();
    hiss.buffer = g.noise;
    hiss.loop = true;
    const highpass = makeFilter(ctx, "highpass", preset.fricationBand[0], 0.7);
    const lowpass = makeFilter(ctx, "lowpass", preset.fricationBand[1], 0.7);
    const frication = makeGain(ctx, SILENT);
    schedule(frication.gain, preset.frication, t0, timeScale, 1, true);
    hiss.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(frication);
    frication.connect(out);
    sources.push(hiss);
    noises.push(hiss);
    nodes.push(highpass, lowpass, frication);
  }

  const panner = connectPanned(ctx, out, dest, pan);
  if (panner) nodes.push(panner);
  if (echo && preset.echo > 0) {
    const send = makeGain(ctx, preset.echo);
    out.connect(send);
    send.connect(echo);
    nodes.push(send);
  }
  nodes.push(out);

  glottis.start(t0);
  lfo.start(t0);
  wobble.start(t0, Math.random() * g.wobble.duration * 0.8);
  for (const noise of noises) noise.start(t0, Math.random() * g.noise.duration * 0.8);
  for (const source of sources) source.stop(end + 0.05);

  let stopped = false;
  const handle: VoiceHandle = {
    duration: duration + 0.01,
    onEnded: null,
    stop(fade = 0.08) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, Math.max(fade, 0.01) / 3);
      for (const source of sources) stopSafely(source, now + fade + 0.05);
    },
  };
  glottis.onended = () => {
    for (const source of sources) source.disconnect();
    for (const node of nodes) node.disconnect();
    handle.onEnded?.();
    handle.onEnded = null;
  };
  return handle;
}
