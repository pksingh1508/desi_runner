import { WORLD } from "./gameplay";

/**
 * Indian street cross-section + recycling layout. World units are meters;
 * forward travel is -Z. Everything visual that sits over the lanes stays
 * above `overheadMinY` so decor never reads as an obstacle (the runner jumps
 * to ~3.5 m and rides the rocket at ~4.4 m with the camera near 7.7 m).
 */
export const STREET = {
  /** Asphalt half width (lanes at -2.5 / 0 / +2.5). */
  roadHalfWidth: WORLD.roadHalfWidth,
  /** Yellow-black kerb stones. */
  kerbWidth: 0.3,
  kerbHeight: 0.18,
  /** Building line (ground-floor facade plane), |x|. */
  facadeX: 9.0,
  /** Footpath continues a little under the facades to hide setbacks. */
  footpathOuterX: 10.4,
  /** Solid decor never enters |x| below this at ground level. */
  propMinX: 6.4,
  /** Anything spanning the lanes stays above this height. */
  overheadMinY: 8.3,
  /** Texture period of the asphalt / footpath strips (meters). */
  texturePeriod: 24,
  /** Half-segment building row length (4 rows per 48 m segment). */
  rowLength: 24,
  /**
   * Street-furniture slots inside each half row (row-local z). The same
   * slots are used by every variant so wires always meet the next pole and
   * rows can keep their props clear of poles / trees.
   */
  furnitureSlots: [-6, -18] as readonly number[],
  /** Keep row props this far (m) from furniture slots. */
  furnitureClearance: 1.6,
  poleX: 6.48,
  poleHeight: 9.6,
  treeX: 6.95,
  /** Recycled "ghost" blocks behind the rearmost segment (menu backdrop). */
  rearGhostCount: 3,
  /** Hide decor fully swallowed by fog (distance past fog far, meters). */
  fogCullMargin: 12,
} as const;

/** Building massing (heights in meters). */
export const MASSING = {
  groundFloorHeight: 3.6,
  upperFloorHeight: 3.1,
  /** Shop opening recess depth. */
  shopRecess: 0.45,
  shopOpeningTop: 2.55,
  signBottom: 2.62,
  signTop: 3.42,
  parapetHeight: 0.9,
  buildingDepth: 7,
  bayWidth: 2.6,
  shopBayWidth: 3.4,
  galiChance: 0.12,
  galiWidth: [1.3, 1.9] as readonly [number, number],
} as const;
