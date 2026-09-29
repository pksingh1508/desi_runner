import type { MemeEvent } from "@/types/game";
import { MEME_LINES, MEME_PRIORITY, MEME_TIMING, type MemeLineDef } from "@/game/config/memes";
import type { AudioGraph } from "./AudioGraph";
import type { DesiSfx } from "./DesiSfx";
import { FAAAH_PRESET, speakFormants } from "./FormantVoice";
import type { MemeClips } from "./MemeClips";
import type { SpeechVoice } from "./SpeechVoice";
import { SILENT, randomBetween, stopSafely } from "./synth";

type LineKind = "silent" | "speech" | "clip" | "synth";

interface ActiveLine {
  token: number;
  priority: number;
  kind: LineKind;
  stop: ((fade: number) => void) | null;
}

/** Wall clock in seconds (keeps running while the AudioContext is suspended). */
function clock(): number {
  return performance.now() / 1000;
}

function estimateSeconds(def: MemeLineDef): number {
  if (def.delivery === "faaah") return FAAAH_PRESET.duration;
  let seconds = MEME_TIMING.speechLatency;
  for (const part of def.parts) {
    seconds += part.pauseBefore + (part.roman.length * MEME_TIMING.secondsPerChar) / Math.max(0.5, part.rate);
  }
  return seconds;
}

/**
 * Decides when a desi meme line plays and how it is voiced.
 *
 * - One line at a time. Per-event (or per-group) cooldowns and chances, a
 *   global gap between lines, and a short silence after each line keep it
 *   funny rather than spammy.
 * - High-priority lines (rocket, danger warnings, crash, revive, record)
 *   interrupt lower ones; a high line arriving during another high line
 *   queues right behind it ("Aasmaan ki unchaiyon mein!" … "Land kara de!").
 * - Delivery: user clip → synthesized FAAAH → device TTS → caption only.
 *   Every line shows a caption, ducks the music and (optionally) fires an
 *   instant stinger to cover the speech engine's start latency.
 */
export class MemeVoice {
  onCaption: ((caption: string, sub?: string) => void) | null = null;

  private enabled = true;
  private muted = false;
  private readonly cooldowns = new Map<string, number>();
  private active: ActiveLine | null = null;
  private queued: { event: MemeEvent; expires: number } | null = null;
  private lastStart = -Infinity;
  private lastEnd = -Infinity;
  private token = 0;
  private ducked = false;
  private readonly timers = new Set<number>();

  constructor(
    private readonly g: AudioGraph,
    private readonly sfx: DesiSfx,
    private readonly speech: SpeechVoice,
    private readonly clips: MemeClips,
    private readonly duck: (on: boolean) => void
  ) {}

