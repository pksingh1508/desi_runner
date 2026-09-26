import type { LeadTimbre } from "@/game/config/music";
import type { AudioGraph } from "./AudioGraph";
import { SILENT, makeFilter, makeGain, stopSafely } from "./synth";

interface LeadSpec {
  /** Source spectrum from AudioGraph.waves. */
  wave: "reed" | "flute";
  highpass: number;
  /** Nasal / body resonances as [Hz, gain dB, Q] peaking filters. */
  peaks: readonly (readonly [number, number, number])[];
  lowpass: number;
  vibratoHz: number;
  /** Vibrato depth reached on held notes (delayed onset, like a singer). */
  vibratoCents: number;
  /** Meend (slide) time between legato notes. */
  glide: number;
  attack: number;
  release: number;
  /** Breath noise level (bansuri / murli), 0 = none. */
  breath: number;
  breathHz: number;
  level: number;
}

/** Sound design per lead instrument. */
const LEAD_SPECS: Record<LeadTimbre, LeadSpec> = {
  shehnai: {
    wave: "reed",
    highpass: 420,
    peaks: [
      [1250, 9, 1.6],
      [2900, 7, 2.2],
    ],
    lowpass: 5200,
    vibratoHz: 5.8,
    vibratoCents: 32,
    glide: 0.06,
    attack: 0.035,
    release: 0.09,
    breath: 0,
    breathHz: 0,
    level: 0.3,
  },
  brightShehnai: {
    wave: "reed",
    highpass: 480,
    peaks: [
      [1400, 8, 1.5],
      [3300, 9, 2],
    ],
    lowpass: 6800,
    vibratoHz: 6.2,
    vibratoCents: 28,
    glide: 0.05,
    attack: 0.03,
    release: 0.08,
    breath: 0,
    breathHz: 0,
    level: 0.26,
  },
  murli: {
    wave: "reed",
    highpass: 280,
    peaks: [
      [950, 11, 2.4],
      [2400, 4, 3],
    ],
    lowpass: 3200,
    vibratoHz: 5,
    vibratoCents: 22,
    glide: 0.08,
    attack: 0.05,
    release: 0.12,
    breath: 0.035,
    breathHz: 1800,
    level: 0.3,
  },
  bansuri: {
    wave: "flute",
    highpass: 180,
    peaks: [[1800, 3, 1]],
    lowpass: 3000,
    vibratoHz: 4.6,
    vibratoCents: 18,
    glide: 0.1,
    attack: 0.08,
    release: 0.16,
    breath: 0.16,
    breathHz: 1500,
    level: 0.34,
  },
};

/**
 * One monophonic phrase of a desi wind instrument. The oscillators live for
 * the whole phrase so legato notes glide (meend) instead of re-triggering;
 * notes are pure automation on the persistent nodes. Create one per phrase,
 * schedule `note()`s in time order, then `end()` (or `cut()` to silence now).
 */
export class LeadVoice {
  private readonly spec: LeadSpec;
  private readonly level: number;
  private readonly osc: OscillatorNode;
  private readonly lfo: OscillatorNode;
  private readonly vibrato: GainNode;
  private readonly amp: GainNode;
  private readonly breathSource: AudioBufferSourceNode | null;
  private readonly breathGain: GainNode | null;
  private readonly nodes: AudioNode[] = [];
  private lastHz = 0;
  private sounding = false;
  private ended = false;

