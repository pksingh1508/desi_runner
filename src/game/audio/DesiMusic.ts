import {
  MUSIC_MIX,
  MUSIC_THEMES,
  PATTERN_VELOCITY,
  type DrumVoice,
  type MusicTheme,
} from "@/game/config/music";
import type { AudioGraph } from "./AudioGraph";
import { LeadVoice } from "./LeadVoice";
import {
  bell,
  boom,
  chimta,
  crackle,
  dholBass,
  dholTreble,
  dholakBass,
  dholakSlap,
  drip,
  khartal,
  khartalRoll,
  loopedNoise,
  stringPluck,
  tabla,
  tanpuraPluck,
  tasha,
  thunder,
} from "./instruments";
import { SILENT, connectPanned, makeFilter, makeGain, stopSafely } from "./synth";

interface ParsedLane {
  voice: DrumVoice;
  velocity: Float32Array;
  minEnergy: number;
}

interface ParsedTheme {
  theme: MusicTheme;
  lanes: ParsedLane[];
  /** Aroha / avaroha ladders (semitones from Sa) within the lead range. */
  up: number[];
  down: number[];
  resting: number[];
  /** Hz for semitone offsets −24..+36 (index = semi + SEMI_OFFSET). */
  hz: Float32Array;
}

const SEMI_OFFSET = 24;
const SEMI_SPAN = 61;

function parseTheme(theme: MusicTheme): ParsedTheme {
  const lanes = theme.lanes.map((lane) => {
    const symbols = lane.pattern.replace(/\s+/g, "");
    const velocity = new Float32Array(16);
    for (let i = 0; i < 16; i++) velocity[i] = PATTERN_VELOCITY[symbols.charAt(i)] ?? 0;
    return { voice: lane.voice, velocity, minEnergy: lane.minEnergy ?? 0 };
  });
  const [low, high] = theme.range;
  const ladder = (degrees: readonly number[]): number[] => {
    const notes: number[] = [];
    for (let octave = -24; octave <= 24; octave += 12) {
      for (const degree of degrees) {
        const semi = degree + octave;
        if (semi >= low && semi <= high && !notes.includes(semi)) notes.push(semi);
      }
    }
    return notes.sort((a, b) => a - b);
  };
  const hz = new Float32Array(SEMI_SPAN);
  for (let i = 0; i < SEMI_SPAN; i++) hz[i] = theme.tonicHz * Math.pow(2, (i - SEMI_OFFSET) / 12);
  return { theme, lanes, up: ladder(theme.aroha), down: ladder(theme.avaroha), resting: ladder(theme.resting), hz };
}

/** Parsed once at module load (pure data — SSR-safe). */
const PARSED_THEMES: readonly ParsedTheme[] = MUSIC_THEMES.map(parseTheme);

/** Tanpura cycle relative to its Sa: Pa (lower), Sa, Sa, Sa (kharaj). */
const TANPURA_RATIOS = [0.7492, 1, 1, 0.5];
/** Note lengths (16th steps) the improviser draws from. */
const CALM_LENGTHS = [2, 2, 3, 4, 4, 6];
const BUSY_LENGTHS = [1, 1, 2, 2, 2, 3, 4];
const MAX_PHRASE_NOTES = 40;
const PA_RATIO = 1.4983;

interface PhraseNote {
  start: number;
  len: number;
  semi: number;
  legato: boolean;
  grace: boolean;
}

interface RainBed {
  source: AudioBufferSourceNode;
  lfo: OscillatorNode;
  out: GainNode;
  depth: GainNode;
  filters: AudioNode[];
}

/** Position inside the current quarter-note beat (reused, never reallocated). */
export interface BeatTiming {
  /** 0 = on the beat (dhol hit), → 1 just before the next one. */
  readonly phase: number;
  readonly secondsPerBeat: number;
}

/** Recently scheduled beat onsets kept for phase queries (power of two). */
const BEAT_HISTORY = 8;

/**
 * Procedural Indian street groove with lookahead scheduling: dhol / dholak /
 * tabla lanes with swing, a tanpura drone (Sa–Pa), theme colour layers and a
 * shehnai / bansuri lead improvising raag-flavoured phrases. `update()` runs
 * every frame but only allocates audio nodes for notes that fall due.
 */
