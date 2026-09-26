/**
 * Procedural desi soundtrack tuning (DesiMusic). One theme per biome index
 * (BIOMES order). Everything here is musical data — raag-flavoured scales,
 * tempo ranges, 16-step percussion lanes and layer mixes — so the synth
 * engine never hardcodes a groove. Nothing is transcribed from existing
 * songs: the lead improvises new phrases from the scale grammar at runtime.
 */

/** Swaras as semitone offsets from Sa (lower-case = komal / flat). */
export const SWARA = { S: 0, r: 1, R: 2, g: 3, G: 4, M: 5, m: 6, P: 7, d: 8, D: 9, n: 10, N: 11 } as const;
export type SwaraName = keyof typeof SWARA;

/** "S R G P D" → [0, 2, 4, 7, 9]. Parsed once at module load. */
function swaras(spec: string): number[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => SWARA[name as SwaraName]);
}

export type DrumVoice =
  | "dholBass"
  | "dholTreble"
  | "tasha"
  | "chimta"
  | "dholakBass"
  | "dholakSlap"
  | "khartal"
  | "khartalRoll"
  | "tablaDha"
  | "tablaDhin"
  | "tablaNa"
  | "tablaTin"
  | "tablaTi"
  | "tablaRa"
  | "tablaGe"
  | "tablaKa";

export interface DrumLane {
  voice: DrumVoice;
  /** 16 steps (spaces ignored): X accent, x normal, o ghost, . rest. */
  pattern: string;
  /** Lane joins once speed-driven energy (0..1) reaches this. */
  minEnergy?: number;
}

export type LeadTimbre = "shehnai" | "brightShehnai" | "murli" | "bansuri";

/** Which percussion family plays fills / downbeat accents. */
export type PercussionKit = "dhol" | "dholak" | "tabla";

export interface MusicTheme {
  id: string;
  name: string;
  /** Raag the lead grammar is flavoured by (display / debugging). */
  raag: string;
  /** Middle-octave Sa of the lead in Hz; drone and tabla tune to it. */
  tonicHz: number;
  /** Ascending (aroha) / descending (avaroha) swaras, semitones from Sa. */
  aroha: readonly number[];
  avaroha: readonly number[];
  /** Swaras phrases come to rest on (Sa / Pa / vadi). */
  resting: readonly number[];
  /** Lead range, semitones relative to Sa. */
  range: readonly [number, number];
  bpm: number;
  /** BPM added at full speed (speedRatio 1). */
  bpmRange: number;
  /** Odd 16ths are delayed by this fraction of a step (bhangra shuffle). */
  swing: number;
  kit: PercussionKit;
  lanes: readonly DrumLane[];
  lead: LeadTimbre;
  /** Lead loudness multiplier. */
  leadLevel: number;
  /** Chance a phrase starts at an eligible bar position (energy adds more). */
  leadDensity: number;
  droneLevel: number;
  /** Reverb send for lead / drone / bells. */
  reverb: number;
  layers: {
    /** Rajasthani one-string pluck with squeeze bends. */
    ektara: boolean;
    /** Festive temple bells. */
    bells: boolean;
    /** Distant firecracker crackles and booms. */
    crackers: boolean;
    /** Soft monsoon rain bed with drips and far thunder. */
    rain: boolean;
  };
}

