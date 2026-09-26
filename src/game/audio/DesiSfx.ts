import type { MemeStinger } from "@/game/config/memes";
import type { AudioGraph } from "./AudioGraph";
import { MOO_PRESET, speakFormants } from "./FormantVoice";
import { LeadVoice } from "./LeadVoice";
import { bell, crackle, dholBass, dholTreble, loopedNoise, tabla } from "./instruments";
import {
  SILENT,
  connectPanned,
  makeFilter,
  makeGain,
  makePanner,
  noiseBurst,
  noiseSource,
  pluckEnvelope,
  randomBetween,
  releaseWhenDone,
  semitones,
  stopSafely,
  tone,
} from "./synth";

/** Coin "chhan": pentatonic sparkle (Sa Re Ga Pa Dha Sa') above G6. */
const COIN_RATIOS = [1, 1.125, 1.25, 1.5, 1.6667, 2];
const COIN_BASE_HZ = 1568;
/** Coins closer than this merge (magnet vacuum bursts stay pleasant). */
const COIN_MIN_GAP = 0.03;
/** Tabla tuning for SFX hits (D4). */
const SFX_SA_HZ = 293.66;
/** 3-2-1 rise Sa → Ga → Pa. */
const COUNTDOWN_RATIOS = [1, 1.26, 1.5];
const POWERUP_RATIOS = [1, 1.26, 1.5, 2];
const LEVEL_UP_RATIOS = [1, 1.26, 1.5, 2];
const COMBO_RATIOS = [1, 1.125, 1.25, 1.5, 1.667];
/** Thela / auto-body clang partials: [Hz, level, decay]. */
const CLANG: readonly (readonly [number, number, number])[] = [
  [317, 0.08, 0.5],
  [563, 0.06, 0.35],
  [1043, 0.045, 0.25],
  [1570, 0.03, 0.18],
];
/** Cycle-bell dome partials (ratios) and levels. */
const CYCLE_BELL_RATIOS = [1, 1.41, 2.97];
const CYCLE_BELL_LEVELS = [1, 0.55, 0.3];
const THRUST_LEVEL = 0.34;

/**
 * Per-sound output trims, calibrated against the music bed with
 * speaker-weighted loudness renders (so dhol sub-bass doesn't fool peaks).
 */
const SFX_TRIM = {
  coin: 1.35,
  jump: 3.2,
  slide: 1.7,
  land: 0.85,
  crash: 1.4,
  smash: 1.7,
  nearMiss: 2.2,
  click: 1,
  countdown: 0.45,
  go: 0.6,
  powerup: 1.5,
  shield: 1,
  perfect: 0.8,
  combo: 0.58,
  odReady: 0.25,
  odGo: 0.65,
  levelUp: 0.63,
  mission: 0.68,
  unlock: 0.7,
  biome: 0.86,
  warn: 2.2,
  honk: 1.4,
  moo: 0.32,
  bell: 0.4,
  rocket: 1.8,
  rocketLand: 1,
  magnet: 1,
  thrust: 0.43,
  dhol: 0.7,
  tirakita: 0.7,
  shehnai: 0.25,
  ting: 0.74,
  boing: 1.75,
  drama: 0.7,
} as const;
type SfxChannel = keyof typeof SFX_TRIM;

/**
 * Every gameplay sound effect, synthesized with a desi street flavour, plus
 * the instant meme stingers and the Diwali-rocket thrust loop. All output
 * goes through a per-sound trim into the SFX bus (so the SFX toggle and
 * master mute apply).
 */
export class DesiSfx {
  private enabled = true;
  private lastCoinAt = -1;
  private lastCoinIndex = -1;
  private lastCountdownAt = -10;
  private countdownIndex = 0;
  private thrust: ThrustLoop | null = null;
  private thrustFrozen = false;

  /** One persistent trim node per sound → SFX bus (no per-call cost). */
  private readonly out: Record<SfxChannel, GainNode>;