  constructor(
    g: AudioGraph,
    timbre: LeadTimbre,
    dest: AudioNode,
    wet: AudioNode | null,
    t0: number,
    levelScale = 1
  ) {
    const ctx = g.ctx;
    const spec = LEAD_SPECS[timbre];
    this.spec = spec;
    this.level = spec.level * levelScale;

    this.osc = ctx.createOscillator();
    this.osc.setPeriodicWave(spec.wave === "reed" ? g.waves.reed : g.waves.flute);
    this.osc.frequency.value = 440;

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = spec.vibratoHz * (0.95 + Math.random() * 0.1);
    this.vibrato = makeGain(ctx, 0);
    this.lfo.connect(this.vibrato);
    this.vibrato.connect(this.osc.detune);

    let head: AudioNode = makeFilter(ctx, "highpass", spec.highpass, 0.7);
    this.osc.connect(head);
    this.nodes.push(head);
    for (const [hz, db, q] of spec.peaks) {
      const peak = makeFilter(ctx, "peaking", hz, q, db);
      head.connect(peak);
      head = peak;
      this.nodes.push(peak);
    }
    const lowpass = makeFilter(ctx, "lowpass", spec.lowpass, 0.6);
    head.connect(lowpass);
    this.nodes.push(lowpass);

    this.amp = makeGain(ctx, SILENT);
    lowpass.connect(this.amp);

    if (spec.breath > 0) {
      const source = ctx.createBufferSource();
      source.buffer = g.noise;
      source.loop = true;
      const band = makeFilter(ctx, "bandpass", spec.breathHz, 0.8);
      const breath = makeGain(ctx, spec.breath);
      source.connect(band);
      band.connect(breath);
      // Breath rides the same envelope as the tone.
      breath.connect(this.amp);
      this.nodes.push(band, breath);
      this.breathSource = source;
      this.breathGain = breath;
      source.start(t0, Math.random() * (g.noise.duration * 0.8));
    } else {
      this.breathSource = null;
      this.breathGain = null;
    }

    this.amp.connect(dest);
    if (wet) this.amp.connect(wet);

    this.osc.start(t0);
    this.lfo.start(t0);
    this.osc.onended = () => this.disconnect();
  }

  /**
   * Schedules a note. Legato notes slide from the previous pitch (meend);
   * detached notes attack from silence, optionally from a grace note (kan).
   */
  note(t: number, hz: number, duration: number, legato: boolean, accent: number, graceHz: number): void {
    if (this.ended) return;
    const spec = this.spec;
    const frequency = this.osc.frequency;
    const amp = this.amp.gain;
    const level = this.level * accent;

    if (this.sounding && legato && this.lastHz > 0) {
      frequency.setValueAtTime(this.lastHz, t);
      frequency.exponentialRampToValueAtTime(hz, t + Math.min(spec.glide, duration * 0.45));
      // Tiny re-articulation dip so repeated swaras stay audible.
      amp.setTargetAtTime(level * 0.8, t, 0.012);
      amp.setTargetAtTime(level, t + 0.03, 0.04);
    } else {
      if (graceHz > 0) {
        frequency.setValueAtTime(graceHz, t);
        frequency.exponentialRampToValueAtTime(hz, t + Math.min(0.05, duration * 0.3));
      } else {
        frequency.setValueAtTime(hz, t);
      }
      amp.setTargetAtTime(level, t, spec.attack / 3);
      if (this.breathGain) {
        // Breath "chiff" at the onset.
        this.breathGain.gain.setTargetAtTime(spec.breath * 2.4, t, 0.008);
        this.breathGain.gain.setTargetAtTime(spec.breath, t + 0.05, 0.05);
      }
    }

    const depth = this.vibrato.gain;
    depth.setTargetAtTime(0, t, 0.02);
    if (duration > 0.22) depth.setTargetAtTime(spec.vibratoCents, t + Math.min(0.14, duration * 0.35), 0.12);

    this.lastHz = hz;
    this.sounding = true;
  }

  /** Breathes out (silence) at `t`; a following note attacks fresh. */
  release(t: number): void {
    if (this.ended || !this.sounding) return;
    this.amp.gain.setTargetAtTime(SILENT, t, this.spec.release / 3);
    this.sounding = false;
  }

  /** Final release; sources stop once the tail has faded. */
  end(t: number): void {
    if (this.ended) return;
    this.release(t);
    this.ended = true;
    this.stopSources(t + this.spec.release * 2 + 0.1);
  }

  /** Immediate fade from now (music stop, freeze, theme switch). */
  cut(t: number): void {
    const amp = this.amp.gain;
    amp.cancelScheduledValues(t);
    amp.setTargetAtTime(SILENT, t, 0.03);
    this.sounding = false;
    this.ended = true;
    this.stopSources(t + 0.25);
  }

  private stopSources(when: number): void {
    stopSafely(this.osc, when);
    stopSafely(this.lfo, when);
    if (this.breathSource) stopSafely(this.breathSource, when);
  }

  private disconnect(): void {
    this.osc.disconnect();
    this.lfo.disconnect();
    this.vibrato.disconnect();
    this.breathSource?.disconnect();
    for (const node of this.nodes) node.disconnect();
    this.amp.disconnect();
  }
}
