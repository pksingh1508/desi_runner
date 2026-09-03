/**
 * Roadside building tuning. All visuals are procedural (canvas facades +
 * shared geometries) so no external assets or licenses are involved.
 * TrackSegment consumes this; Buildings.ts implements it.
 */

export interface FacadePalette {
  /** Human-readable name for debugging. */
  name: string;
  /** Main wall color painted into the facade texture. */
  body: string;
  /** Darker base band (ground-floor shops). */
  base: string;
  /** Roof trim / parapet color. */
  trim: string;
  /** Lit window fill. */
  windowLit: string;
  /** Glass (unlit) window fill. */
  windowGlass: string;
  /** Shop awning stripe color. */
  awning: string;
}

/** Cheerful daylight facades — warm houses + pastel city blocks. */
export const FACADE_PALETTES: readonly FacadePalette[] = [
  { name: "coral", body: "#f2a488", base: "#c96f4a", trim: "#fff4e0", windowLit: "#fff3b0", windowGlass: "#dff3ff", awning: "#e31902" },
  { name: "teal", body: "#7fd4c1", base: "#3d8b7d", trim: "#f2fff8", windowLit: "#fff3b0", windowGlass: "#e8fbff", awning: "#0e6b5e" },
  { name: "sunny", body: "#ffd166", base: "#c98a1b", trim: "#fff8e1", windowLit: "#fffbe8", windowGlass: "#e8f4ff", awning: "#e31902" },
  { name: "sky", body: "#8ecae6", base: "#3f7ea6", trim: "#f4fbff", windowLit: "#fff3b0", windowGlass: "#f2faff", awning: "#274c77" },
  { name: "mint", body: "#b5e48c", base: "#5d9242", trim: "#fbfff2", windowLit: "#fff8c9", windowGlass: "#eefdff", awning: "#2b6a4c" },
  { name: "lilac", body: "#c8b6ff", base: "#6d5ba8", trim: "#fbf7ff", windowLit: "#fff3b0", windowGlass: "#eef2ff", awning: "#5a189a" },
  { name: "cream", body: "#f8edeb", base: "#b08968", trim: "#ffffff", windowLit: "#ffe66d", windowGlass: "#dfeef5", awning: "#eb7d26" },
  { name: "rose", body: "#ffafcc", base: "#a8577a", trim: "#fff0f6", windowLit: "#fff3b0", windowGlass: "#eef6ff", awning: "#9d0208" },
] as const;

/** Pitched (house) roof colors, cycled per building. */
export const HOUSE_ROOF_COLORS: readonly string[] = [
  "#e31902",
  "#eb7d26",
  "#274c77",
  "#2b6a4c",
  "#5a189a",
  "#c96f4a",
] as const;

/** Neon shop-sign glow colors (MeshBasicMaterial, pulsed globally). */
export const NEON_SIGN_COLORS: readonly number[] = [0xffd23f, 0x37d3e0, 0xff4f9a] as const;

export const BUILDINGS = {
  /** Buildings per recycled segment (split evenly across both sides). */
  perSegment: 6,
  widthMin: 4.2,
  widthMax: 7.2,
  depthMin: 4.2,
  depthMax: 6.5,
  /** Houses stay low with pitched roofs; blocks rise with flat roofs. */
  houseMaxHeight: 8.5,
  heightMin: 5,
  heightMax: 22,
  /** Tall blocks get a blinking rooftop beacon. */
  beaconMinHeight: 13,
  /** Roadside setback: keeps facades readable, never crowding the rails. */
  setbackMin: 10.5,
  setbackMax: 26,
  /** Fraction of buildings carrying a neon shop sign. */
  signChance: 0.55,
  /** Gentle yaw so the street feels hand-placed, never grid-rigid. */
  yawMax: 0.12,
  /** Animation tuning. */
  anim: {
    /** Neon sign breathing (radians/sec). */
    signPulseSpeed: 2.4,
    signBaseOpacity: 0.82,
    signPulseAmp: 0.18,
    /** Rooftop beacon blink (radians/sec). */
    beaconBlinkSpeed: 3.2,
    beaconMinScale: 0.7,
    beaconMaxScale: 1.35,
  },
} as const;

export const SIDE_GROUND = {
  /** Width of each side apron (covers building setbacks + horizon). */
  apronWidth: 60,
  /** Narrow pale sidewalk hugging the rails. */
  sidewalkWidth: 3.4,
  sidewalkOffset: 2.15,
  apronOffset: 32,
} as const;
