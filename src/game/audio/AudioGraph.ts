/**
 * Shared Web Audio graph for the desi soundtrack: channel buses, a gentle
 * master limiter, the music ambience reverb, a dramatic voice echo and every
 * pre-rendered buffer / waveform the synthesizers reuse. Built exactly once
 * by AudioSystem.unlock() after a user gesture — never during SSR.
 *
 *   musicWet ─► reverb ─┐
 *   instruments ────────┴─► musicIn (gate) ─► musicDuck ─► musicBus ─┐
 *   sfx / stingers ─────────────────────────────────────► sfxBus ────┤
 *   voice lines ─► voiceBus ◄─ echo ◄─ voiceEcho                     │
 *                     └───────────────────────────────────────────── master (mute)
 *                                                                     └► limiter ─► trim ─► out
 */

/** Karplus–Strong string rendered once; played back at any pitch. */
export interface PluckBuffer {
  buffer: AudioBuffer;
  /** True fundamental of the rendered string (playbackRate = hz / baseHz). */
  baseHz: number;
}

export interface AudioGraph {
  readonly ctx: BaseAudioContext;
  /** Mute gain (0 / 1). */
  readonly master: GainNode;
  /** SFX toggle bus. */
  readonly sfxBus: GainNode;
  /** Music toggle bus. */
  readonly musicBus: GainNode;
  /** Music ducking under voice lines. */
  readonly musicDuck: GainNode;
  /** Music entry + start/stop gate (owned by DesiMusic). */
  readonly musicIn: GainNode;
  /** Music reverb send (returns into musicIn, so the gate covers tails). */
  readonly musicWet: GainNode;
  /** Voice-line toggle bus (user clips + synthesized shouts). */
  readonly voiceBus: GainNode;
  /** Send into a short dramatic echo that returns on the voice bus. */
  readonly voiceEcho: GainNode;
  /** 3 s of white noise. */
  readonly noise: AudioBuffer;
  /** Smooth random signal in [-1, 1] (vocal jitter / wobble LFO). */
  readonly wobble: AudioBuffer;
  /** Sparse firecracker / sparkler pops. */
  readonly crackle: AudioBuffer;
  readonly pluck: PluckBuffer;
  readonly waves: {
    /** Bright glottal-pulse spectrum for formant voices. */
    glottal: PeriodicWave;
    /** Double-reed (shehnai) spectrum: strong odd harmonics. */
    reed: PeriodicWave;
    /** Soft flute (bansuri) spectrum. */
    flute: PeriodicWave;
    /** Harmonic tabla dayan partials (the syahi makes them harmonic). */
    tabla: PeriodicWave;
  };
}

/** Compensates the limiter's automatic makeup gain (≈ +3 dB). */
const OUTPUT_TRIM = 0.72;

export function buildAudioGraph(ctx: BaseAudioContext): AudioGraph {
  // Peak catcher: transparent for normal material, stops overlapping
  // crash + dhol + shout from clipping the output.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  const trim = gainOf(ctx, OUTPUT_TRIM);
  limiter.connect(trim);
  trim.connect(ctx.destination);

  const master = gainOf(ctx, 1);
  master.connect(limiter);

  const sfxBus = gainOf(ctx, 1);
  sfxBus.connect(master);

  const musicBus = gainOf(ctx, 1);
  musicBus.connect(master);
  const musicDuck = gainOf(ctx, 1);
  musicDuck.connect(musicBus);
  const musicIn = gainOf(ctx, 0.0001);
  musicIn.connect(musicDuck);
  const musicWet = gainOf(ctx, 1);
  const reverb = ctx.createConvolver();
  reverb.buffer = renderImpulse(ctx, 1.7, 0.24);
  musicWet.connect(reverb);
  reverb.connect(musicIn);

  const voiceBus = gainOf(ctx, 1);
  voiceBus.connect(master);
  const voiceEcho = gainOf(ctx, 1);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.17;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2400;
  const feedback = gainOf(ctx, 0.33);
  const echoReturn = gainOf(ctx, 0.5);
  voiceEcho.connect(delay);
  delay.connect(echoTone);
  echoTone.connect(feedback);
  feedback.connect(delay);
  echoTone.connect(echoReturn);
  echoReturn.connect(voiceBus);

  return {
    ctx,
    master,
    sfxBus,
    musicBus,
    musicDuck,
    musicIn,
    musicWet,
    voiceBus,
    voiceEcho,
    noise: renderNoise(ctx, 3),
    wobble: renderWobble(ctx, 4),
    crackle: renderCrackle(ctx, 2),
    pluck: renderPluck(ctx, 196, 1.8),
    waves: {
      glottal: harmonicWave(ctx, 64, (n) => Math.pow(n, -0.95) * (n === 1 ? 0.7 : 1)),
      reed: harmonicWave(ctx, 40, (n) => (n % 2 === 1 ? 1 : 0.55) * Math.pow(n, -0.75)),
      flute: harmonicWave(ctx, 5, (n) => [1, 0.22, 0.09, 0.05, 0.02][n - 1]),
      tabla: harmonicWave(ctx, 6, (n) => [1, 0.6, 0.42, 0.25, 0.14, 0.07][n - 1]),
    },
  };
}