  constructor(private readonly g: AudioGraph) {
    const out = {} as Record<SfxChannel, GainNode>;
    for (const name of Object.keys(SFX_TRIM) as SfxChannel[]) {
      const trim = makeGain(g.ctx, SFX_TRIM[name]);
      trim.connect(g.sfxBus);
      out[name] = trim;
    }
    this.out = out;
  }

  /** False while SFX are disabled or muted — skips building silent nodes. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private get now(): number {
    return this.g.ctx.currentTime;
  }

  // ------------------------------------------------------------- movement

  coin(): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.coin;
    const t = this.now;
    if (t - this.lastCoinAt < COIN_MIN_GAP) return;
    const streak = t - this.lastCoinAt < 0.4;
    this.lastCoinAt = t;
    let index = Math.floor(Math.random() * COIN_RATIOS.length);
    if (index === this.lastCoinIndex) {
      index = (index + 1 + Math.floor(Math.random() * (COIN_RATIOS.length - 1))) % COIN_RATIOS.length;
    }
    this.lastCoinIndex = index;
    const hz = COIN_BASE_HZ * COIN_RATIOS[index] * (1 + (Math.random() - 0.5) * 0.012);
    const vel = streak ? 0.8 : 1;
    tone(g, out, t, "sine", hz, hz, 0, 0.13 * vel, 0.002, 0.22);
    tone(g, out, t, "sine", hz * 2.76, hz * 2.76, 0, 0.04 * vel, 0.001, 0.08);
    noiseBurst(g, out, t, "highpass", 7000, 7000, 0.7, 0.05 * vel, 0.001, 0.05);
  }

  jump(): void {
    if (!this.enabled) return;
    const t = this.now;
    noiseBurst(this.g, this.out.jump, t, "bandpass", 500, 2400, 1.2, 0.09, 0.012, 0.14);
    tone(this.g, this.out.jump, t, "triangle", 260, 560, 0.1, 0.06, 0.004, 0.1);
  }

  slide(): void {
    if (!this.enabled) return;
    const t = this.now;
    noiseBurst(this.g, this.out.slide, t, "bandpass", 1800, 320, 0.9, 0.12, 0.008, 0.3);
    noiseBurst(this.g, this.out.slide, t, "lowpass", 260, 180, 0.7, 0.08, 0.01, 0.26);
  }

  land(): void {
    if (!this.enabled) return;
    const t = this.now;
    tone(this.g, this.out.land, t, "sine", 120, 48, 0.12, 0.16, 0.002, 0.14);
    noiseBurst(this.g, this.out.land, t, "lowpass", 900, 500, 0.7, 0.06, 0.001, 0.05);
  }

  crash(): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.crash;
    const t = this.now;
    tone(g, out, t, "sine", 92, 32, 0.3, 0.5, 0.002, 0.45);
    noiseBurst(g, out, t, "lowpass", 3200, 220, 0.7, 0.38, 0.002, 0.55);
    for (const [hz, level, decay] of CLANG) tone(g, out, t, "sine", hz, hz * 0.98, decay, level, 0.001, decay);
    crackle(g, out, t + 0.05, 0.4, 0.12, 1500, randomBetween(-0.3, 0.3));
  }

  smash(): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.smash;
    const t = this.now;
    noiseBurst(g, out, t, "lowpass", 3200, 400, 0.7, 0.26, 0.001, 0.22);
    tone(g, out, t, "sine", 80, 38, 0.16, 0.2, 0.002, 0.18);
    noiseBurst(g, out, t, "bandpass", 1200, 900, 3, 0.2, 0.001, 0.06);
    tone(g, out, t, "triangle", 211, 205, 0.15, 0.07, 0.001, 0.15);
    tone(g, out, t, "triangle", 347, 340, 0.12, 0.05, 0.001, 0.12);
    crackle(g, out, t + 0.03, 0.25, 0.08, 1800);
  }

  nearMiss(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const t = this.now;
    const source = noiseSource(g, t, 0.3);
    const band = makeFilter(ctx, "bandpass", 2800, 1);
    band.frequency.setValueAtTime(2800, t);
    band.frequency.exponentialRampToValueAtTime(600, t + 0.24);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t);
    env.gain.exponentialRampToValueAtTime(0.12, t + 0.06);
    env.gain.exponentialRampToValueAtTime(SILENT, t + 0.27);
    source.connect(band);
    band.connect(env);
    // Doppler-ish pass: swings across the stereo field.
    const side = Math.random() < 0.5 ? -1 : 1;
    const panner = makePanner(ctx, 0.7 * side);
    if (panner) {
      panner.pan.setValueAtTime(0.7 * side, t);
      panner.pan.linearRampToValueAtTime(-0.7 * side, t + 0.26);
      env.connect(panner);
      panner.connect(this.out.nearMiss);
    } else {
      env.connect(this.out.nearMiss);
    }
    releaseWhenDone(source, band, env, panner);
  }

  // -------------------------------------------------------------------- UI

  click(): void {
    if (!this.enabled) return;
    const t = this.now;
    tone(this.g, this.out.click, t, "sine", 1850, 1500, 0.03, 0.07, 0.001, 0.04);
    noiseBurst(this.g, this.out.click, t, "bandpass", 3500, 3000, 2, 0.05, 0.001, 0.015);
  }

  /** 3-2-1 as rising tabla "na" + dhol; GO is a big dhol "DHA". */
  countdown(final: boolean): void {
    if (!this.enabled) return;
    const g = this.g;
    const t = this.now;
    if (!final) {
      const out = this.out.countdown;
      this.countdownIndex = t - this.lastCountdownAt < 1.3 ? Math.min(this.countdownIndex + 1, 2) : 0;
      this.lastCountdownAt = t;
      tabla(g, out, t, "na", 1, SFX_SA_HZ * COUNTDOWN_RATIOS[this.countdownIndex]);
      dholBass(g, out, t, 0.45);
      return;
    }
    const out = this.out.go;
    this.countdownIndex = 0;
    this.lastCountdownAt = -10;
    dholBass(g, out, t, 1);
    dholTreble(g, out, t, 0.9);
    tabla(g, out, t, "dha", 1, SFX_SA_HZ * 2);
    bell(g, out, t, 1175, 0.35, 0.8, 3);
    dholBass(g, out, t + 0.14, 0.7);
  }

