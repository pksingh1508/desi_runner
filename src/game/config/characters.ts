/**
 * Cosmetic catalog. Characters are visual variants of the CC0-licensed
 * RobotExpressive model (material tint + emissive accent applied at runtime —
 * the .glb file itself is never modified). Trails are procedural particle
 * ribbons. Unlock levels are the single gating requirement; cosmetics stay
 * gameplay-neutral by design.
 */
export interface CharacterDefinition {
  id: string;
  name: string;
  unlockLevel: number;
  /** Suit tint blended over the model's base colors (0..1). */
  tintHex: string;
  /** Emissive accent color for glow panels / fallback bot. */
  accentHex: string;
  gradient: string;
}

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "vector",
    name: "VECTOR",
    unlockLevel: 1,
    tintHex: "#9fb86a",
    accentHex: "#d9de7a",
    gradient: "linear-gradient(135deg,#3d4d2c,#d9de7a)",
  },
  {
    id: "ember",
    name: "EMBER",
    unlockLevel: 3,
    tintHex: "#c07840",
    accentHex: "#ff9e54",
    gradient: "linear-gradient(135deg,#4d3020,#ff9e54)",
  },
  {
    id: "wraith",
    name: "WRAITH",
    unlockLevel: 6,
    tintHex: "#6b5a9e",
    accentHex: "#b46bff",
    gradient: "linear-gradient(135deg,#2b2440,#b46bff)",
  },
  {
    id: "aurora",
    name: "AURORA",
    unlockLevel: 10,
    tintHex: "#3f8f96",
    accentHex: "#37d3e0",
    gradient: "linear-gradient(135deg,#1d3a3f,#37d3e0)",
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
