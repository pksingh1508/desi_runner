/** Local MP3s downloaded through Brave; provenance and licenses: ASSETS.md. */
export const AUDIO_CLIP_LIMITS = {
  maxBytes: 3 * 1024 * 1024,
  maxSeconds: 8,
  maxVoices: 12,
  attackSeconds: 0.004,
  releaseSeconds: 0.025,
} as const;

export interface SfxSampleDefinition {
  url: string;
  gain: number;
  rate: number;
  minGap: number;
  voices: number;
  /** Optional excerpt length in source seconds; the MP3 stays unmodified. */
  seconds?: number;
}

export const SFX_SAMPLES = {
  coin: { url: "/sounds/sfx/coin.mp3", gain: 0.3, rate: 1, minGap: 0.055, voices: 4 },
  jump: { url: "/sounds/memes/bounce.mp3", gain: 0.38, rate: 1.12, minGap: 0.12, voices: 2 },
  slide: { url: "/sounds/sfx/slide.mp3", gain: 0.48, rate: 1.2, minGap: 0.18, voices: 2, seconds: 0.5 },
  nearMiss: { url: "/sounds/sfx/whoosh.mp3", gain: 0.6, rate: 1, minGap: 0.12, voices: 2 },
  powerup: { url: "/sounds/sfx/reward.mp3", gain: 0.45, rate: 1.1, minGap: 0.18, voices: 2 },
  perfect: { url: "/sounds/sfx/reward.mp3", gain: 0.28, rate: 1.35, minGap: 0.16, voices: 2, seconds: 0.45 },
  levelUp: { url: "/sounds/memes/fanfare.mp3", gain: 0.5, rate: 1, minGap: 0.6, voices: 1 },
  missionComplete: { url: "/sounds/sfx/reward.mp3", gain: 0.42, rate: 1.2, minGap: 0.3, voices: 1 },
  unlock: { url: "/sounds/sfx/reward.mp3", gain: 0.4, rate: 0.95, minGap: 0.25, voices: 1 },
} satisfies Record<string, SfxSampleDefinition>;

export type SfxSampleEvent = keyof typeof SFX_SAMPLES;
