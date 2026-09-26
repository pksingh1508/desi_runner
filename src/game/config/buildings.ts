/**
 * Indian street architecture + signage content. Everything is procedural
 * (canvas-painted atlases + code geometry): no downloaded assets, no real
 * brands or logos — every shop name below is fictional/generic.
 *
 * `STREET_STYLES` is keyed by `BiomeDefinition.id` (config/biomes.ts).
 */

export interface ShopSignDef {
  id: string;
  hindi: string;
  english: string;
  /** Board paint. */
  bg: string;
  /** Primary lettering. */
  fg: string;
  /** Border / outline / secondary lettering. */
  accent: string;
  /** Which script gets the big line. */
  lead: "hindi" | "english";
  icon: "none" | "cup" | "cross" | "leaf" | "phone" | "gem" | "star" | "needle" | "pot" | "book";
}

export const SHOP_SIGNS: readonly ShopSignDef[] = [
  { id: "sharma", hindi: "शर्मा जनरल स्टोर", english: "SHARMA GENERAL STORE", bg: "#c4271f", fg: "#ffd83a", accent: "#fff3d6", lead: "hindi", icon: "star" },
  { id: "gupta", hindi: "गुप्ता स्वीट्स", english: "GUPTA SWEETS", bg: "#f07c12", fg: "#ffffff", accent: "#9b1b12", lead: "hindi", icon: "star" },
  { id: "chai", hindi: "कुल्हड़ चाय", english: "CHAI", bg: "#1f7a3a", fg: "#fff4c2", accent: "#ffcf3a", lead: "english", icon: "cup" },
  { id: "mobile", hindi: "मोबाइल रिपेयरिंग", english: "MOBILE REPAIRING", bg: "#1557b5", fg: "#ffffff", accent: "#ffdf3a", lead: "english", icon: "phone" },
  { id: "photostat", hindi: "फोटो कॉपी", english: "PHOTOSTAT • PRINT", bg: "#f7d728", fg: "#1a1a1a", accent: "#d0271e", lead: "english", icon: "none" },
  { id: "medical", hindi: "मेडिकल स्टोर", english: "MEDICAL STORE", bg: "#f7f7f2", fg: "#177a3c", accent: "#177a3c", lead: "hindi", icon: "cross" },
  { id: "paan", hindi: "पान भंडार", english: "PAAN BHANDAR", bg: "#185c2c", fg: "#c9f25a", accent: "#ffffff", lead: "hindi", icon: "leaf" },
  { id: "kirana", hindi: "किराना स्टोर", english: "KIRANA STORE", bg: "#ffb81c", fg: "#7a1010", accent: "#7a1010", lead: "hindi", icon: "none" },
  { id: "saree", hindi: "अग्रवाल साड़ी सेंटर", english: "AGARWAL SAREE CENTRE", bg: "#7a1233", fg: "#ffd36b", accent: "#ffd36b", lead: "hindi", icon: "star" },
  { id: "bartan", hindi: "बर्तन भंडार", english: "BARTAN BHANDAR", bg: "#2f5f8f", fg: "#ffffff", accent: "#cfe3f2", lead: "hindi", icon: "pot" },
  { id: "lassi", hindi: "लस्सी कॉर्नर", english: "LASSI CORNER", bg: "#fbfbf6", fg: "#1c4fa0", accent: "#e0452b", lead: "english", icon: "cup" },
  { id: "joota", hindi: "जूता घर", english: "JOOTA GHAR", bg: "#e85a1a", fg: "#1a1208", accent: "#fff0d0", lead: "hindi", icon: "none" },
  { id: "tailor", hindi: "मास्टर जी टेलर्स", english: "MASTER JI TAILORS", bg: "#5b2a86", fg: "#ffffff", accent: "#f2c94c", lead: "english", icon: "needle" },
  { id: "jewel", hindi: "राज ज्वैलर्स", english: "RAJ JEWELLERS", bg: "#141414", fg: "#f4c64e", accent: "#f4c64e", lead: "english", icon: "gem" },
  { id: "vadapav", hindi: "वड़ा पाव सेंटर", english: "VADA PAV CENTRE", bg: "#d62d20", fg: "#ffe14d", accent: "#ffffff", lead: "english", icon: "none" },
  { id: "hotel", hindi: "होटल शांति", english: "HOTEL SHANTI", bg: "#0f6f73", fg: "#ffffff", accent: "#ffd166", lead: "english", icon: "star" },
  { id: "handicraft", hindi: "राजस्थानी हस्तकला", english: "RAJASTHANI HANDICRAFTS", bg: "#b8431f", fg: "#fff1cf", accent: "#ffcf5a", lead: "hindi", icon: "star" },
  { id: "mishthan", hindi: "मिष्ठान भंडार", english: "MISHTHAN BHANDAR", bg: "#ffe9b0", fg: "#b3121b", accent: "#b3121b", lead: "hindi", icon: "star" },
  { id: "pustak", hindi: "पुस्तक भंडार", english: "BOOK DEPOT", bg: "#264d2c", fg: "#fff7df", accent: "#e8b64c", lead: "hindi", icon: "book" },
  { id: "pco", hindi: "एस.टी.डी. पी.सी.ओ.", english: "STD • ISD • PCO", bg: "#ffd21f", fg: "#111111", accent: "#1f4fbf", lead: "english", icon: "phone" },
];

