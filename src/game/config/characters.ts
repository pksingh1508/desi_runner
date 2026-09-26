/**
 * Cosmetic catalog.
 *
 * DESI squad: realistic 3D human runners built on the CC0 Quaternius
 * "Universal Base Characters" bodies, animated by the CC0 "Universal
 * Animation Library" clips. Outfits are data-driven (a bind-pose clothing
 * shader + bone-attached accessories), so every runner is a distinct look
 * without shipping extra textures. See ASSETS.md.
 *
 * CLASSIC squad: the legacy stylized rigs — VECTOR re-uses the CC0
 * RobotExpressive GLB, the rest are procedural rigs built in code.
 * Unlock levels are the single gating requirement; cosmetics stay
 * gameplay-neutral by design.
 */
export type CharacterArchetype =
  | "human"
  | "robot"
  | "robot_ember"
  | "robot_wraith"
  | "robot_aurora"
  | "boy"
  | "girl"
  | "alien_slim"
  | "alien_brute"
  | "ninja"
  | "pilot"
  | "pirate"
  | "astronaut"
  | "voltbot"
  | "jackal"
  | "pharaoh";
export type CharacterSpecies = "ROBOT" | "HUMAN" | "ALIEN";
export type CharacterGroup = "desi" | "classic";

export type HumanBody = "male" | "female";
export type HairStyle = "SimpleParted" | "Buzzed" | "Long" | "Buns" | "BuzzedFemale";
export type TopStyle = "tee" | "tank" | "kurta" | "jacket" | "shirt";
export type SleeveLength = "none" | "short" | "elbow" | "long";
export type BottomStyle = "full" | "capri" | "shorts";
export type Accessory =
  | "turban"
  | "beard"
  | "mustache"
  | "aviators"
  | "bindi"
  | "tilak"
  | "jhumka"
  | "bangles"
  | "dupatta"
  | "gamcha"
  | "sweatband"
  | "cap";

/** Data-driven outfit for a realistic human runner. Colors are CSS hex. */
export interface HumanOutfit {
  body: HumanBody;
  /** Multiplied over the albedo skin texture (warm desi browns). */
  skinTone: string;
  hair: HairStyle | null;
  hairColor: string;
  top: {
    style: TopStyle;
    sleeves: SleeveLength;
    color: string;
    /** Trim: collar / cuffs / hem band / stripes. */
    trim: string;
    /** Optional printed motif on the back ("stripes" | "number" | "chevron"). */
    motif?: "stripes" | "number" | "chevron" | "border";
  };
  bottom: {
    style: BottomStyle;
    color: string;
    /** Side stripe color (track pants), omit for plain. */
    stripe?: string;
  };
  shoes: { color: string; sole: string };
  accessories: Accessory[];
  /** Accessory palette (turban cloth, dupatta, gamcha, bindi …). */
  accessoryColor: string;
  accessoryColor2: string;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  unlockLevel: number;
  /** Suit / skin tint blended over base colors (0..1). */
  tintHex: string;
  /** Emissive accent color for glow panels / highlights. */
  accentHex: string;
  gradient: string;
  /** Visual archetype driving the 3D procedural rig vs GLB path. */
  archetype: CharacterArchetype;
  species: CharacterSpecies;
  icon: string;
  description: string;
  group: CharacterGroup;
  tagline: string;
  hindiName: string;
  /** Realistic human outfit (archetype "human" only). */
  outfit?: HumanOutfit;
}

/** Warm desi skin tones (multiplied over the base albedo, which is a tan). */
const DESI_SKIN = {
  wheat: "#b5835f",
  warm: "#a26d4b",
  dusky: "#8b5b3d",
  deep: "#6f4630",
} as const;

