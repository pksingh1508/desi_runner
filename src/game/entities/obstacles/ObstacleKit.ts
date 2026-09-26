import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { ObstacleKind } from "@/game/entities/Obstacle";
import {
  OBSTACLE_NIGHT,
  OBSTACLE_VARIANTS,
  VARIANTS_BY_KIND,
  VARIANT_PICK,
  type ObstacleVariantDef,
  type ObstacleVariantId,
} from "@/game/config/obstacles";
import {
  ModelBuilder,
  instantiateModel,
  withVertexColorEmissive,
  type AoOptions,
  type BuiltModel,
  type MaterialLayer,
} from "./ModelBuilder";
import { createObstacleAtlas } from "./ObstacleArt";
import type { VariantSpec } from "./types";
import { BARRIER_SPECS } from "./models/barriers";
import { MOVER_SPECS } from "./models/movers";
import { BLOCK_SPECS } from "./models/blocks";
import { OVERHEAD1_SPECS, OVERHEAD3_SPECS } from "./models/overheads";

/** One visual variant instantiated inside a pooled obstacle group. */
export interface VariantRig {
  readonly def: ObstacleVariantDef;
  readonly spec: VariantSpec;
  readonly root: THREE.Group;
  /** Animated / alternate part pivots, ordered as spec.parts. */
  readonly parts: readonly THREE.Object3D[];
}

/** Pooled obstacle visual: every variant of a kind, one visible at a time. */
export interface ObstacleRig {
  readonly kind: ObstacleKind;
  readonly group: THREE.Group;
  readonly variants: readonly VariantRig[];
  readonly kit: ObstacleKit;
}

const ALL_SPECS: readonly VariantSpec[] = [
  ...BARRIER_SPECS,
  ...MOVER_SPECS,
  ...BLOCK_SPECS,
  ...OVERHEAD1_SPECS,
  ...OVERHEAD3_SPECS,
];

const SPEC_BY_ID = new Map<ObstacleVariantId, VariantSpec>(ALL_SPECS.map((s) => [s.id, s]));

const DEFAULT_AO: AoOptions = { height: 0.45, min: 0.6 };

/** Main bodies cast; tiny emissive / transparent details never do. */
const CASTS_SHADOW: Record<MaterialLayer, boolean> = {
  paint: true,
  metal: true,
  cloth: true,
  clothArt: true,
  art: false,
  glow: false,
  glass: false,
};

const RECEIVES_SHADOW: Record<MaterialLayer, boolean> = {
  paint: true,
  metal: true,
  cloth: true,
  clothArt: true,
  art: true,
  glow: false,
  glass: false,
};

/** Day-time emissive on painted art so signs stay vivid in shade. */
const ART_DAY_EMISSIVE = 0.1;
const CLOTH_ART_DAY_EMISSIVE = 0.06;

function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

const rigRegistry = new WeakMap<THREE.Object3D, ObstacleRig>();
const kitRegistry = new WeakMap<ResourceBag, ObstacleKit>();

/** Rig registered for a pooled obstacle group (null for foreign meshes). */
export function rigFor(mesh: THREE.Object3D): ObstacleRig | null {
  return rigRegistry.get(mesh) ?? null;
}

/**
 * Per-Game cache of everything the street props share: the painted atlas,
 * seven layer materials and one merged geometry set per variant (built
 * lazily, reused by every pooled instance). All GPU resources go through the
 * Game's ResourceBag so teardown / hot reload releases them.
 */
export class ObstacleKit {
  static for(bag: ResourceBag): ObstacleKit {
    let kit = kitRegistry.get(bag);
    if (!kit) {
      kit = new ObstacleKit(bag);
      kitRegistry.set(bag, kit);
    }
    return kit;
  }

  private readonly materials: Record<MaterialLayer, THREE.Material>;
  private readonly liftables: { mat: THREE.MeshStandardMaterial; day: number; night: number }[];
  private readonly models = new Map<ObstacleVariantId, BuiltModel>();
  private readonly lastPick = new Map<ObstacleKind, ObstacleVariantId>();
  private readonly weightScratch: number[] = [];
  private lastLuminance = -1;