export class DesiMusic {
  private playing = false;
  private audible = true;
  private frozen = false;
  private step = 0;
  private nextStepTime = 0;
  private energy = 0;
  private themeIndex = 0;
  private pendingTheme = -1;
  private parsed: ParsedTheme = PARSED_THEMES[0];

  private readonly drums: GainNode;
  private readonly perc: GainNode;
  private readonly leadBus: GainNode;
  private readonly leadSend: GainNode;
  private readonly droneIn: GainNode;
  private readonly droneSend: GainNode;
  private readonly sparkle: GainNode;
  private readonly sparkleSend: GainNode;
  private readonly bed: GainNode;

  private lead: LeadVoice | null = null;
  private readonly notes: PhraseNote[] = [];
  private noteCount = 0;
  private noteCursor = 0;
  private phraseStart = -1;
  private restUntil = 0;
  private lastSemi = 0;

  private rain: RainBed | null = null;

  private readonly beatStarts = new Float64Array(BEAT_HISTORY);
  private readonly beatLengths = new Float64Array(BEAT_HISTORY);
  private beatCount = 0;
  private readonly beatResult = { phase: 0, secondsPerBeat: 0 };

  constructor(private readonly g: AudioGraph) {
    const ctx = g.ctx;
    const gate = g.musicIn;
    for (let i = 0; i < MAX_PHRASE_NOTES; i++) {
      this.notes.push({ start: 0, len: 0, semi: 0, legato: false, grace: false });
    }
    this.drums = makeGain(ctx, MUSIC_MIX.drums);
    this.drums.connect(gate);
    this.perc = makeGain(ctx, MUSIC_MIX.perc);
    connectPanned(ctx, this.perc, gate, -0.28);
    this.leadBus = makeGain(ctx, MUSIC_MIX.lead);
    connectPanned(ctx, this.leadBus, gate, 0.12);
    this.leadSend = makeGain(ctx, 0);
    this.leadSend.connect(g.musicWet);
    this.droneIn = makeGain(ctx, MUSIC_MIX.drone);
    this.droneIn.connect(gate);
    this.droneSend = makeGain(ctx, 0);
    this.droneIn.connect(this.droneSend);
    this.droneSend.connect(g.musicWet);
    this.sparkle = makeGain(ctx, MUSIC_MIX.sparkle);
    connectPanned(ctx, this.sparkle, gate, 0.3);
    this.sparkleSend = makeGain(ctx, 0);
    this.sparkle.connect(this.sparkleSend);
    this.sparkleSend.connect(g.musicWet);
    this.bed = makeGain(ctx, MUSIC_MIX.bed);
    this.bed.connect(gate);
    this.applySends(ctx.currentTime);
  }