/** Big hand-painted wall adverts (fictional services). */
export interface WallAdDef {
  hindi: string;
  english: string;
  bg: string;
  fg: string;
  accent: string;
}

export const WALL_ADS: readonly WallAdDef[] = [
  { hindi: "दास कोचिंग सेंटर", english: "DAS COACHING CENTRE", bg: "#f4f1e6", fg: "#1d3f8f", accent: "#cc2a1d" },
  { hindi: "शुद्ध सरसों तेल", english: "PURE MUSTARD OIL", bg: "#f6cf2e", fg: "#b3161b", accent: "#1f5a1f" },
  { hindi: "अंग्रेज़ी बोलना सीखें", english: "ENGLISH SPEAKING", bg: "#ffffff", fg: "#c0182a", accent: "#1c4f9c" },
  { hindi: "बिजली मिस्त्री", english: "ELECTRICIAN • PLUMBER", bg: "#2a7a4a", fg: "#ffffff", accent: "#ffd84a" },
];

/** Small paper posters pasted on pillars. */
export interface PosterDef {
  top: string;
  bottom: string;
  bg: string;
  fg: string;
}

export const POSTERS: readonly PosterDef[] = [
  { top: "TUITION", bottom: "ट्यूशन", bg: "#ffe14a", fg: "#1a1a1a" },
  { top: "TO-LET", bottom: "किराये पर", bg: "#ffffff", fg: "#c0182a" },
  { top: "YOGA", bottom: "योग शिविर", bg: "#ff8a1f", fg: "#ffffff" },
  { top: "CRICKET", bottom: "टूर्नामेंट", bg: "#2f9e4f", fg: "#ffffff" },
  { top: "भजन", bottom: "संध्या", bg: "#ffb300", fg: "#7a0f0f" },
  { top: "SALE", bottom: "50% OFF", bg: "#e5261f", fg: "#fff4a8" },
  { top: "DANCE", bottom: "CLASSES", bg: "#e84a9a", fg: "#ffffff" },
  { top: "MELA", bottom: "मेला", bg: "#3456c7", fg: "#ffe46b" },
];

/** Roadside milestone per biome (index = biome index). */
export const MILESTONES: readonly { hindi: string; english: string; km: string }[] = [
  { hindi: "दिल्ली", english: "DELHI", km: "5" },
  { hindi: "जयपुर", english: "JAIPUR", km: "3" },
  { hindi: "मुंबई", english: "MUMBAI", km: "8" },
  { hindi: "दिल्ली", english: "DELHI", km: "1" },
];

export type BayKind =
  | "wall"
  | "wallAlt"
  | "vent"
  | "win"
  | "winB"
  | "twin"
  | "door"
  | "arch"
  | "jali"
  | "brick";

export type ShopKind =
  | "shutter"
  | "shutterHalf"
  | "kirana"
  | "sweets"
  | "mobile"
  | "cloth"
  | "utensils"
  | "chai"
  | "medical"
  | "flowers"
  | "jewel"
  | "tailor";

export type AwningKind = "red" | "orange" | "green" | "blueYellow" | "tarp" | "tin" | "pink";

export type PropKind =
  | "scooter"
  | "cycle"
  | "cart"
  | "cow"
  | "bench"
  | "shrine"
  | "sacks"
  | "drum"
  | "cylinders"
  | "chairs"
  | "pots"
  | "umbrella"
  | "crates";