  private constructor(private readonly bag: ResourceBag) {
    const atlas = bag.tex(createObstacleAtlas());
    const paint = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.04, emissive: 0xffffff, emissiveIntensity: 0 })
    );
    const metal = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.38, emissive: 0xffffff, emissiveIntensity: 0 })
    );
    const cloth = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      })
    );
    const art = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: atlas,
        emissiveMap: atlas,
        emissive: 0xffffff,
        emissiveIntensity: ART_DAY_EMISSIVE,
        roughness: 0.55,
        metalness: 0,
      })
    );
    const clothArt = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: atlas,
        emissiveMap: atlas,
        emissive: 0xffffff,
        emissiveIntensity: CLOTH_ART_DAY_EMISSIVE,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
      })
    );
    // Lamps / reflectors: unlit and un-tonemapped so they pop day and night.
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const glass = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
    });

    this.materials = {
      paint: bag.mat(paint),
      metal: bag.mat(metal),
      cloth: bag.mat(cloth),
      art: bag.mat(art),
      clothArt: bag.mat(clothArt),
      glow: bag.mat(glow),
      glass: bag.mat(glass),
    };
    this.liftables = [
      { mat: paint, day: 0, night: OBSTACLE_NIGHT.paintLift },
      { mat: metal, day: 0, night: OBSTACLE_NIGHT.metalLift },
      { mat: cloth, day: 0, night: OBSTACLE_NIGHT.clothLift },
      { mat: art, day: ART_DAY_EMISSIVE, night: OBSTACLE_NIGHT.artLift },
      { mat: clothArt, day: CLOTH_ART_DAY_EMISSIVE, night: OBSTACLE_NIGHT.clothLift },
    ];
    // Warm every variant up front (~30 ms, during boot) so a kind that first
    // appears mid-run never stalls a frame building its geometry.
    for (const spec of ALL_SPECS) this.model(spec.id);
  }

  /** Builds a pooled obstacle group containing every variant of `kind`. */
  createRig(kind: ObstacleKind): ObstacleRig {
    const group = new THREE.Group();
    group.name = `obstacle-${kind}`;
    const variants = VARIANTS_BY_KIND[kind].map((id) => this.instantiate(id));
    variants.forEach((variant, i) => {
      variant.root.visible = i === 0;
      group.add(variant.root);
    });
    const rig: ObstacleRig = { kind, group, variants, kit: this };
    rigRegistry.set(group, rig);
    return rig;
  }

  /**
   * Chooses the variant for a new spawn: explicit pattern hint first, else a
   * biome-weighted roll that damps immediate repeats of the same prop.
   */
  pick(rig: ObstacleRig, biomeIndex: number, hint?: ObstacleVariantId): VariantRig {
    const variants = rig.variants;
    let chosen: VariantRig | null = null;
    if (hint) {
      for (const v of variants) {
        if (v.def.id === hint) chosen = v;
      }
    }
    if (!chosen) {
      const last = this.lastPick.get(rig.kind);
      const weights = this.weightScratch;
      weights.length = 0;
      let total = 0;
      for (const v of variants) {
        let w = v.def.biomeWeights[biomeIndex] ?? 1;
        if (v.def.id === last && variants.length > 1) w *= VARIANT_PICK.repeatWeightFactor;
        weights.push(w);
        total += w;
      }
      let roll = Math.random() * total;
      chosen = variants[variants.length - 1];
      for (let i = 0; i < variants.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          chosen = variants[i];
          break;
        }
      }
    }
    this.lastPick.set(rig.kind, chosen.def.id);
    return chosen;
  }

  /** Total merged triangle count of a variant (debug / budget checks). */
  triangles(id: ObstacleVariantId): number {
    return this.model(id).triangles;
  }

  // ---------------------------------------------------------------- intern

  private model(id: ObstacleVariantId): BuiltModel {
    let model = this.models.get(id);
    if (!model) {
      const spec = this.spec(id);
      const builder = new ModelBuilder(spec.ao === undefined ? DEFAULT_AO : spec.ao);
      spec.build(builder);
      model = builder.build();
      for (const part of model.parts) {
        for (const mesh of part.meshes) this.bag.geo(mesh.geometry);
      }
      this.models.set(id, model);
    }
    return model;
  }

  private spec(id: ObstacleVariantId): VariantSpec {
    const spec = SPEC_BY_ID.get(id);
    if (!spec) throw new Error(`[obstacles] no model spec for variant "${id}"`);
    return spec;
  }

  private instantiate(id: ObstacleVariantId): VariantRig {
    const spec = this.spec(id);
    let probeAttached = false;
    const { root, parts: partMap } = instantiateModel(
      this.model(id),
      (layer) => this.materials[layer],
      (mesh, layer) => {
        mesh.castShadow = CASTS_SHADOW[layer];
        mesh.receiveShadow = RECEIVES_SHADOW[layer];
        if (!probeAttached && layer === "paint") {
          mesh.onBeforeRender = this.nightProbe;
          probeAttached = true;
        }
      }
    );
    root.name = id;

    const parts = (spec.parts ?? []).map((name) => {
      const found = partMap.get(name);
      if (found) return found;
      // Declared but never modeled: keep indices stable with an empty pivot.
      const empty = new THREE.Group();
      empty.name = name;
      root.add(empty);
      return empty;
    });

    return { def: OBSTACLE_VARIANTS[id], spec, root, parts };
  }

  /**
   * Night readability: the darker the fog/background, the more the prop
   * layers self-illuminate. Runs from onBeforeRender of visible props only;
   * cheap early-out when the atmosphere has not changed.
   */
  private readonly nightProbe = (_renderer: THREE.WebGLRenderer, scene: THREE.Scene): void => {
    const fog = scene.fog;
    const color = fog ? fog.color : scene.background instanceof THREE.Color ? scene.background : null;
    if (!color) return;
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    if (Math.abs(luminance - this.lastLuminance) < 0.002) return;
    this.lastLuminance = luminance;
    const night =
      1 -
      smooth01(
        (luminance - OBSTACLE_NIGHT.darkLuminance) / (OBSTACLE_NIGHT.dayLuminance - OBSTACLE_NIGHT.darkLuminance)
      );
    for (const l of this.liftables) l.mat.emissiveIntensity = l.day + (l.night - l.day) * night;
  };
}