  get themeId(): string {
    return this.parsed.theme.id;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Music disabled or muted: stop creating notes (time keeps flowing). */
  setAudible(audible: boolean): void {
    if (this.audible === audible) return;
    this.audible = audible;
    if (!audible) this.cutLead(this.g.ctx.currentTime);
  }

  /** Switches flavour; while playing it lands on the next bar with a fill. */
  setTheme(index: number): void {
    if (!this.playing) {
      this.pendingTheme = -1;
      if (index !== this.themeIndex) this.applyTheme(index, this.g.ctx.currentTime, false);
      return;
    }
    this.pendingTheme = index === this.themeIndex ? -1 : index;
  }

  start(): void {
    if (this.playing) return;
    const t = this.g.ctx.currentTime;
    this.playing = true;
    this.frozen = false;
    this.step = 0;
    this.nextStepTime = t + 0.05;
    this.restUntil = 4;
    this.phraseStart = -1;
    this.beatCount = 0;
    this.setGate(t, 1, MUSIC_MIX.startFade);
    if (this.parsed.theme.layers.rain) this.startRain(t);
  }

  stop(): void {
    if (!this.playing) return;
    const t = this.g.ctx.currentTime;
    this.playing = false;
    this.frozen = false;
    this.setGate(t, SILENT, MUSIC_MIX.stopFade);
    this.cutLead(t);
    this.stopRain(t, 0.5);
  }

  /** Game loop stalled (pause / hidden tab): fade out; resume on thaw. */
  freeze(frozen: boolean): void {
    if (!this.playing || this.frozen === frozen) return;
    this.frozen = frozen;
    const t = this.g.ctx.currentTime;
    if (frozen) {
      this.setGate(t, SILENT, MUSIC_MIX.freezeFade);
      this.cutLead(t);
    } else {
      this.setGate(t, 1, MUSIC_MIX.startFade);
    }
  }

  /** Per-frame: schedules every 16th step that falls inside the lookahead. */
  update(speedRatio: number): void {
    if (!this.playing) return;
    const now = this.g.ctx.currentTime;
    this.energy = speedRatio < 0 ? 0 : speedRatio > 1 ? 1 : speedRatio;
    // After a stall the clock ran ahead — skip missed steps instead of
    // firing them all at once.
    if (this.nextStepTime < now - MUSIC_MIX.resyncSeconds) this.nextStepTime = now + 0.02;
    while (this.nextStepTime < now + MUSIC_MIX.lookahead) {
      if ((this.step & 15) === 0 && this.pendingTheme >= 0) {
        this.applyTheme(this.pendingTheme, this.nextStepTime, this.audible && !this.frozen);
      }
      const theme = this.parsed.theme;
      const stepDur = 60 / (theme.bpm + theme.bpmRange * this.energy) / 4;
      if ((this.step & 3) === 0) {
        const slot = this.beatCount & (BEAT_HISTORY - 1);
        this.beatStarts[slot] = this.nextStepTime;
        this.beatLengths[slot] = stepDur * 4;
        this.beatCount++;
      }
      if (this.audible && !this.frozen) this.scheduleStep(this.step, this.nextStepTime, stepDur);
      this.step++;
      this.nextStepTime += stepDur;
    }
  }

  /**
   * Beat phase at context time `heardTime` (the caller subtracts output
   * latency). Null when the groove isn't running or no beat has sounded yet.
   * Returns one reused object — read it immediately.
   */
  beatTiming(heardTime: number): BeatTiming | null {
    if (!this.playing) return null;
    const known = Math.min(this.beatCount, BEAT_HISTORY);
    for (let i = 1; i <= known; i++) {
      const slot = (this.beatCount - i) & (BEAT_HISTORY - 1);
      const start = this.beatStarts[slot];
      if (start > heardTime) continue;
      const length = this.beatLengths[slot];
      const beats = (heardTime - start) / length;
      // Past the newest known beat (stalled scheduler) → extrapolate.
      this.beatResult.phase = beats - Math.floor(beats);
      this.beatResult.secondsPerBeat = length;
      return this.beatResult;
    }
    return null;
  }

  dispose(): void {
    const t = this.g.ctx.currentTime;
    this.playing = false;
    this.cutLead(t);
    this.stopRain(t, 0.05);
  }

  // ------------------------------------------------------------ scheduling

  private scheduleStep(step: number, t: number, stepDur: number): void {
    const s = step & 15;
    const parsed = this.parsed;
    const theme = parsed.theme;
    const energy = this.energy;
    const swung = (s & 1) === 1 ? t + theme.swing * stepDur : t;

    for (let i = 0; i < parsed.lanes.length; i++) {
      const lane = parsed.lanes[i];
      if (energy < lane.minEnergy) continue;
      const velocity = lane.velocity[s];
      if (velocity <= 0) continue;
      const humanize = (Math.random() * 2 - 1) * MUSIC_MIX.humanize;
      this.hit(lane.voice, swung + humanize, velocity * (0.88 + Math.random() * 0.24));
    }

    const bar = step >> 4;
    const fillBar =
      this.pendingTheme >= 0 ||
      (energy >= MUSIC_MIX.fillMinEnergy && bar % MUSIC_MIX.fillEveryBars === MUSIC_MIX.fillEveryBars - 1);
    if (fillBar && s >= 12) this.fill(s, swung, stepDur);

    if ((s & 3) === 0) {
      const hz = theme.tonicHz * 0.5 * TANPURA_RATIOS[s >> 2];
      tanpuraPluck(this.g, this.droneIn, t, hz, 0.1 * theme.droneLevel * (0.85 + energy * 0.15), stepDur * 10);
    }

    if (theme.layers.ektara) this.ektara(s, t, theme);
    if (theme.layers.bells) this.bells(s, t, theme);
    if (theme.layers.crackers && s === 0) this.crackers(t, stepDur * 16);
    if (theme.layers.rain) this.rainDrops(s, t, stepDur);

    this.leadStep(step, t, stepDur);
  }

  private hit(voice: DrumVoice, t: number, vel: number): void {
    const g = this.g;
    const drums = this.drums;
    const sa = this.parsed.theme.tonicHz;
    switch (voice) {
      case "dholBass":
        dholBass(g, drums, t, vel);
        break;
      case "dholTreble":
        dholTreble(g, drums, t, vel);
        break;
      case "tasha":
        tasha(g, this.perc, t, vel);
        break;
      case "chimta":
        chimta(g, this.perc, t, vel);
        break;
      case "dholakBass":
        dholakBass(g, drums, t, vel);
        break;
      case "dholakSlap":
        dholakSlap(g, drums, t, vel);
        break;
      case "khartal":
        khartal(g, this.perc, t, vel);
        break;
      case "khartalRoll":
        khartalRoll(g, this.perc, t, vel);
        break;
      case "tablaDha":
        tabla(g, drums, t, "dha", vel, sa);
        break;
      case "tablaDhin":
        tabla(g, drums, t, "dhin", vel, sa);
        break;
      case "tablaNa":
        tabla(g, drums, t, "na", vel, sa);
        break;
      case "tablaTin":
        tabla(g, drums, t, "tin", vel, sa);
        break;
      case "tablaTi":
        tabla(g, drums, t, "ti", vel, sa);
        break;
      case "tablaRa":
        tabla(g, drums, t, "ra", vel, sa);
        break;
      case "tablaGe":
        tabla(g, drums, t, "ge", vel, sa);
        break;
      case "tablaKa":
        tabla(g, drums, t, "ka", vel, sa);
        break;
    }
  }

  /** Last-beat roll in 32nds (theme transitions and high-energy bars). */
  private fill(s: number, t: number, stepDur: number): void {
    const g = this.g;
    const drums = this.drums;
    const ramp = 0.5 + (s - 12) * 0.14;
    const half = t + stepDur * 0.5;
    switch (this.parsed.theme.kit) {
      case "tabla": {
        const sa = this.parsed.theme.tonicHz;
        tabla(g, drums, t, s === 15 ? "dha" : (s & 1) === 1 ? "ra" : "ti", ramp, sa);
        tabla(g, drums, half, "ki", ramp * 0.8, sa);
        break;
      }
      case "dholak":
        dholakSlap(g, drums, t, ramp);
        dholakSlap(g, drums, half, ramp * 0.85);
        if (s === 15) dholakBass(g, drums, half, 1);
        break;
      default:
        dholTreble(g, drums, t, ramp);
        dholTreble(g, drums, half, ramp * 0.85);
        if (s === 15) dholBass(g, drums, half, 0.9);
        break;
    }
  }

  private ektara(s: number, t: number, theme: MusicTheme): void {
    const sa = theme.tonicHz * 0.5;
    if (s === 0) stringPluck(this.g, this.sparkle, t, sa, 0.8, 2);
    else if (s === 8 && Math.random() < 0.55) stringPluck(this.g, this.sparkle, t, sa * PA_RATIO, 0.6, Math.random() < 0.5 ? 1 : 0);
    else if (s === 14 && this.energy > 0.4 && Math.random() < 0.4) stringPluck(this.g, this.sparkle, t, sa * 2, 0.5);
  }

  private bells(s: number, t: number, theme: MusicTheme): void {
    const hz = theme.tonicHz * 2;
    if (s === 0) bell(this.g, this.sparkle, t, hz, 0.9, 1.6);
    else if (s === 8 && Math.random() < 0.45) bell(this.g, this.sparkle, t, hz * PA_RATIO, 0.6, 1.2, 3);
    else if ((s & 1) === 1 && Math.random() < 0.04) {
      bell(this.g, this.sparkle, t, hz * 2 * (Math.random() < 0.5 ? 1 : 1.26), 0.35, 0.6, 2);
    }
  }

  private crackers(t: number, barDur: number): void {
    if (Math.random() < MUSIC_MIX.crackleChance) {
      crackle(
        this.g,
        this.bed,
        t + Math.random() * barDur,
        0.5 + Math.random() * 0.7,
        0.05 + Math.random() * 0.05,
        2600,
        Math.random() * 1.6 - 0.8
      );
    }
    if (Math.random() < MUSIC_MIX.boomChance) boom(this.g, this.bed, t + Math.random() * barDur, 0.25 + Math.random() * 0.15);
  }

  private rainDrops(s: number, t: number, stepDur: number): void {
    if (Math.random() < MUSIC_MIX.dripChance) {
      drip(this.g, this.bed, t + Math.random() * stepDur, 1400 + Math.random() * 1800, 0.03 + Math.random() * 0.03);
    }
    if (s === 0 && Math.random() < MUSIC_MIX.thunderChance) thunder(this.g, this.bed, t, 0.22);
  }

  // ----------------------------------------------------------------- lead

  private leadStep(step: number, t: number, stepDur: number): void {
    const theme = this.parsed.theme;
    if (this.phraseStart < 0) {
      if (step < this.restUntil) return;
      const s = step & 15;
      if (s !== 0 && s !== 8) return;
      if (Math.random() > theme.leadDensity + this.energy * 0.25) {
        this.restUntil = step + 8;
        return;
      }
      this.planPhrase(step);
      this.lead = new LeadVoice(this.g, theme.lead, this.leadBus, this.leadSend, t, theme.leadLevel);
    }
    const lead = this.lead;
    if (!lead) return;
    const rel = step - this.phraseStart;
    while (this.noteCursor < this.noteCount && this.notes[this.noteCursor].start <= rel) {
      const note = this.notes[this.noteCursor++];
      if (note.start < rel) continue; // missed (should not happen) — skip
      const duration = note.len * stepDur;
      const grace = note.grace ? this.hz(this.neighbourAbove(note.semi)) : 0;
      lead.note(t, this.hz(note.semi), duration, note.legato, (note.start & 3) === 0 ? 1 : 0.86, grace);
      const next = this.noteCursor < this.noteCount ? this.notes[this.noteCursor] : null;
      const tail = Math.min(0.04, duration * 0.2);
      if (!next) {
        lead.end(t + duration - tail);
        this.lead = null;
        this.phraseStart = -1;
        this.restUntil = step + note.len + MUSIC_MIX.restSteps + Math.floor(Math.random() * MUSIC_MIX.restStepsRandom);
        return;
      }
      if (!(next.legato && next.start === note.start + note.len)) lead.release(t + duration - tail);
    }
  }

  /** Improvises one phrase: raag-grammar walk, then a long resting cadence. */
  private planPhrase(step: number): void {
    const energy = this.energy;
    const total = energy > 0.5 && Math.random() < 0.45 ? 32 : 16;
    const lengths = energy > 0.55 ? BUSY_LENGTHS : CALM_LENGTHS;
    let semi = this.startSemi();
    let direction = semi > 6 ? -1 : 1;
    let pos = 0;
    let count = 0;
    while (count < MAX_PHRASE_NOTES - 1) {
      const len = lengths[Math.floor(Math.random() * lengths.length)];
      if (pos + len > total - 4) break;
      if (Math.random() < 0.3) direction = -direction;
      let next = this.walk(semi, direction);
      if (next === semi) {
        direction = -direction;
        next = this.walk(semi, direction);
      }
      semi = next;
      const note = this.notes[count++];
      note.start = pos;
      note.len = len;
      note.semi = semi;
      note.legato = count > 1 && Math.random() < 0.8;
      note.grace = len >= 2 && Math.random() < 0.22;
      pos += len;
      if (Math.random() < 0.12) pos += 1 + Math.floor(Math.random() * 2);
    }
    const last = this.notes[count++];
    last.start = pos;
    last.len = Math.max(4, total - pos);
    last.semi = this.nearestResting(semi);
    last.legato = true;
    last.grace = Math.random() < 0.5;
    this.noteCount = count;
    this.noteCursor = 0;
    this.phraseStart = step;
    this.lastSemi = last.semi;
  }

  private startSemi(): number {
    const target =
      this.energy > 0.6 ? 12 : Math.random() < 0.5 ? this.lastSemi : Math.random() < 0.5 ? 0 : 7;
    return nearest(this.parsed.up, target);
  }

  /** One step along aroha (up) or avaroha (down); occasional leap. */
  private walk(semi: number, direction: number): number {
    const ladder = direction > 0 ? this.parsed.up : this.parsed.down;
    const leap = Math.random() < 0.18 ? 2 : 1;
    if (direction > 0) {
      for (let i = 0; i < ladder.length; i++) {
        if (ladder[i] > semi) return ladder[Math.min(i + leap - 1, ladder.length - 1)];
      }
    } else {
      for (let i = ladder.length - 1; i >= 0; i--) {
        if (ladder[i] < semi) return ladder[Math.max(i - leap + 1, 0)];
      }
    }
    return semi;
  }

  private neighbourAbove(semi: number): number {
    const up = this.parsed.up;
    for (let i = 0; i < up.length; i++) if (up[i] > semi) return up[i];
    return semi + 2;
  }

  private nearestResting(semi: number): number {
    return nearest(this.parsed.resting, semi);
  }

  private hz(semi: number): number {
    const index = Math.min(SEMI_SPAN - 1, Math.max(0, semi + SEMI_OFFSET));
    return this.parsed.hz[index];
  }

  private cutLead(t: number): void {
    this.lead?.cut(t);
    this.lead = null;
    this.phraseStart = -1;
    this.restUntil = this.step + 4;
  }

  // ---------------------------------------------------------------- themes

  private applyTheme(index: number, t: number, accent: boolean): void {
    const count = PARSED_THEMES.length;
    this.themeIndex = ((index % count) + count) % count;
    this.parsed = PARSED_THEMES[this.themeIndex];
    this.pendingTheme = -1;
    // A phrase in the old raag ends where the new section begins.
    this.lead?.end(t);
    this.lead = null;
    this.phraseStart = -1;
    this.restUntil = this.step + 4;
    this.applySends(t);
    if (this.playing) {
      if (this.parsed.theme.layers.rain) this.startRain(t);
      else this.stopRain(t, 1.5);
    }
    if (accent) this.downbeatAccent(t);
  }

  private applySends(t: number): void {
    const reverb = this.parsed.theme.reverb;
    this.leadSend.gain.setTargetAtTime(reverb, t, 0.3);
    this.droneSend.gain.setTargetAtTime(reverb * 0.8, t, 0.3);
    this.sparkleSend.gain.setTargetAtTime(reverb * 1.3, t, 0.3);
  }

  /** Big "sam" hit announcing a new biome section. */
  private downbeatAccent(t: number): void {
    const theme = this.parsed.theme;
    if (theme.kit === "tabla") tabla(this.g, this.drums, t, "dha", 1, theme.tonicHz);
    else dholBass(this.g, this.drums, t, 0.9);
    bell(this.g, this.sparkle, t, theme.tonicHz * 2, 0.35, 1.4, 3);
  }

  // ------------------------------------------------------------------ rain

  private startRain(t: number): void {
    if (this.rain) return;
    const ctx = this.g.ctx;
    const source = loopedNoise(this.g, t);
    const highpass = makeFilter(ctx, "highpass", 450, 0.5);
    const lowpass = makeFilter(ctx, "lowpass", 5200, 0.5);
    const out = makeGain(ctx, SILENT);
    out.gain.setValueAtTime(SILENT, t);
    out.gain.setTargetAtTime(MUSIC_MIX.rainLevel, t, 0.6);
    // Slow gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = makeGain(ctx, 0);
    depth.gain.setTargetAtTime(MUSIC_MIX.rainLevel * 0.35, t, 0.6);
    lfo.connect(depth);
    depth.connect(out.gain);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(out);
    out.connect(this.bed);
    lfo.start(t);
    this.rain = { source, lfo, out, depth, filters: [highpass, lowpass] };
  }

  private stopRain(t: number, fade: number): void {
    const rain = this.rain;
    if (!rain) return;
    this.rain = null;
    rain.out.gain.cancelScheduledValues(t);
    rain.out.gain.setTargetAtTime(SILENT, t, fade / 3);
    rain.depth.gain.cancelScheduledValues(t);
    rain.depth.gain.setTargetAtTime(0, t, fade / 3);
    rain.source.onended = () => {
      rain.source.disconnect();
      rain.lfo.disconnect();
      rain.depth.disconnect();
      rain.out.disconnect();
      for (const node of rain.filters) node.disconnect();
    };
    stopSafely(rain.source, t + fade * 2 + 0.05);
    stopSafely(rain.lfo, t + fade * 2 + 0.05);
  }

  private setGate(t: number, value: number, timeConstant: number): void {
    const gate = this.g.musicIn.gain;
    gate.cancelScheduledValues(t);
    gate.setTargetAtTime(value, t, timeConstant);
  }
}

function nearest(values: readonly number[], target: number): number {
  let best = values[0] ?? 0;
  let bestDistance = Infinity;
  for (let i = 0; i < values.length; i++) {
    const distance = Math.abs(values[i] - target);
    if (distance < bestDistance) {
      best = values[i];
      bestDistance = distance;
    }
  }
  return best;
}
