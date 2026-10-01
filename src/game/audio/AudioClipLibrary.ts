import { AUDIO_CLIP_LIMITS } from "../config/audioSamples";

/** One fetch/decode per local URL, shared by effects and meme reactions. */
export class AudioClipLibrary {
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  private readonly aborter = new AbortController();
  private disposed = false;

  load(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
    if (this.disposed) return Promise.resolve(null);
    const existing = this.pending.get(url);
    if (existing) return existing;
    const task = this.fetchClip(ctx, url);
    this.pending.set(url, task);
    return task;
  }

  dispose(): void {
    this.disposed = true;
    this.aborter.abort();
    this.pending.clear();
  }

  private async fetchClip(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url, { signal: this.aborter.signal });
      if (!response.ok || this.disposed) return null;
      const bytes = await response.arrayBuffer();
      if (this.disposed || bytes.byteLength === 0 || bytes.byteLength > AUDIO_CLIP_LIMITS.maxBytes) return null;
      const buffer = await ctx.decodeAudioData(bytes);
      // decodeAudioData cannot be aborted: guard its completion after teardown.
      if (this.disposed || buffer.duration <= 0 || buffer.duration > AUDIO_CLIP_LIMITS.maxSeconds) return null;
      return buffer;
    } catch {
      // A missing/undecodable MP3 falls back to the existing synth cue.
      return null;
    }
  }
}
