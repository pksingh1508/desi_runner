import type { MemeEvent } from "@/types/game";

/**
 * Desi meme voice lines (MemeVoice). Every built-in line is a license-free
 * recreation: short catchphrases spoken by the player's own device through
 * the Web Speech API, or — for the "FAAAH!" crash shout — synthesized live
 * with formant synthesis. No audio clips ship with the game; players may add
 * clips they own via public/sounds/memes/manifest.json (see its README).
 */

/** Instant synthesized hit fired with every line (TTS has start latency). */
export type MemeStinger = "dhol" | "tirakita" | "shehnai" | "ting" | "boing" | "drama";

/** How a line is voiced when no user clip exists for the event. */
export type MemeDelivery = "tts" | "faaah";

export const MEME_PRIORITY = { low: 0, normal: 1, high: 2 } as const;
export type MemePriority = (typeof MEME_PRIORITY)[keyof typeof MEME_PRIORITY];

export interface MemeSpeechPart {
  /** Devanagari text, used with Hindi (hi-IN) voices. */
  hi: string;
  /** Romanized text spelled for English / Indian-English voices. */
  roman: string;
  /** SpeechSynthesis rate (1 = normal). */
  rate: number;
  /** SpeechSynthesis pitch (0..2, 1 = normal). */
  pitch: number;
  /** Cached voice that speaks the part — "alt" is the call-and-response partner. */
  voice: "main" | "alt";
  /** Silence before this part, seconds. */
  pauseBefore: number;
}

export interface MemeLineDef {
  /** Comic speech-bubble caption. */
  caption: string;
  /** Small gloss under the caption (for players who don't speak Hindi). */
  sub?: string;
  delivery: MemeDelivery;
  /** Spoken parts in order (empty for synthesized deliveries). */
  parts: readonly MemeSpeechPart[];
  stinger: MemeStinger;
  /** Seconds before this event (or its group) may speak again. */
  cooldown: number;
  /** Probability (0..1) that an eligible moment actually speaks. */
  chance: number;
  priority: MemePriority;
  /** Events in one group share a cooldown (same catchphrase). */
  group?: string;
}

function say(
  hi: string,
  roman: string,
  rate: number,
  pitch: number,
  voice: MemeSpeechPart["voice"] = "main",
  pauseBefore = 0
): MemeSpeechPart {
  return { hi, roman, rate, pitch, voice, pauseBefore };
}

const PAISA = say("पैसा ही पैसा होगा!", "Paisa hee paisa hoga!", 1.12, 1.25);