export const DESI_CHARACTERS: CharacterDefinition[] = [
  {
    id: "raju",
    name: "RAJU",
    hindiName: "राजू",
    unlockLevel: 1,
    tintHex: "#ff8a1f",
    accentHex: "#ff8a1f",
    gradient: "linear-gradient(135deg,#3b1a05,#ff8a1f)",
    archetype: "human",
    species: "HUMAN",
    icon: "🏃",
    description: "Saffron tee · track pants · never late",
    tagline: "Galli ka Bolt",
    group: "desi",
    outfit: {
      body: "male",
      skinTone: DESI_SKIN.warm,
      hair: "SimpleParted",
      hairColor: "#141010",
      top: { style: "tee", sleeves: "short", color: "#ff8a1f", trim: "#fff4e0", motif: "number" },
      bottom: { style: "full", color: "#1b2a5a", stripe: "#f5f5f0" },
      shoes: { color: "#f7f7f2", sole: "#ff8a1f" },
      accessories: ["sweatband"],
      accessoryColor: "#ffffff",
      accessoryColor2: "#ff8a1f",
    },
  },
  {
    id: "priya",
    name: "PRIYA",
    hindiName: "प्रिया",
    unlockLevel: 1,
    tintHex: "#e4007c",
    accentHex: "#ffc107",
    gradient: "linear-gradient(135deg,#3d0020,#e4007c)",
    archetype: "human",
    species: "HUMAN",
    icon: "💃",
    description: "Rani-pink kurta · flying dupatta",
    tagline: "Dupatta Dash",
    group: "desi",
    outfit: {
      body: "female",
      skinTone: DESI_SKIN.wheat,
      hair: "Long",
      hairColor: "#120c0a",
      top: { style: "kurta", sleeves: "elbow", color: "#e4007c", trim: "#ffc107", motif: "border" },
      bottom: { style: "full", color: "#f4ebdd" },
      shoes: { color: "#d4a017", sole: "#6b3e10" },
      accessories: ["dupatta", "bindi", "jhumka", "bangles"],
      accessoryColor: "#ffc107",
      accessoryColor2: "#d7263d",
    },
  },
  {
    id: "jassi",
    name: "JASSI",
    hindiName: "जस्सी",
    unlockLevel: 3,
    tintHex: "#0e9f6e",
    accentHex: "#ffb300",
    gradient: "linear-gradient(135deg,#032b1e,#0e9f6e)",
    archetype: "human",
    species: "HUMAN",
    icon: "🦁",
    description: "Kesari pagdi · green track jacket",
    tagline: "Balle Balle Sprinter",
    group: "desi",
    outfit: {
      body: "male",
      skinTone: DESI_SKIN.wheat,
      hair: null,
      hairColor: "#16100c",
      top: { style: "jacket", sleeves: "long", color: "#0e9f6e", trim: "#f5f5f0", motif: "stripes" },
      bottom: { style: "full", color: "#15171c", stripe: "#0e9f6e" },
      shoes: { color: "#f7f7f2", sole: "#15171c" },
      accessories: ["turban", "beard"],
      accessoryColor: "#ffb300",
      accessoryColor2: "#f57c00",
    },
  },
  {
    id: "meera",
    name: "MEERA",
    hindiName: "मीरा",
    unlockLevel: 4,
    tintHex: "#00b3a4",
    accentHex: "#ff7a1a",
    gradient: "linear-gradient(135deg,#00302c,#00b3a4)",
    archetype: "human",
    species: "HUMAN",
    icon: "⚡",
    description: "Teal sports top · metro-fast",
    tagline: "Metro Queen",
    group: "desi",
    outfit: {
      body: "female",
      skinTone: DESI_SKIN.dusky,
      hair: "Buns",
      hairColor: "#140d0b",
      top: { style: "tank", sleeves: "none", color: "#00b3a4", trim: "#ff7a1a", motif: "chevron" },
      bottom: { style: "full", color: "#23252f", stripe: "#00b3a4" },
      shoes: { color: "#ff7a1a", sole: "#f5f5f0" },
      accessories: ["bindi", "jhumka"],
      accessoryColor: "#ff7a1a",
      accessoryColor2: "#c2185b",
    },
  },
  {
    id: "inspector",
    name: "INSPECTOR",
    hindiName: "इंस्पेक्टर",
    unlockLevel: 6,
    tintHex: "#c3a36b",
    accentHex: "#c3a36b",
    gradient: "linear-gradient(135deg,#2a2010,#c3a36b)",
    archetype: "human",
    species: "HUMAN",
    icon: "👮",
    description: "Khaki uniform · aviators · mooch",
    tagline: "Khaki Wala Hero",
    group: "desi",
    outfit: {
      body: "male",
      skinTone: DESI_SKIN.dusky,
      hair: "Buzzed",
      hairColor: "#120e0c",
      top: { style: "shirt", sleeves: "short", color: "#c3a36b", trim: "#8a6d3b" },
      bottom: { style: "full", color: "#b39359" },
      shoes: { color: "#1a1410", sole: "#0d0a08" },
      accessories: ["mustache", "aviators"],
      accessoryColor: "#1b1b1b",
      accessoryColor2: "#d4af37",
    },
  },
  {
    id: "hero",
    name: "HERO",
    hindiName: "हीरो",
    unlockLevel: 8,
    tintHex: "#c1121f",
    accentHex: "#c1121f",
    gradient: "linear-gradient(135deg,#2b0306,#c1121f)",
    archetype: "human",
    species: "HUMAN",
    icon: "🎬",
    description: "Red jacket · blue jeans · filmy entry",
    tagline: "Filmy Hero No. 1",
    group: "desi",
    outfit: {
      body: "male",
      skinTone: DESI_SKIN.warm,
      hair: "SimpleParted",
      hairColor: "#0f0b0a",
      top: { style: "jacket", sleeves: "long", color: "#c1121f", trim: "#f2f2f2" },
      bottom: { style: "full", color: "#2f4b7c" },
      shoes: { color: "#f7f7f2", sole: "#c1121f" },
      accessories: ["aviators", "gamcha"],
      accessoryColor: "#f2f2f2",
      accessoryColor2: "#c1121f",
    },
  },
  {
    id: "babli",
    name: "BABLI",
    hindiName: "बबली",
    unlockLevel: 10,
    tintHex: "#7cb518",
    accentHex: "#d81b60",
    gradient: "linear-gradient(135deg,#1f2e04,#7cb518)",
    archetype: "human",
    species: "HUMAN",
    icon: "🌼",
    description: "Parrot-green kurta · patiala power",
    tagline: "Patiala Power",
    group: "desi",
    outfit: {
      body: "female",
      skinTone: DESI_SKIN.warm,
      hair: "Long",
      hairColor: "#150e0b",
      top: { style: "kurta", sleeves: "long", color: "#7cb518", trim: "#d81b60", motif: "border" },
      bottom: { style: "full", color: "#d81b60" },
      shoes: { color: "#d81b60", sole: "#3b0a1a" },
      accessories: ["dupatta", "bindi", "bangles"],
      accessoryColor: "#ff9800",
      accessoryColor2: "#d81b60",
    },
  },
  {
    id: "shera",
    name: "SHERA",
    hindiName: "शेरा",
    unlockLevel: 12,
    tintHex: "#b71c1c",
    accentHex: "#ffffff",
    gradient: "linear-gradient(135deg,#2a0505,#b71c1c)",
    archetype: "human",
    species: "HUMAN",
    icon: "💪",
    description: "Akhaada vest · red shorts · gamcha",
    tagline: "Akhaade ka Sher",
    group: "desi",
    outfit: {
      body: "male",
      skinTone: DESI_SKIN.deep,
      hair: "Buzzed",
      hairColor: "#100c0a",
      top: { style: "tank", sleeves: "none", color: "#f5f5f0", trim: "#b71c1c" },
      bottom: { style: "shorts", color: "#b71c1c", stripe: "#ffd54f" },
      shoes: { color: "#3e2723", sole: "#1b0f0c" },
      accessories: ["beard", "tilak", "gamcha"],
      accessoryColor: "#d32f2f",
      accessoryColor2: "#ffffff",
    },
  },
];