  // --------------------------------------------------------------- rewards

  powerup(): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.powerup;
    const t = this.now;
    for (let i = 0; i < POWERUP_RATIOS.length; i++) {
      const hz = 784 * POWERUP_RATIOS[i];
      const at = t + i * 0.045;
      tone(g, out, at, "triangle", hz, hz, 0, 0.07, 0.003, 0.18);
      tone(g, out, at, "sine", hz * 2, hz * 2, 0, 0.025, 0.002, 0.12);
    }
    noiseBurst(g, out, t, "bandpass", 800, 3000, 1, 0.05, 0.02, 0.2);
  }

  /** Nimbu-mirchi shield shatters: glassy partials + thump. */
  shieldBreak(): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.shield;
    const t = this.now;
    tone(g, out, t, "sine", 100, 40, 0.25, 0.3, 0.002, 0.25);
    for (let i = 0; i < 6; i++) {
      const hz = randomBetween(2000, 6500);
      tone(g, out, t + Math.random() * 0.04, "sine", hz, hz * 0.97, 0.1, randomBetween(0.03, 0.05), 0.001, randomBetween(0.08, 0.25));
    }
    noiseBurst(g, out, t, "highpass", 3000, 3000, 0.7, 0.14, 0.001, 0.2);
    crackle(g, out, t + 0.02, 0.3, 0.1, 4000);
  }

  perfect(): void {
    if (!this.enabled) return;
    const t = this.now;
    bell(this.g, this.out.perfect, t, 2093, 0.45, 0.35, 2);
    tone(this.g, this.out.perfect, t, "sine", 1320, 1760, 0.08, 0.05, 0.002, 0.1);
  }

  comboMilestone(tier: number): void {
    if (!this.enabled) return;
    const g = this.g;
    const out = this.out.combo;
    const t = this.now;
    const index = Math.min(Math.max(Math.round(tier), 0), COMBO_RATIOS.length - 1);
    const base = 880 * COMBO_RATIOS[index];
    bell(g, out, t, base, 0.4, 0.4, 2);
    bell(g, out, t + 0.07, base * 1.5, 0.45, 0.5, 2);
    tabla(g, out, t, "na", 0.7, SFX_SA_HZ * 1.5);
  }

  overdriveReady(): void {
    if (!this.enabled) return;
    const t = this.now;
    const out = this.out.odReady;
    dholTreble(this.g, out, t, 0.8);
    dholTreble(this.g, out, t + 0.1, 0.95);
    this.shehnai(out, t + 0.05, [440, 587.33, 659.25], 0.07, 0.22);
  }

  /** JOSH: double dhol + rising sweep + sub drop. */
  overdriveActivate(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const out = this.out.odGo;
    const t = this.now;
    dholBass(g, out, t, 1);
    dholBass(g, out, t + 0.12, 0.85);
    dholTreble(g, out, t + 0.12, 0.8);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.setValueAtTime(160, t);
    saw.frequency.exponentialRampToValueAtTime(720, t + 0.45);
    const lowpass = makeFilter(ctx, "lowpass", 3000, 0.9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t);
    env.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
    env.gain.exponentialRampToValueAtTime(SILENT, t + 0.5);
    saw.connect(lowpass);
    lowpass.connect(env);
    env.connect(out);
    saw.start(t);
    saw.stop(t + 0.52);
    releaseWhenDone(saw, lowpass, env);
    noiseBurst(g, out, t, "bandpass", 400, 2400, 0.8, 0.1, 0.05, 0.4);
  }

  levelUp(): void {
    if (!this.enabled) return;
    const t = this.now;
    const out = this.out.levelUp;
    for (let i = 0; i < LEVEL_UP_RATIOS.length; i++) {
      bell(this.g, out, t + i * 0.1, 587.33 * LEVEL_UP_RATIOS[i], 0.4, 0.6, 3);
    }
    dholBass(this.g, out, t + 0.3, 0.6);
  }

  missionComplete(): void {
    if (!this.enabled) return;
    const t = this.now;
    const out = this.out.mission;
    bell(this.g, out, t, 880, 0.4, 0.5, 3);
    bell(this.g, out, t + 0.09, 1320, 0.45, 0.6, 3);
    tabla(this.g, out, t, "na", 0.6, SFX_SA_HZ * 2);
  }

  unlock(): void {
    if (!this.enabled) return;
    const t = this.now;
    bell(this.g, this.out.unlock, t, 1175, 0.5, 0.7, 4);
    tone(this.g, this.out.unlock, t + 0.05, "sine", 2349, 2349, 0, 0.03, 0.01, 0.4);
  }

  biomeShift(): void {
    if (!this.enabled) return;
    const t = this.now;
    bell(this.g, this.out.biome, t, 587.33, 0.3, 1.4, 3);
    noiseBurst(this.g, this.out.biome, t, "bandpass", 300, 1500, 0.8, 0.05, 0.3, 0.5);
  }

  /** Drone / laser warning: two nasal pressure-horn blips. */
  warn(): void {
    if (!this.enabled) return;
    const t = this.now;
    this.hornBlip(t, 330, 0.12, 0.09);
    this.hornBlip(t + 0.2, 330, 0.12, 0.09);
  }

  // -------------------------------------------------------- street cues

  /** Auto-rickshaw bulb horn: nasal "pom-pom". */
  honk(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const t = this.now;
    const f0 = 390 * randomBetween(0.94, 1.06);
    const reed = ctx.createOscillator();
    reed.type = "sawtooth";
    const buzz = ctx.createOscillator();
    buzz.type = "square";
    buzz.detune.value = 8;
    const buzzLevel = makeGain(ctx, 0.45);
    const body = makeFilter(ctx, "bandpass", 1100, 1.1);
    const nasal = makeFilter(ctx, "peaking", 2300, 2.5, 7);
    const distance = makeFilter(ctx, "lowpass", 3600, 0.7);
    const env = makeGain(ctx, SILENT);
    reed.connect(body);
    buzz.connect(buzzLevel);
    buzzLevel.connect(body);
    body.connect(nasal);
    nasal.connect(distance);
    distance.connect(env);
    const panner = connectPanned(ctx, env, this.out.honk, randomBetween(-0.4, 0.4));
    this.pom(reed.frequency, buzz.frequency, env.gain, t, 0.15, f0);
    this.pom(reed.frequency, buzz.frequency, env.gain, t + 0.24, 0.17, f0);
    reed.start(t);
    buzz.start(t);
    reed.stop(t + 0.46);
    buzz.stop(t + 0.46);
    releaseWhenDone(reed, buzz, buzzLevel, body, nasal, distance, env, panner);
  }

  /** Cow moo (formant synthesis). */
  moo(): void {
    if (!this.enabled) return;
    speakFormants(
      this.g,
      this.out.moo,
      MOO_PRESET,
      randomBetween(0.9, 1.1),
      randomBetween(0.9, 1.15),
      randomBetween(-0.4, 0.4)
    );
  }

  /** Cycle bell "tring-tring": rapid clapper strikes on a dome bell. */
  bell(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const t = this.now;
    const f0 = 2350 * randomBetween(0.97, 1.03);
    const env = makeGain(ctx, SILENT);
    const highpass = makeFilter(ctx, "highpass", 1200, 0.7);
    env.connect(highpass);
    const panner = connectPanned(ctx, highpass, this.out.bell, randomBetween(-0.4, 0.4));
    const oscillators: OscillatorNode[] = [];
    const levels: GainNode[] = [];
    for (let i = 0; i < CYCLE_BELL_RATIOS.length; i++) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f0 * CYCLE_BELL_RATIOS[i];
      const level = makeGain(ctx, CYCLE_BELL_LEVELS[i]);
      osc.connect(level);
      level.connect(env);
      oscillators.push(osc);
      levels.push(level);
    }
    for (let ring = 0; ring < 2; ring++) {
      const t0 = t + ring * 0.42;
      for (let k = 0; k < 7; k++) {
        const strike = t0 + k * 0.036;
        env.gain.setTargetAtTime(0.14, strike, 0.002);
        env.gain.setTargetAtTime(0.05, strike + 0.008, 0.012);
      }
      env.gain.setTargetAtTime(SILENT, t0 + 7 * 0.036, 0.09);
    }
    const end = t + 1.4;
    for (const osc of oscillators) {
      osc.start(t);
      osc.stop(end);
    }
    releaseWhenDone(oscillators[0], ...oscillators.slice(1), ...levels, env, highpass, panner);
  }

  // --------------------------------------------------------------- rocket

  /** Diwali rocket: fuse "sssshhh" → "FWOOSH" + whistle + crackle. */
  rocketLaunch(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const out = this.out.rocket;
    const t = this.now;

    const fuse = noiseSource(g, t, 0.36);
    const fuseTone = makeFilter(ctx, "highpass", 5200, 0.7);
    const fuseEnv = ctx.createGain();
    fuseEnv.gain.setValueAtTime(SILENT, t);
    fuseEnv.gain.exponentialRampToValueAtTime(0.07, t + 0.28);
    fuseEnv.gain.exponentialRampToValueAtTime(SILENT, t + 0.35);
    fuse.connect(fuseTone);
    fuseTone.connect(fuseEnv);
    fuseEnv.connect(out);
    releaseWhenDone(fuse, fuseTone, fuseEnv);

    const t0 = t + 0.28;
    const whoosh = noiseSource(g, t0, 0.82);
    const band = makeFilter(ctx, "bandpass", 300, 0.8);
    band.frequency.setValueAtTime(300, t0);
    band.frequency.exponentialRampToValueAtTime(2800, t0 + 0.5);
    const whooshEnv = ctx.createGain();
    whooshEnv.gain.setValueAtTime(SILENT, t0);
    whooshEnv.gain.exponentialRampToValueAtTime(0.34, t0 + 0.05);
    whooshEnv.gain.exponentialRampToValueAtTime(SILENT, t0 + 0.78);
    whoosh.connect(band);
    band.connect(whooshEnv);
    whooshEnv.connect(out);
    releaseWhenDone(whoosh, band, whooshEnv);

    noiseBurst(g, out, t0, "lowpass", 220, 120, 0.7, 0.25, 0.01, 0.6);
    tone(g, out, t0 + 0.05, "sine", 900, 2600, 0.7, 0.035, 0.05, 0.65);
    tone(g, out, t0, "sine", 72, 36, 0.25, 0.3, 0.002, 0.25);
    crackle(g, out, t0 + 0.1, 0.7, 0.2, 2500, randomBetween(-0.3, 0.3));
  }

  /** Idempotent thrust loop (hiss + rumble + sparkle crackle). */
  setThrust(on: boolean): void {
    const t = this.now;
    if (on) {
      if (this.thrust) return;
      this.thrust = new ThrustLoop(this.g, this.out.thrust, t, this.thrustFrozen);
    } else if (this.thrust) {
      this.thrust.stop(t);
      this.thrust = null;
    }
  }

  /** Game loop frozen (pause): keep the loop alive but silent. */
  freezeThrust(frozen: boolean): void {
    this.thrustFrozen = frozen;
    this.thrust?.setFrozen(frozen, this.now);
  }

  rocketLand(): void {
    if (!this.enabled) return;
    const t = this.now;
    const out = this.out.rocketLand;
    tone(this.g, out, t, "sine", 110, 40, 0.3, 0.35, 0.002, 0.3);
    noiseBurst(this.g, out, t, "lowpass", 1200, 300, 0.7, 0.18, 0.005, 0.35);
    crackle(this.g, out, t, 0.25, 0.06, 2500);
  }

  /** Chumbak switched on: resonant "vwooom" with a magnetic wobble. */
  magnetOn(): void {
    if (!this.enabled) return;
    const g = this.g;
    const ctx = g.ctx;
    const t = this.now;
    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = 110;
    const b = ctx.createOscillator();
    b.type = "sawtooth";
    b.frequency.value = 110.8;
    const sub = ctx.createOscillator();
    sub.frequency.value = 55;
    const subLevel = makeGain(ctx, 0.5);
    const sweep = makeFilter(ctx, "lowpass", 200, 8);
    sweep.frequency.setValueAtTime(200, t);
    sweep.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    sweep.frequency.exponentialRampToValueAtTime(600, t + 0.7);
    const wobble = ctx.createOscillator();
    wobble.frequency.setValueAtTime(14, t);
    wobble.frequency.exponentialRampToValueAtTime(4, t + 0.7);
    const wobbleDepth = makeGain(ctx, 300);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t);
    env.gain.exponentialRampToValueAtTime(0.14, t + 0.15);
    env.gain.exponentialRampToValueAtTime(SILENT, t + 0.75);
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(sweep.frequency);
    a.connect(sweep);
    b.connect(sweep);
    sub.connect(subLevel);
    subLevel.connect(env);
    sweep.connect(env);
    env.connect(this.out.magnet);
    for (const osc of [a, b, sub, wobble]) {
      osc.start(t);
      osc.stop(t + 0.8);
    }
    releaseWhenDone(a, b, sub, wobble, subLevel, sweep, wobbleDepth, env);
  }

  // -------------------------------------------------------------- stingers

  /** Instant hit that fronts every meme line (TTS may lag behind it). */
  stinger(kind: MemeStinger): void {
    if (!this.enabled) return;
    const g = this.g;
    const t = this.now;
    switch (kind) {
      case "dhol": {
        const out = this.out.dhol;
        dholBass(g, out, t, 1);
        dholTreble(g, out, t, 0.8);
        dholBass(g, out, t + 0.13, 0.75);
        break;
      }
      case "tirakita": {
        const out = this.out.tirakita;
        tabla(g, out, t, "ti", 0.6, SFX_SA_HZ);
        tabla(g, out, t + 0.05, "ra", 0.55, SFX_SA_HZ);
        tabla(g, out, t + 0.1, "ki", 0.65, SFX_SA_HZ);
        tabla(g, out, t + 0.15, "ta", 0.8, SFX_SA_HZ);
        tabla(g, out, t + 0.22, "dha", 1, SFX_SA_HZ);
        break;
      }
      case "shehnai": {
        // Festive toot: Sa (kan from Re) – Re – Ga – Pa~
        const sa = 587.33;
        this.shehnai(this.out.shehnai, t, [sa, sa * semitones(2), sa * semitones(4), sa * semitones(7)], 0.075, 0.3);
        break;
      }
      case "ting": {
        const out = this.out.ting;
        bell(g, out, t, 2349, 0.55, 0.9, 3);
        bell(g, out, t + 0.07, 3136, 0.35, 0.6, 2);
        noiseBurst(g, out, t, "highpass", 8000, 8000, 0.7, 0.04, 0.001, 0.08);
        break;
      }
      case "boing":
        this.boing(t);
        break;
      case "drama":
        this.drama(t);
        break;
    }
  }

  dispose(): void {
    this.thrust?.stop(this.now);
    this.thrust = null;
  }

  // ---------------------------------------------------------------- intern

  /** Quick shehnai flourish; the last note is held with vibrato. */
  private shehnai(dest: AudioNode, t: number, notes: readonly number[], step: number, hold: number): void {
    const voice = new LeadVoice(this.g, "shehnai", dest, null, t);
    let at = t;
    for (let i = 0; i < notes.length; i++) {
      const last = i === notes.length - 1;
      const duration = last ? hold : step;
      voice.note(at, notes[i], duration, i > 0, last ? 1 : 0.9, i === 0 ? notes[0] * semitones(2) : 0);
      at += duration;
    }
    voice.end(at - 0.02);
  }

  /** Comic spring "boi-oi-oing" (rising). */
  private boing(t: number): void {
    const g = this.g;
    const ctx = g.ctx;
    const out = this.out.boing;
    const spring = ctx.createOscillator();
    spring.frequency.setValueAtTime(170, t);
    spring.frequency.exponentialRampToValueAtTime(640, t + 0.26);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 16;
    const depth = makeGain(ctx, 60);
    depth.gain.setValueAtTime(60, t);
    depth.gain.linearRampToValueAtTime(0, t + 0.36);
    const env = ctx.createGain();
    pluckEnvelope(env.gain, t, 0.16, 0.006, 0.36);
    wobble.connect(depth);
    depth.connect(spring.frequency);
    spring.connect(env);
    env.connect(out);
    spring.start(t);
    wobble.start(t);
    spring.stop(t + 0.4);
    wobble.stop(t + 0.4);
    releaseWhenDone(spring, wobble, depth, env);
    tone(g, out, t, "triangle", 340, 1280, 0.26, 0.04, 0.006, 0.3);
  }

  /** TV-serial drama zoom: "dhin… dhin… DHINN" with whoosh swells. */
  private drama(t: number): void {
    const g = this.g;
    const out = this.out.drama;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.16;
      const vel = 0.65 + i * 0.17;
      dholBass(g, out, at, vel, i === 2 ? 0.88 : 1);
      noiseBurst(g, out, at, "bandpass", 500, 1500, 1, 0.06 * vel, 0.03, 0.12);
    }
    dholTreble(g, out, t + 0.32, 0.9);
  }

  private hornBlip(t: number, hz: number, duration: number, level: number): void {
    const ctx = this.g.ctx;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = hz;
    const band = makeFilter(ctx, "bandpass", 1100, 2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.01);
    env.gain.setValueAtTime(level, t + duration - 0.03);
    env.gain.exponentialRampToValueAtTime(SILENT, t + duration);
    saw.connect(band);
    band.connect(env);
    env.connect(this.out.warn);
    saw.start(t);
    saw.stop(t + duration + 0.02);
    releaseWhenDone(saw, band, env);
  }

  /** One bulb squeeze: pitch catches, holds, sags as the air runs out. */
  private pom(reed: AudioParam, buzz: AudioParam, amp: AudioParam, t: number, length: number, f0: number): void {
    for (const frequency of [reed, buzz]) {
      frequency.setValueAtTime(f0 * 0.9, t);
      frequency.exponentialRampToValueAtTime(f0, t + 0.025);
      frequency.setValueAtTime(f0, t + length - 0.04);
      frequency.exponentialRampToValueAtTime(f0 * 0.93, t + length);
    }
    amp.setValueAtTime(SILENT, t);
    amp.exponentialRampToValueAtTime(0.13, t + 0.012);
    amp.setValueAtTime(0.13, t + length - 0.035);
    amp.exponentialRampToValueAtTime(SILENT, t + length);
  }
}

