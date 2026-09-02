/**
 * Cosmetic catalog.
 *
 * Robot variants (VECTOR / EMBER / WRAITH / AURORA) re-use the single
 * CC0-licensed RobotExpressive GLB — runtime material tints leave the binary
 * untouched. Human / alien archetypes (RYDER / NOVA / XENO / TITAN) render as
 * distinct procedural rigs so each selection feels like a real character swap,
 * not just a palette change. Trails remain procedural ribbons.
 *
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
  | "alien_brute";
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
];

export interface TrailDefinition {
  id: string;
  name: string;
  unlockLevel: number;
  colorHex: string;
  /** Relative emission strength / brightness multiplier. */
  strength: number;
}

export const TRAILS: TrailDefinition[] = [
  {
    id: "default",
    name: "SIGNAL",
    unlockLevel: 1,
    colorHex: "#d9de7a",
    strength: 0.7,
  },
  {
    id: "electric",
    name: "ELECTRIC",
    unlockLevel: 5,
    colorHex: "#37d3e0",
    strength: 1.0,
  },
  {
    id: "fire",
    name: "FIRE",
    unlockLevel: 12,
    colorHex: "#ff7a3c",
    strength: 1.15,
  },
  {
    id: "neonPurple",
    name: "NEON PURPLE",
    unlockLevel: 15,
    colorHex: "#c06bff",
    strength: 1.15,
  },
  {
    id: "void",
    name: "VOID",
    unlockLevel: 20,
    colorHex: "#7a5cff",
    strength: 1.35,
  },
];

export function getCharacter(id: string): CharacterDefinition {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function getTrail(id: string): TrailDefinition {
  return TRAILS.find((t) => t.id === id) ?? TRAILS[0];
}
