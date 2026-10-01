import type { MemeEvent } from "@/types/game";

/**
 * Desi meme reactions (MemeVoice) — short, viral, and tied to what the
 * runner is doing: FAAAH on slides and last-second dodges, the paragliding
 * guy on the Diwali rocket, "Jaldi wahan se hato!" before drones / traffic,
 * "Moye moye" on a crash. Every built-in line is a license-free recreation:
 * catchphrases are spoken by the player's own device through the Web Speech
 * API, and the "FAAAH!" shout is synthesized live with formant synthesis.
 * Local licensed MP3 reactions take precedence for the events in
 * public/sounds/memes/manifest.json (see its README and ASSETS.md).
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
  /** Comic speech-bubble caption — one word or one short meme line. */
  caption: string;
  /** Small gloss under the caption (for players who don't speak Hindi). */
  sub?: string;
  delivery: MemeDelivery;
  /** Spoken parts in order (empty for synthesized deliveries). */
  parts: readonly MemeSpeechPart[];
  /**
   * Optional instant hit in front of the line. Omitted where the moment
   * already has its own loud SFX (rocket ignition, warnings) or the voice
   * is instant anyway (the synthesized FAAAH).
   */
  stinger?: MemeStinger;
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

/** The viral "FAAAH!" — slides and last-second dodges share one cooldown. */
const FAAAH_GROUP = "faaah";
const FAAAH_COOLDOWN = 3.5;

export const MEME_LINES: Record<MemeEvent, MemeLineDef> = {
  start: {
    caption: "BHAAG MILKHA BHAAG! 🏃",
    sub: "run, run, run!",
    delivery: "tts",
    parts: [say("भाग, मिल्खा, भाग!", "Bhaag, Milkha, bhaag!", 1.08, 1.05)],
    stinger: "shehnai",
    cooldown: 0,
    chance: 0.75,
    priority: MEME_PRIORITY.normal,
  },
  slide: {
    caption: "FAAAH! 😱",
    delivery: "faaah",
    parts: [],
    cooldown: FAAAH_COOLDOWN,
    chance: 1,
    priority: MEME_PRIORITY.normal,
    group: FAAAH_GROUP,
  },
  nearMiss: {
    caption: "FAAAH! 😱",
    sub: "baal-baal bache!",
    delivery: "faaah",
    parts: [],
    cooldown: FAAAH_COOLDOWN,
    chance: 1,
    priority: MEME_PRIORITY.normal,
    group: FAAAH_GROUP,
  },
  rocket: {
    // The 2019 "Indian paragliding guy", mid-air over Manali.
    caption: "AASMAAN KI UNCHAIYON MEIN! 🪂",
    sub: "…and here I am, high in the sky",
    delivery: "tts",
    parts: [say("और ये मैं, आसमान की ऊँचाइयों में!", "Aur ye main, aasmaan ki oonchaiyon mein!", 0.98, 1.12)],
    cooldown: 2,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  rocketLand: {
    // …and the same flight's most famous plea, as the rocket comes down.
    caption: "LAND KARA DE! 🙏",
    sub: "bhai, please land me",
    delivery: "tts",
    parts: [say("लैंड करा दे! लैंड करा दे!", "Land kara de! Land kara de!", 1.25, 1.38)],
    cooldown: 2,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  danger: {
    // Local-cricket commentary gone viral: get out of the way, fast.
    caption: "JALDI WAHAN SE HATO! ⚠️",
    sub: "move, move, move!",
    delivery: "tts",
    parts: [say("जल्दी वहाँ से हटो!", "Jaldi wahaan se hato!", 1.18, 1.2)],
    cooldown: 15,
    chance: 1,
    // A real warning: it may cut off a FAAAH rather than be dropped.
    priority: MEME_PRIORITY.high,
  },
  speedBoost: {
    caption: "DHOOM! 🔥",
    sub: "full speed",
    delivery: "tts",
    parts: [say("धूम!", "Dhoom!", 0.9, 0.85)],
    stinger: "dhol",
    cooldown: 12,
    chance: 1,
    priority: MEME_PRIORITY.normal,
  },
  crash: {
    caption: "MOYE MOYE 😢",
    delivery: "tts",
    parts: [say("मोये मोये", "Mo-ye mo-ye", 0.82, 0.72)],
    stinger: "drama",
    cooldown: 1.5,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  revive: {
    caption: "TIGER ABHI ZINDA HAI! 🐯",
    sub: "back on your feet",
    delivery: "tts",
    parts: [say("टाइगर अभी ज़िंदा है!", "Tiger abhee zinda hai!", 1.02, 0.95)],
    stinger: "shehnai",
    cooldown: 3,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  newRecord: {
    caption: "JUST LOOKING LIKE A WOW! 🤩",
    sub: "new record",
    delivery: "tts",
    parts: [say("जस्ट लुकिंग लाइक अ वॉव!", "Just looking like a wow!", 1.0, 1.3)],
    stinger: "dhol",
    cooldown: 3,
    chance: 1,
    priority: MEME_PRIORITY.high,
  },
  coinStorm: {
    caption: "PAISA HI PAISA! 💰",
    sub: "money, money everywhere",
    delivery: "tts",
    parts: [say("पैसा ही पैसा होगा!", "Paisa hee paisa hoga!", 1.12, 1.25)],
    stinger: "ting",
    cooldown: 20,
    chance: 1,
    priority: MEME_PRIORITY.normal,
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

/** Local clips and optional user replacements (see their README). */
export const MEME_CLIPS = {
  manifestUrl: "/sounds/memes/manifest.json",
  baseUrl: "/sounds/memes/",
  maxClipsPerEvent: 4,
  defaultGain: 0.8,
  maxCaptionLength: 80,
  maxSubLength: 100,
  /** Plain file names with an audio extension — no folders, no URLs. */
  fileNamePattern: /^[\w\- ().]+\.(mp3|ogg|oga|wav|m4a|aac|webm|opus|flac)$/i,
} as const;
