import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { SharedAssets } from "./SharedAssets";
import type { Obstacle } from "@/game/entities/Obstacle";
import type { Coin } from "@/game/entities/Coin";
import type { Pickup } from "@/game/entities/Pickup";
import type { Key } from "@/game/entities/Key";
import type { Rocket } from "@/game/entities/Rocket";
import { WORLD } from "@/game/config/gameplay";
import { randRange } from "@/game/utils/math";

const L = WORLD.segmentLength;

/**
 * One recycled chunk of the endless highway: road surface, lane strips,
 * rails, light posts, procedural skyline and holographic billboards.
 * Static decor is built once; `decorate()` re-randomizes it on recycle.
 */
export class TrackSegment {
  readonly group = new THREE.Group();
  /** Gameplay entities currently parented to this segment (pooled upstream). */
  readonly obstacles: Obstacle[] = [];
  readonly coins: Coin[] = [];
  readonly pickups: Pickup[] = [];
  readonly keys: Key[] = [];
  readonly rockets: Rocket[] = [];

  private billboards: { mesh: THREE.Mesh; slot: number; phase: number }[] = [];
  private buildings: THREE.Mesh[] = [];
  private time = Math.random() * 100;
  private side = 1;

  constructor(
    readonly index: number,
    shared: SharedAssets,
    bag: ResourceBag
  ) {
    this.group.name = `segment-${index}`;
    this.buildRoad(shared, bag);
    this.buildRails(shared, bag);
    this.buildPosts(shared, bag);
    this.buildSkyline(shared, bag);
    this.buildBillboards(shared, bag);
  }

  /** World z of the segment origin (near edge). Segment spans [origin-L, origin]. */
  get originZ(): number {
    return this.group.position.z;
  }

  set originZ(z: number) {
    this.group.position.z = z;
  }

  updateVisual(delta: number): void {
    this.time += delta;
    for (let i = 0; i < this.billboards.length; i++) {
      const board = this.billboards[i];
      const material = board.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.65 + Math.sin(this.time * 2.2 + board.phase) * 0.25;
    }
  }

  /** Re-randomize skyline + billboard art for a fresh look after recycling. */
  decorate(shared: SharedAssets, billboardSetIndex: number): void {
    const half = L / 2;
    let side = this.side;
    for (const building of this.buildings) {
      const width = randRange(3, 7);
      const depth = randRange(3, 6);
      const height = randRange(5, 26);
      building.scale.set(width, height, depth);
      building.position.set(
        side * randRange(8.5, 30),
        0,
        -randRange(2, L - 2)
      );
      building.rotation.y = randRange(-0.15, 0.15);
      side = -side;
    }
    this.side = -this.side;

    const set = shared.billboardSets[billboardSetIndex] ?? shared.billboardSets[0];
    this.billboards.forEach((board, i) => {
      board.slot = (board.slot + 1 + i) % set.length;
      board.mesh.material = set[board.slot];
    });
  }

  // ------------------------------------------------------------------ builds

  private buildRoad(shared: SharedAssets, bag: ResourceBag): void {
    const roadGeo = bag.geo(new THREE.BoxGeometry(WORLD.roadHalfWidth * 2 + 1, 0.4, L));
    const road = new THREE.Mesh(roadGeo, shared.roadMat);
    road.position.set(0, -0.2, -L / 2);
    road.receiveShadow = true;
    this.group.add(road);

    // Lane boundary strips at x = ±1.25.
    const stripGeo = bag.geo(new THREE.PlaneGeometry(0.07, L - 3));
    for (const x of [-1.25, 1.25]) {
      const strip = new THREE.Mesh(stripGeo, shared.laneStripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.012, -L / 2);
      this.group.add(strip);
    }

    // Faint cross dashes for speed sensation.
    const dashGeo = bag.geo(new THREE.PlaneGeometry(WORLD.roadHalfWidth * 1.7, 0.16));
    for (let z = -4; z > -L; z -= 8) {
      const dash = new THREE.Mesh(dashGeo, shared.dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.011, z);
      this.group.add(dash);
    }
  }

  private buildRails(shared: SharedAssets, bag: ResourceBag): void {
    const railGeo = bag.geo(new THREE.BoxGeometry(0.24, 0.42, L));
    const glowGeo = bag.geo(new THREE.BoxGeometry(0.28, 0.05, L));
    const edgeMat = this.index % 2 === 0 ? shared.edgeLimeMat : shared.edgeGreenMat;
    for (const x of [-(WORLD.roadHalfWidth + 0.35), WORLD.roadHalfWidth + 0.35]) {
      const rail = new THREE.Mesh(railGeo, shared.postMat);
      rail.position.set(x, 0.21, -L / 2);
      const glow = new THREE.Mesh(glowGeo, edgeMat);
      glow.position.set(x, 0.44, -L / 2);
      this.group.add(rail, glow);
    }
  }

  private buildPosts(shared: SharedAssets, bag: ResourceBag): void {
    const poleGeo = bag.geo(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 8));
    const headGeo = bag.geo(new THREE.BoxGeometry(0.55, 0.14, 0.22));
    const positions = this.index % 2 === 0 ? [-12, -36] : [-24];
    positions.forEach((z, i) => {
      const sideX = (i % 2 === 0 ? -1 : 1) * (WORLD.roadHalfWidth + 0.9);
      const pole = new THREE.Mesh(poleGeo, shared.postMat);
      pole.position.set(sideX, 2.2, z);
      const head = new THREE.Mesh(headGeo, shared.postHeadMat);
      head.position.set(sideX - Math.sign(sideX) * 0.32, 4.35, z);
      this.group.add(pole, head);
    });
  }

  private buildSkyline(shared: SharedAssets, _bag: ResourceBag): void {
    void _bag;
    for (let i = 0; i < 10; i++) {
      const building = new THREE.Mesh(this.unitBox(shared), shared.buildingMat);
      this.buildings.push(building);
      this.group.add(building);
    }
    this.decorate(shared, 0); // initial random layout
  }

  private unitBox(shared: SharedAssets): THREE.BufferGeometry {
    return shared.unitBoxBase;
  }

  private buildBillboards(shared: SharedAssets, bag: ResourceBag): void {
    const planeGeo = bag.geo(new THREE.PlaneGeometry(4.2, 2.1));
    const poleGeo = bag.geo(new THREE.CylinderGeometry(0.08, 0.08, 5, 6));
    const zs = [-8, -30];
    zs.forEach((z, i) => {
      const sideX = (i === 0 ? 1 : -1) * (WORLD.roadHalfWidth + 2.6);
      const pole = new THREE.Mesh(poleGeo, shared.postMat);
      pole.position.set(sideX, 2.5, z);
      const set = shared.billboardSets[0];
      const board = new THREE.Mesh(planeGeo, set[i % set.length]);
      board.position.set(sideX, 5.4, z);
      board.rotation.y = sideX > 0 ? -Math.PI / 5 : Math.PI / 5;
      this.billboards.push({ mesh: board, slot: i % set.length, phase: Math.random() * TAU_LOCAL });
      this.group.add(pole, board);
    });
  }
}

const TAU_LOCAL = Math.PI * 2;