  /** Returns true when the line was accepted (playing now or queued next). */
  play(event: MemeEvent): boolean {
    const def = MEME_LINES[event];
    if (!def || !this.enabled) return false;
    const now = clock();
    const group = def.group ?? event;
    if ((this.cooldowns.get(group) ?? -Infinity) > now) return false;

    const active = this.active;
    if (active) {
      if (def.priority > active.priority) {
        if (!this.claim(def, group, now)) return false;
        this.halt(true);
        this.begin(event, def);
        return true;
      }
      // One slot: a queued line is a promise, so never overwrite it.
      if (def.priority === MEME_PRIORITY.high && !this.queued) {
        if (!this.claim(def, group, now)) return false;
        this.queued = { event, expires: now + MEME_TIMING.queueMaxWait };
        return true;
      }
      return false;
    }

    if (
      def.priority < MEME_PRIORITY.high &&
      (now - this.lastStart < MEME_TIMING.globalGap || now - this.lastEnd < MEME_TIMING.minSilence)
    ) {
      return false;
    }
    if (!this.claim(def, group, now)) return false;
    this.begin(event, def);
    return true;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.queued = null;
      this.halt(false);
    }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    // Device TTS bypasses the Web Audio master gain — stop it explicitly.
    if (muted && this.active?.kind === "speech") this.halt(false);
  }

  dispose(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    this.queued = null;
    this.halt(false);
  }

  // ---------------------------------------------------------------- intern

  /** Rolls the chance and starts the cooldown. */
  private claim(def: MemeLineDef, group: string, now: number): boolean {
    if (Math.random() > def.chance) return false;
    this.cooldowns.set(group, now + def.cooldown);
    return true;
  }

  private begin(event: MemeEvent, def: MemeLineDef): void {
    const line: ActiveLine = { token: ++this.token, priority: def.priority, kind: "silent", stop: null };
    this.active = line;
    this.lastStart = clock();
    this.onCaption?.(def.caption, def.sub);
    if (def.stinger) this.sfx.stinger(def.stinger);

    if (!this.muted) {
      const clip = this.clips.pick(event);
      if (clip) {
        this.playClip(line, clip);
        return;
      }
      if (def.delivery === "faaah") {
        this.playFaaah(line);
        return;
      }
      if (def.parts.length > 0 && this.playSpeech(line, def)) return;
    }
    // Muted, or no speech engine: the caption still gets its moment.
    this.after(line.token, Math.max(MEME_TIMING.silentHoldSeconds, estimateSeconds(def)));
  }

  private playSpeech(line: ActiveLine, def: MemeLineDef): boolean {
    if (!this.speech.available) return false;
    const token = line.token;
    const started = this.speech.speak(def.parts, () => this.finish(token));
    if (!started) return false;
    line.kind = "speech";
    line.stop = () => this.speech.cancel();
    this.setDucked(true);
    this.after(token, Math.min(estimateSeconds(def) + MEME_TIMING.safetyPadding, MEME_TIMING.maxLineSeconds));
    return true;
  }

  private playFaaah(line: ActiveLine): void {
    const token = line.token;
    const voice = speakFormants(
      this.g,
      this.g.voiceBus,
      FAAAH_PRESET,
      1 + randomBetween(-MEME_TIMING.faaahPitchSpread, MEME_TIMING.faaahPitchSpread),
      1 + randomBetween(-MEME_TIMING.faaahTimeSpread, MEME_TIMING.faaahTimeSpread),
      0,
      this.g.voiceEcho
    );
    voice.onEnded = () => this.finish(token);
    line.kind = "synth";
    line.stop = (fade) => voice.stop(fade);
    this.setDucked(true);
    this.after(token, voice.duration + 1);
  }

  private playClip(line: ActiveLine, buffer: AudioBuffer): void {
    const ctx = this.g.ctx;
    const t = ctx.currentTime;
    const token = line.token;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENT, t);
    gain.gain.exponentialRampToValueAtTime(1, t + 0.012);
    const duration = buffer.duration;
    if (duration > 0.06) {
      gain.gain.setValueAtTime(1, t + duration - 0.025);
      gain.gain.exponentialRampToValueAtTime(SILENT, t + duration);
    }
    source.connect(gain);
    gain.connect(this.g.voiceBus);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.finish(token);
    };
    source.start(t);
    line.kind = "clip";
    line.stop = (fade) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, Math.max(fade, 0.01) / 3);
      stopSafely(source, now + fade + 0.02);
    };
    this.setDucked(true);
    this.after(token, duration + 1);
  }

  /** Ends the line with `token` (natural end or safety timeout). */
  private finish(token: number): void {
    const line = this.active;
    if (!line || line.token !== token) return;
    this.active = null;
    const now = clock();
    this.lastEnd = now;
    const queued = this.queued;
    this.queued = null;
    if (queued && queued.expires >= now && this.enabled) {
      // Stay ducked through the short breath before the queued line.
      this.later(MEME_TIMING.queueGap, () => {
        if (this.active || !this.enabled) {
          if (!this.active) this.setDucked(false);
          return;
        }
        this.begin(queued.event, MEME_LINES[queued.event]);
      });
      return;
    }
    this.setDucked(false);
  }

  /** Stops the current line immediately. */
  private halt(keepDucked: boolean): void {
    const line = this.active;
    if (!line) {
      if (!keepDucked) this.setDucked(false);
      return;
    }
    this.active = null;
    this.lastEnd = clock();
    line.stop?.(0.08);
    if (!keepDucked) this.setDucked(false);
  }

  /** Safety net: force-finish a line that never reported its end. */
  private after(token: number, seconds: number): void {
    this.later(seconds, () => {
      const line = this.active;
      if (!line || line.token !== token) return;
      if (line.kind === "speech") this.speech.cancel();
      this.finish(token);
    });
  }

  private later(seconds: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, Math.max(0, seconds * 1000));
    this.timers.add(id);
  }

  private setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.duck(on);
  }
}