export const MEME_LINES: Record<MemeEvent, MemeLineDef> = {
  crash: {
    caption: "FAAAH! 😱",
    delivery: "faaah",
    parts: [],
    stinger: "drama",
    cooldown: 1.5,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  revive: {
    caption: "PICTURE ABHI BAAKI HAI, MERE DOST!",
    sub: "the film isn't over yet, my friend",
    delivery: "tts",
    parts: [say("पिक्चर अभी बाकी है, मेरे दोस्त!", "Picture abhee baaki hai, mere dost!", 1.0, 0.9)],
    stinger: "shehnai",
    cooldown: 3,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  newRecord: {
    caption: "MOGAMBO KHUSH HUA!",
    sub: "new record — the villain approves",
    delivery: "tts",
    parts: [say("मोगैम्बो खुश हुआ!", "Mogambo khush hua!", 0.82, 0.5)],
    stinger: "dhol",
    cooldown: 3,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  overdrive: {
    caption: "HOW'S THE JOSH?",
    sub: "HIGH SIR! 🫡",
    delivery: "tts",
    parts: [
      say("हाउज़ द जोश?", "How's the josh?", 0.92, 0.62, "main"),
      say("हाई सर!", "High, sir!", 1.22, 1.55, "alt", 0.12),
    ],
    stinger: "dhol",
    cooldown: 30,
    chance: 1,
    priority: MEME_PRIORITY.normal,
  },
  rocket: {
    caption: "UDD GAYA! BHAI UDD GAYA!",
    sub: "bro took off!",
    delivery: "tts",
    parts: [say("उड़ गया! भाई उड़ गया!", "Udd gaya! Bhai, udd gaya!", 1.2, 1.35)],
    stinger: "boing",
    cooldown: 12,
    chance: 0.9,
    priority: MEME_PRIORITY.normal,
  },
  nearMiss: {
    caption: "ARRE BHAI BHAI BHAI!",
    sub: "that was close!",
    delivery: "tts",
    parts: [say("अरे भाई भाई भाई!", "Arrey bhai, bhai, bhai!", 1.25, 1.2)],
    stinger: "tirakita",
    cooldown: 11,
    chance: 0.5,
    priority: MEME_PRIORITY.normal,
  },
  coinStreak: {
    caption: "PAISA HI PAISA HOGA!",
    sub: "money, money everywhere 💰",
    delivery: "tts",
    parts: [PAISA],
    stinger: "ting",
    cooldown: 20,
    chance: 0.7,
    priority: MEME_PRIORITY.normal,
    group: "paisa",
  },
  coinStorm: {
    caption: "PAISA HI PAISA HOGA!",
    sub: "money, money everywhere 💰",
    delivery: "tts",
    parts: [PAISA],
    stinger: "ting",
    cooldown: 20,
    chance: 1,
    priority: MEME_PRIORITY.normal,
    group: "paisa",
  },
  combo: {
    caption: "BAHUT HARD!",
    sub: "too good, bro",
    delivery: "tts",
    parts: [say("बहुत हार्ड!", "Bahut hard!", 1.05, 1.1)],
    stinger: "tirakita",
    cooldown: 15,
    chance: 0.6,
    priority: MEME_PRIORITY.normal,
  },
  start: {
    caption: "CHALO, BHAAGO!",
    sub: "let's run!",
    delivery: "tts",
    parts: [say("चलो, भागो!", "Chalo, bhaago!", 1.15, 1.1)],
    stinger: "shehnai",
    cooldown: 0,
    chance: 0.6,
    priority: MEME_PRIORITY.normal,
  },
  powerup: {
    caption: "JUGAAD!",
    sub: "desi hack unlocked",
    delivery: "tts",
    parts: [say("जुगाड़!", "Joo-gaad!", 0.9, 1.2)],
    stinger: "ting",
    cooldown: 25,
    chance: 0.25,
    priority: MEME_PRIORITY.low,
  },
};

/** Every MemeEvent, derived from the table so the two can never drift. */
export const MEME_EVENTS = Object.keys(MEME_LINES) as MemeEvent[];

export const MEME_TIMING = {
  /** Minimum seconds between the starts of two non-high lines. */
  globalGap: 2.5,
  /** Minimum silence after a line before a non-high line may start. */
  minSilence: 0.6,
  /** A high line arriving during another high line waits at most this long. */
  queueMaxWait: 4,
  /** Breath between a finished high line and the queued one. */
  queueGap: 0.25,
  /** Fallback caption hold when nothing is audible (muted / no TTS). */
  silentHoldSeconds: 1.4,
  /** Estimated TTS speed (seconds per character at rate 1) + start latency. */
  secondsPerChar: 0.075,
  speechLatency: 0.4,
  /** Extra seconds past the estimate before a stuck line is force-finished. */
  safetyPadding: 2.5,
  /** Hard cap for any single line. */
  maxLineSeconds: 8,
  /** Music level while a line plays, and its duck/restore time constants. */
  duckGain: 0.35,
  duckAttack: 0.05,
  duckRelease: 0.3,
  /** Random pitch / length spread for the synthesized FAAAH. */
  faaahPitchSpread: 0.07,
  faaahTimeSpread: 0.08,
} as const;

/** Optional user clips (see public/sounds/memes/README.md). */
export const MEME_CLIPS = {
  manifestUrl: "/sounds/memes/manifest.json",
  baseUrl: "/sounds/memes/",
  maxClipsPerEvent: 4,
  maxClipBytes: 3 * 1024 * 1024,
  /** Plain file names with an audio extension — no folders, no URLs. */
  fileNamePattern: /^[\w\- ().]+\.(mp3|ogg|oga|wav|m4a|aac|webm|opus|flac)$/i,
} as const;