/** Per-biome architecture recipe consumed by the row builder. */
export interface StreetStyle {
  /** Plaster tints (vertex colors multiplied into greyscale plaster). */
  wallColors: readonly number[];
  /** Cornices, parapets, chajjas, window frames. */
  trimColors: readonly number[];
  /** Wooden shutters / doors. */
  shutterColors: readonly number[];
  railingColors: readonly number[];
  /** Upper floors above the shop floor [min, max]. */
  upperFloors: readonly [number, number];
  buildingWidth: readonly [number, number];
  /** Share of buildings using the grimy "B" plaster family. */
  grimyShare: number;
  bayWeights: Readonly<Partial<Record<BayKind, number>>>;
  /** Fraction of windows with a lit (night-emissive) interior. */
  litChance: number;
  shops: readonly ShopKind[];
  signs: readonly string[];
  awnings: readonly AwningKind[];
  awningChance: number;
  balconyChance: number;
  acChance: number;
  shutterChance: number;
  chajjaChance: number;
  jharokhaChance: number;
  crenellated: boolean;
  chhatriChance: number;
  grillBoxChance: number;
  tarpChance: number;
  laundryChance: number;
  wallAdChance: number;
  posterChance: number;
  toranChance: number;
  stringLightChance: number;
  lanternChance: number;
  diyaChance: number;
  tankChance: number;
  dishChance: number;
  props: Readonly<Partial<Record<PropKind, number>>>;
  /** Footpath props per 10 m of frontage. */
  propDensity: number;
}

/** Overhead + kerbside street furniture recipe (per 48 m segment). */
export interface FurnitureStyle {
  /** Wires per pole-to-pole span along each side. */
  wiresPerSpan: readonly [number, number];
  /** Wires crossing the street per segment. */
  crossWires: readonly [number, number];
  /** Service drops from poles to facades per pole. */
  serviceDrops: readonly [number, number];
  buntingStrings: readonly [number, number];
  buntingColors: readonly number[];
  garlands: readonly [number, number];
  stringLights: readonly [number, number];
  lanterns: number;
  treeChance: number;
  leafColors: readonly number[];
  transformerChance: number;
  milestoneChance: number;
  kerbDiyas: boolean;
  lampColor: number;
}

const DELHI_WALLS = [0xe89a2e, 0xd9ab3c, 0x4fa39a, 0xdc7a5a, 0xeadcc0, 0x8fbb78, 0x74a9d4, 0xc45e3e, 0xe6c455, 0xe28e98, 0xd2bd98, 0xb8d05a];
const PINK_WALLS = [0xe58b7c, 0xd9776a, 0xeaa190, 0xcd6d5d, 0xf0b39e, 0xdc8a6f, 0xd27e70, 0xe89a88];
const MUMBAI_WALLS = [0xb9c1be, 0xd9cea0, 0xa3c3c2, 0xcbbba2, 0xaebdd2, 0xd6aaa2, 0xe1ddd1, 0xc2c9a4];

