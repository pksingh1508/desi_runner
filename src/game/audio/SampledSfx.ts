import { AUDIO_CLIP_LIMITS, SFX_SAMPLES, type SfxSampleDefinition, type SfxSampleEvent } from "../config/audioSamples";
import type { AudioGraph } from "./AudioGraph";
import type { AudioClipLibrary } from "./AudioClipLibrary";

interface SampleVoice {
  event: SfxSampleEvent;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Decoded, low-latency MP3 effects routed through the existing SFX bus. */
export class SampledSfx {
  private readonly buffers = new Map<SfxSampleEvent, AudioBuffer>();
  private readonly lastPlayed = new Map<SfxSampleEvent, number>();
  private readonly active = new Set<SampleVoice>();
  private enabled = true;
  private disposed = false;

  constructor(private readonly g: AudioGraph, library: AudioClipLibrary) {
    for (const event of Object.keys(SFX_SAMPLES) as SfxSampleEvent[]) {
      void library.load(g.ctx, SFX_SAMPLES[event].url).then((buffer) => {
        if (buffer && !this.disposed) this.buffers.set(event, buffer);
      });
    }
  }

  /** False only if the asset isn't ready: the caller can use its synth cue. */
  play(event: SfxSampleEvent): boolean {
    if (this.disposed || !this.enabled) return true;
    const buffer = this.buffers.get(event);
    if (!buffer) return false;
    const def: SfxSampleDefinition = SFX_SAMPLES[event];
    const ctx = this.g.ctx;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(event) ?? -Infinity) < def.minGap) return true;
    if (this.active.size >= AUDIO_CLIP_LIMITS.maxVoices) return true;
    let voices = 0;
    for (const voice of this.active) if (voice.event === event) voices++;
    if (voices >= def.voices) return true;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = def.rate;
    const seconds = Math.min(buffer.duration, def.seconds ?? buffer.duration);
    const duration = seconds / def.rate;
    const gain = ctx.createGain();
    const attack = Math.min(AUDIO_CLIP_LIMITS.attackSeconds, duration / 4);
    const release = Math.min(AUDIO_CLIP_LIMITS.releaseSeconds, duration / 4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(def.gain, now + attack);
    gain.gain.setValueAtTime(def.gain, now + duration - release);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(gain);
    gain.connect(this.g.sfxBus);
    const voice: SampleVoice = { event, source, gain };
    source.onended = () => this.release(voice);
    this.active.add(voice);
    this.lastPlayed.set(event, now);
    source.start(now, 0, seconds);
    return true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopAll();
  }

  stopAll(): void {
    for (const voice of this.active) {
      voice.source.onended = null;
      voice.source.stop();
      this.release(voice);
    }
    this.lastPlayed.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
  }

  private release(voice: SampleVoice): void {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    this.active.delete(voice);
  }
}