// ---------------------------------------------------------------- renderers

function gainOf(ctx: BaseAudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

function harmonicWave(ctx: BaseAudioContext, count: number, amplitude: (n: number) => number): PeriodicWave {
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) imag[n] = amplitude(n);
  return ctx.createPeriodicWave(real, imag);
}

function renderNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Smoothstep-interpolated random targets every ~35 ms, range [-1, 1]. */
function renderWobble(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const segment = Math.max(1, Math.floor(rate * 0.035));
  let from = 0;
  let to = 0;
  for (let i = 0; i < length; i++) {
    const k = i % segment;
    if (k === 0) {
      from = to;
      // Last segment glides home to the first sample → seamless loop.
      to = i + segment >= length ? data[0] : Math.random() * 2 - 1;
    }
    const x = k / segment;
    data[i] = from + (to - from) * x * x * (3 - 2 * x);
  }
  return buffer;
}

/** Firecracker / sparkler crackle: short decaying noise pops. */
function renderCrackle(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const pops = Math.floor(seconds * 55);
  const maxPop = Math.floor(rate * 0.008);
  for (let p = 0; p < pops; p++) {
    const start = Math.floor(Math.random() * (length - maxPop - 1));
    const amp = 0.25 + Math.random() * Math.random() * 0.75;
    const len = Math.floor(rate * (0.0015 + Math.random() * 0.0055));
    const tau = len / 3;
    for (let i = 0; i < len; i++) {
      data[start + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / tau);
    }
  }
  normalize(data, 0.95);
  return buffer;
}

/**
 * Karplus–Strong plucked string (ektara / santoor colour). Rendered once;
 * DesiMusic pitches it with playbackRate.
 */
function renderPluck(ctx: BaseAudioContext, targetHz: number, seconds: number): PluckBuffer {
  const rate = ctx.sampleRate;
  const period = Math.max(2, Math.round(rate / targetHz - 0.5));
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const line = new Float32Array(period);
  let smooth = 0;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    smooth += 0.55 * (Math.random() * 2 - 1 - smooth);
    line[i] = smooth;
    mean += smooth;
  }
  mean /= period;
  for (let i = 0; i < period; i++) line[i] -= mean;

  const decay = 0.9965;
  let ptr = 0;
  for (let i = 0; i < length; i++) {
    const next = ptr + 1 === period ? 0 : ptr + 1;
    const current = line[ptr];
    out[i] = current;
    line[ptr] = decay * 0.5 * (current + line[next]);
    ptr = next;
  }
  const fade = Math.floor(rate * 0.08);
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
  normalize(out, 0.9);
  // The two-point average adds half a sample of delay to the loop.
  return { buffer, baseHz: rate / (period + 0.5) };
}

/** Stereo street/courtyard reverb: decaying noise that darkens over time. */
function renderImpulse(ctx: BaseAudioContext, seconds: number, decayTau: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpassed = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const smoothing = Math.min(0.9, 0.12 + t * 0.85);
      lowpassed = lowpassed * smoothing + (Math.random() * 2 - 1) * (1 - smoothing);
      const onset = t < 0.006 ? t / 0.006 : 1;
      data[i] = lowpassed * Math.exp(-t / decayTau) * onset;
    }
  }
  return buffer;
}

function normalize(data: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max <= 0) return;
  const scale = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}
