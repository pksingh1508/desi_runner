import * as THREE from "three";
import { STREET } from "@/game/config/street";
import { WORLD } from "@/game/config/gameplay";

const L = WORLD.segmentLength;

/** Prebuilt, shared street content (built once by SharedAssets). */
export interface StreetKit {
  streetMaterial: THREE.MeshStandardMaterial;
  facadeMaterial: THREE.MeshStandardMaterial;
  /** Biome-agnostic street surfaces, and festive (rangoli) ones. */
  streets: THREE.BufferGeometry[];
  festiveStreets: THREE.BufferGeometry[];
  /** [biome][variant] 24 m building rows (row-local frame). */
  rows: THREE.BufferGeometry[][];
  /** [biome][variant] 48 m street-furniture / overhead sets. */
  furniture: THREE.BufferGeometry[][];
  /** Biomes whose street surface uses the festive set. */
  festiveBiomes: ReadonlySet<number>;
}

/** Everything that defines a decor block's look (copyable, allocation-free). */
export interface DecorState {
  biome: number;
  street: number;
  rows: [number, number, number, number];
  furniture: number;
}

/**
 * The visual half of a street segment: one street surface, four building
 * rows (two per side, the right side is the same row geometry rotated
 * 180°) and one furniture/overhead set — 6 draw calls for 48 m of bazaar.
 * Re-dressing only re-points geometries; nothing is allocated.
 */
export class StreetDecor {
  readonly group = new THREE.Group();
  readonly state: DecorState = { biome: 0, street: 0, rows: [0, 0, 0, 0], furniture: 0 };
  private streetMesh: THREE.Mesh;
  private rowMeshes: THREE.Mesh[] = [];
  private furnitureMesh: THREE.Mesh;

  constructor(kit: StreetKit) {
    this.group.name = "StreetDecor";
    this.streetMesh = new THREE.Mesh(kit.streets[0], kit.streetMaterial);
    this.streetMesh.receiveShadow = true;
    this.streetMesh.name = "street";
    this.group.add(this.streetMesh);

    // rows[0..1] left side (facades face +X), rows[2..3] right side.
    const placements: [number, number, number][] = [
      [-STREET.facadeX, 0, 0],
      [-STREET.facadeX, -L / 2, 0],
      [STREET.facadeX, -L / 2, Math.PI],
      [STREET.facadeX, -L, Math.PI],
    ];
    for (const [x, z, rot] of placements) {
      const mesh = new THREE.Mesh(kit.rows[0][0], kit.facadeMaterial);
      mesh.name = "row";
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rot;
      this.rowMeshes.push(mesh);
      this.group.add(mesh);
    }
    this.furnitureMesh = new THREE.Mesh(kit.furniture[0][0], kit.facadeMaterial);
    this.furnitureMesh.name = "furniture";
    this.group.add(this.furnitureMesh);

    // Children never move relative to the block.
    for (const child of this.group.children) {
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    }
    this.apply(kit);
  }

  /** Fresh random dressing for `biome` (no allocation). */
  randomize(kit: StreetKit, biome: number): void {
    const b = clampBiome(kit, biome);
    const s = this.state;
    s.biome = b;
    const streets = kit.festiveBiomes.has(b) ? kit.festiveStreets : kit.streets;
    s.street = Math.floor(Math.random() * streets.length);
    const rows = kit.rows[b].length;
    for (let i = 0; i < 4; i++) {
      let pick = Math.floor(Math.random() * rows);
      // Avoid the same row twice along one side of a block.
      if ((i === 1 || i === 3) && pick === s.rows[i - 1] && rows > 1) pick = (pick + 1) % rows;
      s.rows[i] = pick;
    }
    s.furniture = Math.floor(Math.random() * kit.furniture[b].length);
    this.apply(kit);
  }

  copyFrom(other: DecorState, kit: StreetKit): void {
    const s = this.state;
    s.biome = other.biome;
    s.street = other.street;
    s.rows[0] = other.rows[0];
    s.rows[1] = other.rows[1];
    s.rows[2] = other.rows[2];
    s.rows[3] = other.rows[3];
    s.furniture = other.furniture;
    this.apply(kit);
  }

  private apply(kit: StreetKit): void {
    const s = this.state;
    const streets = kit.festiveBiomes.has(s.biome) ? kit.festiveStreets : kit.streets;
    this.streetMesh.geometry = streets[s.street % streets.length];
    const rows = kit.rows[s.biome];
    for (let i = 0; i < 4; i++) this.rowMeshes[i].geometry = rows[s.rows[i] % rows.length];
    const furniture = kit.furniture[s.biome];
    this.furnitureMesh.geometry = furniture[s.furniture % furniture.length];
  }
}

function clampBiome(kit: StreetKit, biome: number): number {
  if (!Number.isFinite(biome)) return 0;
  return Math.min(kit.rows.length - 1, Math.max(0, Math.floor(biome)));
}