export const MUSIC_THEMES: readonly MusicTheme[] = [
  {
    // Festive bazaar: bhangra-ish dhol chaal + wedding shehnai.
    id: "chandniChowk",
    name: "CHANDNI CHOWK",
    raag: "Khamaj",
    tonicHz: 293.66, // D4
    aroha: swaras("S G M P D N"),
    avaroha: swaras("S R G M P D n"),
    resting: swaras("S P G"),
    range: [-5, 16],
    bpm: 104,
    bpmRange: 34,
    swing: 0.2,
    kit: "dhol",
    lanes: [
      { voice: "dholBass", pattern: "X... x... X..o x..." },
      { voice: "dholTreble", pattern: "..ox ..ox ..ox .oox" },
      { voice: "chimta", pattern: "..x. ..x. ..x. ..x.", minEnergy: 0.15 },
      { voice: "dholTreble", pattern: ".o.. .o.. .o.. ....", minEnergy: 0.3 },
      { voice: "dholBass", pattern: ".... ..o. .... ..x.", minEnergy: 0.45 },
      { voice: "tablaTi", pattern: "...o ...o ...o ....", minEnergy: 0.6 },
    ],
    lead: "shehnai",
    leadLevel: 1,
    leadDensity: 0.65,
    droneLevel: 0.9,
    reverb: 0.22,
    layers: { ektara: false, bells: false, crackers: false, rain: false },
  },
  {
    // Rajasthani folk: dholak, khartal clicks, ektara squeeze, murli lead.
    id: "pinkCity",
    name: "PINK CITY",
    raag: "Maand",
    tonicHz: 277.18, // C#4
    aroha: swaras("S G M P D N"),
    avaroha: swaras("S R G M P D N"),
    resting: swaras("S P G"),
    range: [-5, 16],
    bpm: 96,
    bpmRange: 30,
    swing: 0.12,
    kit: "dholak",
    lanes: [
      { voice: "dholakBass", pattern: "X..o ..x. X..o ..x." },
      { voice: "dholakSlap", pattern: "..x. o..x ..x. o.ox" },
      { voice: "khartalRoll", pattern: "..X. .... ..X. ...." },
      { voice: "khartal", pattern: ".... ..xo .... ..xo" },
      { voice: "dholakSlap", pattern: ".o.o .... .o.o ....", minEnergy: 0.4 },
      { voice: "khartalRoll", pattern: ".... .... .... X...", minEnergy: 0.55 },
    ],
    lead: "murli",
    leadLevel: 0.95,
    leadDensity: 0.55,
    droneLevel: 1,
    reverb: 0.2,
    layers: { ektara: true, bells: false, crackers: false, rain: false },
  },
  {
    // Rain raag: tabla keherwa + breathy bansuri over a soft rain bed.
    id: "mumbaiMonsoon",
    name: "MUMBAI MONSOON",
    raag: "Megh",
    tonicHz: 261.63, // C4
    aroha: swaras("S R M P n"),
    avaroha: swaras("S R M P n"),
    resting: swaras("S P M"),
    range: [-5, 17],
    bpm: 90,
    bpmRange: 30,
    swing: 0.08,
    kit: "tabla",
    lanes: [
      // Keherwa theka: dha ge na ti | na ka dhi na
      { voice: "tablaDha", pattern: "X... .... .... ...." },
      { voice: "tablaGe", pattern: "..x. .... .... ...." },
      { voice: "tablaNa", pattern: ".... x... x... ..x." },
      { voice: "tablaTi", pattern: ".... ..x. .... ...." },
      { voice: "tablaKa", pattern: ".... .... ..x. ...." },
      { voice: "tablaDhin", pattern: ".... .... .... x..." },
      { voice: "tablaGe", pattern: ".... .... ..o. ..o.", minEnergy: 0.3 },
      { voice: "tablaRa", pattern: ".o.o .o.o .o.o .o.o", minEnergy: 0.55 },
    ],
    lead: "bansuri",
    leadLevel: 1,
    leadDensity: 0.6,
    droneLevel: 0.85,
    reverb: 0.34,
    layers: { ektara: false, bells: false, crackers: false, rain: true },
  },
  {
    // Festival night: dhol-tasha, temple bells, bright shehnai, far crackers.
    id: "diwaliNight",
    name: "DIWALI NIGHT",
    raag: "Bhupali",
    tonicHz: 329.63, // E4
    aroha: swaras("S R G P D"),
    avaroha: swaras("S R G P D"),
    resting: swaras("S G P"),
    range: [-5, 16],
    bpm: 112,
    bpmRange: 32,
    swing: 0.14,
    kit: "dhol",
    lanes: [
      { voice: "dholBass", pattern: "X..o X... X..o X.x." },
      { voice: "tasha", pattern: "..x. ..x. ..x. .xxx" },
      { voice: "dholTreble", pattern: "...x ...x ...x ...." },
      { voice: "chimta", pattern: "x... x... x... x...", minEnergy: 0.25 },
      { voice: "tasha", pattern: ".o.o .o.o .o.o ....", minEnergy: 0.4 },
    ],
    lead: "brightShehnai",
    leadLevel: 0.9,
    leadDensity: 0.7,
    droneLevel: 0.8,
    reverb: 0.28,
    layers: { ektara: false, bells: true, crackers: true, rain: false },
  },
];

export const MUSIC_MIX = {
  /** Music bus gain when music is enabled (voice lines duck beneath it). */
  busGain: 0.27,
  /** Seconds of notes scheduled ahead of the audio clock. */
  lookahead: 0.16,
  /** Falling further behind than this (tab switch / stall) skips the missed steps. */
  resyncSeconds: 0.15,
  /** Gate time constants (seconds) for start / stop / frozen game loop. */
  startFade: 0.03,
  stopFade: 0.14,
  freezeFade: 0.06,
  /** Channel levels (pre music bus). */
  drums: 0.8,
  perc: 0.9,
  lead: 0.5,
  drone: 0.42,
  sparkle: 0.55,
  bed: 0.5,
  /** Monsoon rain bed level (before the bed channel). */
  rainLevel: 0.09,
  /** Every Nth bar at high energy ends with a percussion fill. */
  fillEveryBars: 8,
  fillMinEnergy: 0.55,
  /** Lead silence after a phrase, in 16th steps (min, extra random). */
  restSteps: 6,
  restStepsRandom: 10,
  /** Random timing spread on drum hits (seconds) — keeps the groove human. */
  humanize: 0.005,
  /** Firecracker / rain event odds per bar (Diwali / Monsoon layers). */
  crackleChance: 0.22,
  boomChance: 0.07,
  dripChance: 0.07,
  thunderChance: 0.025,
} as const;

/** Lane symbol → velocity. */
export const PATTERN_VELOCITY: Readonly<Record<string, number>> = { X: 1, x: 0.68, o: 0.36 };