/** Rocket thrust: looping hiss with flame flutter, low rumble, sparkles. */
class ThrustLoop {
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private stopped = false;

  constructor(g: AudioGraph, dest: AudioNode, t: number, frozen: boolean) {
    const ctx = g.ctx;
    this.out = makeGain(ctx, SILENT);
    this.out.connect(dest);
    this.out.gain.setValueAtTime(SILENT, t);
    this.out.gain.setTargetAtTime(frozen ? SILENT : THRUST_LEVEL, t, 0.06);

    const hiss = loopedNoise(g, t);
    const band = makeFilter(ctx, "bandpass", 2400, 0.6);
    const hissLevel = makeGain(ctx, 0.5);
    hiss.connect(band);
    band.connect(hissLevel);
    hissLevel.connect(this.out);

    const flutter = ctx.createOscillator();
    flutter.frequency.value = randomBetween(0.7, 1.1);
    const flutterDepth = makeGain(ctx, 700);
    flutter.connect(flutterDepth);
    flutterDepth.connect(band.frequency);
    flutter.start(t);

    const rumble = loopedNoise(g, t);
    const low = makeFilter(ctx, "lowpass", 200, 0.8);
    const rumbleLevel = makeGain(ctx, 0.9);
    rumble.connect(low);
    low.connect(rumbleLevel);
    rumbleLevel.connect(this.out);

    const sparks = loopedNoise(g, t, g.crackle);
    const high = makeFilter(ctx, "highpass", 3000, 0.7);
    const sparkLevel = makeGain(ctx, 0.35);
    sparks.connect(high);
    high.connect(sparkLevel);
    sparkLevel.connect(this.out);

    this.sources.push(hiss, flutter, rumble, sparks);
    this.nodes.push(band, hissLevel, flutterDepth, low, rumbleLevel, high, sparkLevel);
  }

  setFrozen(frozen: boolean, t: number): void {
    if (this.stopped) return;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(frozen ? SILENT : THRUST_LEVEL, t, 0.05);
  }

  stop(t: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(SILENT, t, 0.08);
    this.sources[0].onended = () => {
      for (const source of this.sources) source.disconnect();
      for (const node of this.nodes) node.disconnect();
      this.out.disconnect();
    };
    for (const source of this.sources) stopSafely(source, t + 0.5);
  }
}