/** Legacy stylized rigs, kept as the CLASSIC squad. */
export const CLASSIC_CHARACTERS: CharacterDefinition[] = [
  {
    id: "vector",
    name: "VECTOR",
    unlockLevel: 1,
    tintHex: "#9fb86a",
    accentHex: "#d9de7a",
    gradient: "linear-gradient(135deg,#3d4d2c,#d9de7a)",
    archetype: "robot",
    species: "ROBOT",
    icon: "🤖",
    description: "Classic tactical unit",
    group: "classic",
    tagline: "Classic tactical unit",
    hindiName: "",
  },
  {
    id: "ryder",
    name: "RYDER",
    unlockLevel: 2,
    tintHex: "#4a9bd4",
    accentHex: "#ff8c42",
    gradient: "linear-gradient(135deg,#1a2f4a,#ff8c42)",
    archetype: "boy",
    species: "HUMAN",
    icon: "👦",
    description: "Street runner · Cap & sneakers",
    group: "classic",
    tagline: "Street runner",
    hindiName: "",
  },
  {
    id: "ember",
    name: "EMBER",
    unlockLevel: 3,
    tintHex: "#c07840",
    accentHex: "#ff7e1f",
    gradient: "linear-gradient(135deg,#4d1a0a,#ff7e1f)",
    archetype: "robot_ember",
    species: "ROBOT",
    icon: "🔥",
    description: "Heat-forged · Flame jets",
    group: "classic",
    tagline: "Heat-forged",
    hindiName: "",
  },
  {
    id: "nova",
    name: "NOVA",
    unlockLevel: 5,
    tintHex: "#ff6b9e",
    accentHex: "#ff3ecf",
    gradient: "linear-gradient(135deg,#4d1a3a,#ff6b9e)",
    archetype: "girl",
    species: "HUMAN",
    icon: "👩",
    description: "Neon striker · Ponytail dash",
    group: "classic",
    tagline: "Neon striker",
    hindiName: "",
  },
  {
    id: "wraith",
    name: "WRAITH",
    unlockLevel: 6,
    tintHex: "#6b5a9e",
    accentHex: "#b46bff",
    gradient: "linear-gradient(135deg,#1a1030,#b46bff)",
    archetype: "robot_wraith",
    species: "ROBOT",
    icon: "👻",
    description: "Phase-shift · Ghost plating",
    group: "classic",
    tagline: "Phase-shift",
    hindiName: "",
  },
  {
    id: "xeno",
    name: "XENO",
    unlockLevel: 8,
    tintHex: "#5ec98a",
    accentHex: "#7aff7a",
    gradient: "linear-gradient(135deg,#0f3a1e,#7aff7a)",
    archetype: "alien_slim",
    species: "ALIEN",
    icon: "👽",
    description: "Slim scout · Antennae ping",
    group: "classic",
    tagline: "Slim scout",
    hindiName: "",
  },
  {
    id: "aurora",
    name: "AURORA",
    unlockLevel: 10,
    tintHex: "#3f8f96",
    accentHex: "#7af0ff",
    gradient: "linear-gradient(135deg,#0a2a3a,#7af0ff)",
    archetype: "robot_aurora",
    species: "ROBOT",
    icon: "❄️",
    description: "Cryo-coated · Ice crystals",
    group: "classic",
    tagline: "Cryo-coated",
    hindiName: "",
  },
  {
    id: "titan",
    name: "TITAN",
    unlockLevel: 14,
    tintHex: "#c94a4a",
    accentHex: "#ff3a3a",
    gradient: "linear-gradient(135deg,#3a1a1a,#ff3a3a)",
    archetype: "alien_brute",
    species: "ALIEN",
    icon: "👾",
    description: "Brute · Horns & bulk",
    group: "classic",
    tagline: "Brute",
    hindiName: "",
  },
  {
    id: "shadow",
    name: "SHADOW",
    unlockLevel: 4,
    tintHex: "#23262e",
    accentHex: "#ff3b5c",
    gradient: "linear-gradient(135deg,#0d0f16,#ff3b5c)",
    archetype: "ninja",
    species: "HUMAN",
    icon: "🥷",
    description: "Shadow clan · Hood & scarf",
    group: "classic",
    tagline: "Shadow clan",
    hindiName: "",
  },
  {
    id: "ace",
    name: "ACE",
    unlockLevel: 7,
    tintHex: "#6b4a2f",
    accentHex: "#ffd27a",
    gradient: "linear-gradient(135deg,#2a1c10,#ffd27a)",
    archetype: "pilot",
    species: "HUMAN",
    icon: "✈️",
    description: "Sky captain · Goggles & scarf",
    group: "classic",
    tagline: "Sky captain",
    hindiName: "",
  },
  {
    id: "corsair",
    name: "CORSAIR",
    unlockLevel: 9,
    tintHex: "#7a2a2a",
    accentHex: "#ffd27a",
    gradient: "linear-gradient(135deg,#260f14,#ffd27a)",
    archetype: "pirate",
    species: "HUMAN",
    icon: "🏴‍☠️",
    description: "Sea rogue · Tricorn & coat",
    group: "classic",
    tagline: "Sea rogue",
    hindiName: "",
  },
  {
    id: "orbit",
    name: "ORBIT",
    unlockLevel: 11,
    tintHex: "#dfe6ee",
    accentHex: "#ffb84f",
    gradient: "linear-gradient(135deg,#1a2a3a,#ffb84f)",
    archetype: "astronaut",
    species: "HUMAN",
    icon: "🧑‍🚀",
    description: "Star walker · Helmet & pack",
    group: "classic",
    tagline: "Star walker",
    hindiName: "",
  },
  {
    id: "volt",
    name: "VOLT",
    unlockLevel: 12,
    tintHex: "#1c2230",
    accentHex: "#37d3e0",
    gradient: "linear-gradient(135deg,#0a1420,#37d3e0)",
    archetype: "voltbot",
    species: "ROBOT",
    icon: "🎧",
    description: "Speaker unit · Bass boost",
    group: "classic",
    tagline: "Speaker unit",
    hindiName: "",
  },
  {
    id: "anubis",
    name: "ANUBIS",
    unlockLevel: 13,
    tintHex: "#1a1512",
    accentHex: "#ffd27a",
    gradient: "linear-gradient(135deg,#14100a,#ffd27a)",
    archetype: "jackal",
    species: "ALIEN",
    icon: "🐺",
    description: "Jackal guide · Ears & tail",
    group: "classic",
    tagline: "Jackal guide",
    hindiName: "",
  },
  {
    id: "ramses",
    name: "RAMSES",
    unlockLevel: 16,
    tintHex: "#c99700",
    accentHex: "#3fa9ff",
    gradient: "linear-gradient(135deg,#2a1e05,#c99700)",
    archetype: "pharaoh",
    species: "HUMAN",
    icon: "👑",
    description: "Gold king · Nemes & cape",
    group: "classic",
    tagline: "Gold king",
    hindiName: "",
  },
];

export const CHARACTERS: CharacterDefinition[] = [...DESI_CHARACTERS, ...CLASSIC_CHARACTERS];

/** Default runner for fresh saves and self-healing. */
export const DEFAULT_CHARACTER_ID = "raju";

export function getCharacter(id: string): CharacterDefinition {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
