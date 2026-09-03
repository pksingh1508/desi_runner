/**
 * Cosmetic catalog.
 *
 * VECTOR re-uses the single CC0-licensed RobotExpressive GLB (runtime tints
 * leave the binary untouched). EMBER / WRAITH / AURORA are distinct procedural
 * robot rigs — heat-forged, phase-shift and cryo silhouettes — so every
 * selection is a silhouette swap, not a palette swap. Human / alien
 * archetypes (RYDER / NOVA / XENO / TITAN) are also distinct procedural
 * Unlock levels are the single gating requirement; cosmetics stay
 * gameplay-neutral by design.
 */
export type CharacterArchetype =
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
}

export const CHARACTERS: CharacterDefinition[] = [
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
  },
];

export function getCharacter(id: string): CharacterDefinition {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