export const STREET_STYLES: Readonly<Record<string, { building: StreetStyle; furniture: FurnitureStyle }>> = {
  chandniChowk: {
    building: {
      wallColors: DELHI_WALLS,
      trimColors: [0xf4ecdd, 0xfff6e6, 0xd9cdb8, 0xe8dcc6],
      shutterColors: [0x3f7a4c, 0x2f5f8c, 0x7a5232, 0x2d7d7a, 0x9a3a2a],
      railingColors: [0x262626, 0x2e5e3a, 0x2f4f7a, 0xdcdcdc],
      upperFloors: [1, 4],
      buildingWidth: [4.2, 7.4],
      grimyShare: 0.45,
      bayWeights: { wall: 1.2, wallAlt: 0.7, vent: 0.4, win: 2, winB: 2, twin: 1, door: 1, brick: 0.5 },
      litChance: 0.45,
      shops: ["kirana", "sweets", "mobile", "cloth", "utensils", "chai", "medical", "flowers", "jewel", "tailor", "shutter", "shutterHalf"],
      signs: ["sharma", "gupta", "chai", "mobile", "photostat", "medical", "paan", "kirana", "saree", "bartan", "joota", "tailor", "jewel", "mishthan", "pustak", "pco"],
      awnings: ["red", "orange", "green", "blueYellow", "tarp", "tin"],
      awningChance: 0.6,
      balconyChance: 0.35,
      acChance: 0.25,
      shutterChance: 0.3,
      chajjaChance: 0.85,
      jharokhaChance: 0,
      crenellated: false,
      chhatriChance: 0.05,
      grillBoxChance: 0.1,
      tarpChance: 0.2,
      laundryChance: 0.3,
      wallAdChance: 0.45,
      posterChance: 0.5,
      toranChance: 0.3,
      stringLightChance: 0.05,
      lanternChance: 0,
      diyaChance: 0,
      tankChance: 0.85,
      dishChance: 0.5,
      props: { scooter: 3, cycle: 1.5, cart: 1.5, cow: 0.5, bench: 1, shrine: 0.35, sacks: 1.2, drum: 0.8, cylinders: 0.6, chairs: 0.6, crates: 1 },
      propDensity: 2.3,
    },
    furniture: {
      wiresPerSpan: [3, 6],
      crossWires: [2, 4],
      serviceDrops: [2, 4],
      buntingStrings: [1, 2],
      buntingColors: [0xff7a00, 0xffffff, 0x1f9e3a, 0xe5261f, 0xffd21f, 0x1f5fd1],
      garlands: [0, 1],
      stringLights: [0, 0],
      lanterns: 0,
      treeChance: 0.35,
      leafColors: [0x5f8f3a, 0x4f7f34, 0x6f9a3f],
      transformerChance: 0.5,
      milestoneChance: 0.35,
      kerbDiyas: false,
      lampColor: 0xfff1d0,
    },
  },
  pinkCity: {
    building: {
      wallColors: PINK_WALLS,
      trimColors: [0xfbf2e8, 0xfff8ef, 0xf3e3d3],
      shutterColors: [0x2f8a80, 0x3b6ea5, 0x2e6b3f, 0x7a4b2a],
      railingColors: [0xf4efe6, 0x262626, 0x2f8a80],
      upperFloors: [1, 3],
      buildingWidth: [4.6, 7.8],
      grimyShare: 0.15,
      bayWeights: { wall: 0.8, wallAlt: 0.3, arch: 3, jali: 1.6, twin: 1, win: 0.6, door: 0.8 },
      litChance: 0.55,
      shops: ["cloth", "jewel", "sweets", "flowers", "utensils", "kirana", "chai", "shutterHalf", "shutter"],
      signs: ["handicraft", "saree", "jewel", "lassi", "chai", "medical", "joota", "mishthan", "gupta", "kirana"],
      awnings: ["pink", "orange", "red", "green"],
      awningChance: 0.55,
      balconyChance: 0.2,
      acChance: 0.1,
      shutterChance: 0.1,
      chajjaChance: 0.5,
      jharokhaChance: 0.55,
      crenellated: true,
      chhatriChance: 0.35,
      grillBoxChance: 0,
      tarpChance: 0.05,
      laundryChance: 0.12,
      wallAdChance: 0.25,
      posterChance: 0.3,
      toranChance: 0.35,
      stringLightChance: 0.05,
      lanternChance: 0,
      diyaChance: 0,
      tankChance: 0.6,
      dishChance: 0.35,
      props: { scooter: 2.5, cart: 1.5, cow: 0.8, pots: 1.6, bench: 0.8, cycle: 1, shrine: 0.3, umbrella: 0.8, crates: 0.6 },
      propDensity: 2,
    },
    furniture: {
      wiresPerSpan: [2, 3],
      crossWires: [1, 2],
      serviceDrops: [1, 3],
      buntingStrings: [2, 3],
      buntingColors: [0xff3d7f, 0xffb300, 0x00a6a6, 0xff6a00, 0x7c3aed, 0x16a34a, 0xffffff],
      garlands: [0, 1],
      stringLights: [0, 0],
      lanterns: 0,
      treeChance: 0.25,
      leafColors: [0x6a8f3a, 0x7a9a44],
      transformerChance: 0.3,
      milestoneChance: 0.35,
      kerbDiyas: false,
      lampColor: 0xffe2b0,
    },
  },
  mumbaiMonsoon: {
    building: {
      wallColors: MUMBAI_WALLS,
      trimColors: [0xd8d8d0, 0xc9c9bf, 0xe6e3da],
      shutterColors: [0x4f5f6f, 0x2f5f8c, 0x6a6a6a, 0x3c6e5a],
      railingColors: [0x2a2a2a, 0x3a4a5a, 0x5a6a5a],
      upperFloors: [2, 4],
      buildingWidth: [5.2, 8.4],
      grimyShare: 0.85,
      bayWeights: { wall: 1, wallAlt: 0.8, vent: 0.6, win: 1.4, winB: 2.4, twin: 1.2, door: 0.8, brick: 0.4 },
      litChance: 0.6,
      shops: ["kirana", "mobile", "chai", "medical", "tailor", "utensils", "shutter", "shutterHalf", "sweets"],
      signs: ["vadapav", "hotel", "mobile", "chai", "medical", "photostat", "kirana", "tailor", "pco", "pustak"],
      awnings: ["tarp", "tin", "blueYellow", "green"],
      awningChance: 0.8,
      balconyChance: 0.3,
      acChance: 0.45,
      shutterChance: 0.05,
      chajjaChance: 0.9,
      jharokhaChance: 0,
      crenellated: false,
      chhatriChance: 0,
      grillBoxChance: 0.45,
      tarpChance: 0.55,
      laundryChance: 0.45,
      wallAdChance: 0.35,
      posterChance: 0.45,
      toranChance: 0.05,
      stringLightChance: 0,
      lanternChance: 0,
      diyaChance: 0,
      tankChance: 0.9,
      dishChance: 0.7,
      props: { scooter: 3, cycle: 1.4, umbrella: 1.6, chairs: 1, drum: 1.2, crates: 1, cart: 0.8, cylinders: 0.5 },
      propDensity: 2,
    },
    furniture: {
      wiresPerSpan: [3, 5],
      crossWires: [2, 3],
      serviceDrops: [2, 4],
      buntingStrings: [0, 1],
      buntingColors: [0xff7a00, 0xffffff, 0x1f9e3a],
      garlands: [0, 0],
      stringLights: [0, 0],
      lanterns: 0,
      treeChance: 0.45,
      leafColors: [0x3f7f3a, 0x357034, 0x4a8a44],
      transformerChance: 0.5,
      milestoneChance: 0.25,
      kerbDiyas: false,
      lampColor: 0xfff4e0,
    },
  },
  diwaliNight: {
    building: {
      wallColors: DELHI_WALLS,
      trimColors: [0xf4ecdd, 0xfff6e6, 0xe8dcc6],
      shutterColors: [0x3f7a4c, 0x2f5f8c, 0x7a5232, 0x9a3a2a],
      railingColors: [0x262626, 0x2e5e3a, 0xdcdcdc],
      upperFloors: [1, 4],
      buildingWidth: [4.2, 7.4],
      grimyShare: 0.35,
      bayWeights: { wall: 1, wallAlt: 0.5, win: 2.2, winB: 1.6, twin: 1.2, door: 1.4, arch: 0.4 },
      litChance: 0.85,
      shops: ["sweets", "jewel", "cloth", "flowers", "kirana", "utensils", "mobile", "shutterHalf"],
      signs: ["gupta", "mishthan", "jewel", "saree", "sharma", "bartan", "mobile", "kirana", "chai", "paan"],
      awnings: ["red", "orange", "green", "blueYellow"],
      awningChance: 0.5,
      balconyChance: 0.45,
      acChance: 0.2,
      shutterChance: 0.25,
      chajjaChance: 0.85,
      jharokhaChance: 0.05,
      crenellated: false,
      chhatriChance: 0.05,
      grillBoxChance: 0.05,
      tarpChance: 0.1,
      laundryChance: 0.1,
      wallAdChance: 0.3,
      posterChance: 0.3,
      toranChance: 0.8,
      stringLightChance: 0.9,
      lanternChance: 0.55,
      diyaChance: 0.8,
      tankChance: 0.8,
      dishChance: 0.4,
      props: { scooter: 3, cart: 1, cow: 0.4, bench: 0.6, shrine: 0.6, cycle: 1, crates: 0.6, pots: 0.4 },
      propDensity: 1.8,
    },
    furniture: {
      wiresPerSpan: [2, 4],
      crossWires: [1, 2],
      serviceDrops: [1, 3],
      buntingStrings: [0, 1],
      buntingColors: [0xffb300, 0xff3d00, 0xffffff],
      garlands: [1, 2],
      stringLights: [3, 4],
      lanterns: 3,
      treeChance: 0.25,
      leafColors: [0x4f7f34, 0x5f8f3a],
      transformerChance: 0.35,
      milestoneChance: 0.2,
      kerbDiyas: true,
      lampColor: 0xffd9a0,
    },
  },
};

export function streetStyleFor(biomeId: string): { building: StreetStyle; furniture: FurnitureStyle } {
  return STREET_STYLES[biomeId] ?? STREET_STYLES.chandniChowk;
}

/** Boot-time variant counts (memory ↔ variety). */
export const VARIANTS = {
  rowsPerBiome: 7,
  furniturePerBiome: 4,
  streets: 8,
  festiveStreets: 3,
} as const;
