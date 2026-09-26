import type * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { WORLD } from "@/game/config/gameplay";
import { BIOMES } from "@/game/config/biomes";
import { VARIANTS, streetStyleFor } from "@/game/config/buildings";
import { createRng } from "./gfx/random";
import { buildFacadeAtlas, type FacadeAtlas } from "./textures/FacadeAtlas";
import { buildStreetAtlas, type StreetAtlas } from "./textures/StreetAtlas";
import { buildStreetGeometry, randomStreetOptions } from "./street/StreetGeometry";
import { buildFurnitureGeometry } from "./street/Furniture";
import { buildRowGeometry } from "./Buildings";
import {
  createFacadeMaterial,
  createStreetMaterial,
  createStreetUniforms,
  type StreetUniforms,
} from "./street/StreetMaterials";
import type { StreetKit } from "./street/StreetDecor";
import { RearStreet } from "./street/RearStreet";

/**
 * Per-session street content shared by every recycled segment: procedural
 * atlases, the two street materials and every prebuilt variant geometry
 * (street surfaces, building rows and furniture sets per biome). Built once
 * at boot; recycling only re-points meshes at these, so the frame loop never
 * allocates. BiomeManager tints the shared materials live.
 */
export class SharedAssets {
  readonly facadeAtlas: FacadeAtlas;
  readonly streetAtlas: StreetAtlas;
  readonly uniforms: StreetUniforms;
  readonly street: StreetKit;
  /** Decor chain continuing the street behind the rearmost segment. */
  readonly rear: RearStreet;
  /**
   * Biome used when a segment re-dresses on recycle. BiomeManager keeps it
   * at the biome the runner will be in when reaching a freshly recycled
   * segment (look-ahead), so buildings switch together with the sky.
   */
  decorBiome = 0;
  /** Fog culling window, refreshed by BiomeManager every frame. */
  readonly view = { cameraZ: 8, cullDistance: 420 };

  /**
   * @param bag resource registry for disposal
   * @param _legacyHues ignored (kept for the Game constructor signature)
   */
  constructor(
    readonly bag: ResourceBag,
    _legacyHues?: unknown
  ) {
    void _legacyHues;
    this.facadeAtlas = buildFacadeAtlas(bag);
    this.streetAtlas = buildStreetAtlas(bag);
    this.uniforms = createStreetUniforms();
    const streetMaterial = bag.mat(createStreetMaterial(this.streetAtlas, this.uniforms));
    const facadeMaterial = bag.mat(createFacadeMaterial(this.facadeAtlas, this.uniforms));

    const rng = createRng(20240917);
    const streets: THREE.BufferGeometry[] = [];
    for (let i = 0; i < VARIANTS.streets; i++) {
      streets.push(bag.geo(buildStreetGeometry(this.streetAtlas, rng, randomStreetOptions(rng, false))));
    }
    const festiveStreets: THREE.BufferGeometry[] = [];
    for (let i = 0; i < VARIANTS.festiveStreets; i++) {
      festiveStreets.push(bag.geo(buildStreetGeometry(this.streetAtlas, rng, randomStreetOptions(rng, true))));
    }

    const rows: THREE.BufferGeometry[][] = [];
    const furniture: THREE.BufferGeometry[][] = [];
    const festiveBiomes = new Set<number>();
    BIOMES.forEach((biome, index) => {
      const style = streetStyleFor(biome.id);
      const festive = style.building.stringLightChance > 0.5;
      if (festive) festiveBiomes.add(index);
      const biomeRows: THREE.BufferGeometry[] = [];
      for (let v = 0; v < VARIANTS.rowsPerBiome; v++) {
        biomeRows.push(bag.geo(buildRowGeometry(this.facadeAtlas, style.building, festive, 1000 + index * 97 + v * 13)));
      }
      rows.push(biomeRows);
      const biomeFurniture: THREE.BufferGeometry[] = [];
      for (let v = 0; v < VARIANTS.furniturePerBiome; v++) {
        biomeFurniture.push(bag.geo(buildFurnitureGeometry(this.facadeAtlas, style.furniture, index, festive, 5000 + index * 71 + v * 17)));
      }
      furniture.push(biomeFurniture);
    });

    this.street = { streetMaterial, facadeMaterial, streets, festiveStreets, rows, furniture, festiveBiomes };
    this.rear = new RearStreet(this.street);
  }

  get segmentLength(): number {
    return WORLD.segmentLength;
  }

  /** True when a block spanning [originZ - L, originZ] is within fog range. */
  isBlockVisible(originZ: number): boolean {
    const L = WORLD.segmentLength;
    const cam = this.view.cameraZ;
    const near = originZ - L > cam ? originZ - L - cam : originZ < cam ? cam - originZ : 0;
    return near < this.view.cullDistance;
  }
}
