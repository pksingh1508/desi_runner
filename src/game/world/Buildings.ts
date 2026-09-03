import * as THREE from "three";
import type { SharedAssets } from "./SharedAssets";
import { BUILDINGS } from "@/game/config/buildings";
import { randRange, randInt } from "@/game/utils/math";

/**
 * One procedural roadside building: textured house or city block with a
 * pitched / flat roof, rooftop detail, neon shop sign and (on tall blocks)
 * a blinking beacon. All geometry/materials are shared — `configure()`
 * only re-points + rescales, so recycling never allocates.
 */
export class RoadsideBuilding {
  readonly group = new THREE.Group();

  private body: THREE.Mesh;
  private roofFlat: THREE.Mesh;
  private roofHouse: THREE.Mesh;
  private tank: THREE.Mesh;
  private chimney: THREE.Mesh;
  private sign: THREE.Mesh;
  private beacon: THREE.Mesh;
  private beaconPhase = Math.random() * Math.PI * 2;
  private beaconBaseY = 0;

  constructor(shared: SharedAssets) {
    this.body = new THREE.Mesh(shared.unitBoxBase, shared.facadeLowMats[0]);
    this.roofFlat = new THREE.Mesh(shared.unitBoxBase, shared.flatRoofMat);
    this.roofHouse = new THREE.Mesh(shared.pitchedRoofGeo, shared.houseRoofMats[0]);
    this.tank = new THREE.Mesh(shared.tankGeo, shared.tankMat);
    this.chimney = new THREE.Mesh(shared.unitBoxBase, shared.flatRoofMat);
    this.sign = new THREE.Mesh(shared.signGeo, shared.signMats[0]);
    this.beacon = new THREE.Mesh(shared.beaconGeo, shared.beaconMat);
    // Decor never blocks gameplay and never needs shadows — keeps the
    // shadow pass limited to the player + obstacles.
    for (const mesh of [this.body, this.roofFlat, this.roofHouse, this.tank, this.chimney, this.sign, this.beacon]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = true;
    }
    // Neon signs glow through fog and face the road (DoubleSide is off for
    // perf; rotation is set in configure()).
    this.group.add(this.body, this.roofFlat, this.roofHouse, this.tank, this.chimney, this.sign, this.beacon);
  }

  /**
   * Re-dress this building for a fresh street front.
   * @param side -1 (left) or +1 (right) side of the road
   * @param z local z inside the segment (negative, ahead of origin)
   */
  configure(shared: SharedAssets, side: number, z: number): void {
    const width = randRange(BUILDINGS.widthMin, BUILDINGS.widthMax);
    const depth = randRange(BUILDINGS.depthMin, BUILDINGS.depthMax);
    const height = randRange(BUILDINGS.heightMin, BUILDINGS.heightMax);
    const isHouse = height <= BUILDINGS.houseMaxHeight;
    const palette = randInt(0, shared.facadeLowMats.length - 1);

    this.body.material = isHouse ? shared.facadeLowMats[palette] : shared.facadeHighMats[palette];
    this.body.scale.set(width, height, depth);
    this.body.position.set(0, 0, 0);

    // Flat-block parapet vs pitched house roof.
    this.roofFlat.visible = !isHouse;
    this.roofHouse.visible = isHouse;
    if (!isHouse) {
      this.roofFlat.scale.set(width + 0.5, 0.35, depth + 0.5);
      this.roofFlat.position.set(0, height, 0);
    } else {
      const roofH = randRange(1.4, 2.3);
      this.roofHouse.material = shared.houseRoofMats[palette % shared.houseRoofMats.length];
      // Cone radius 0.78 → scale so the eaves overhang the walls slightly.
      this.roofHouse.scale.set((width * 0.62) / 0.78, roofH, (depth * 0.62) / 0.78);
      this.roofHouse.position.set(0, height - 0.05, 0);
      this.roofHouse.rotation.y = Math.PI / 4;
    }

    // Rooftop silhouette: water tank on blocks, chimney on some houses.
    if (!isHouse) {
      this.tank.visible = Math.random() > 0.35;
      this.chimney.visible = false;
      if (this.tank.visible) {
        const s = randRange(0.8, 1.25);
        this.tank.scale.set(s, s, s);
        this.tank.position.set(randRange(-width / 4, width / 4), height + 0.35, randRange(-depth / 4, depth / 4));
      }
      this.beaconBaseY = height + (this.tank.visible ? 2.3 : 0.75);
    } else {
      this.tank.visible = false;
      this.chimney.visible = Math.random() > 0.45;
      if (this.chimney.visible) {
        this.chimney.scale.set(0.5, 1.2, 0.5);
        this.chimney.position.set(width * 0.26, height + 0.5, -depth * 0.18);
      }
      this.beaconBaseY = 0;
    }

    // Neon shop sign on the road-facing wall (about half the buildings).
    this.sign.visible = Math.random() < BUILDINGS.signChance;
    if (this.sign.visible) {
      this.sign.material = shared.signMats[randInt(0, shared.signMats.length - 1)];
      const towardRoad = -Math.sign(side);
      this.sign.position.set(towardRoad * (width / 2 + 0.14), randRange(2.2, Math.min(4.2, height - 1)), depth * 0.22);
      this.sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }

    // Blinking beacon crowns tall blocks only.
    this.beacon.visible = !isHouse && height >= BUILDINGS.beaconMinHeight;
    if (this.beacon.visible) {
      this.beacon.position.set(width * 0.18, this.beaconBaseY, -depth * 0.12);
      this.beacon.scale.setScalar(1);
    }

    const x = side * randRange(BUILDINGS.setbackMin, BUILDINGS.setbackMax);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = randRange(-BUILDINGS.yawMax, BUILDINGS.yawMax);
  }

  /** Beacon blink — scale-only so the shared material stays untouched. */
  update(time: number): void {
    if (!this.beacon.visible) return;
    const { beaconBlinkSpeed, beaconMinScale, beaconMaxScale } = BUILDINGS.anim;
    const k = 0.5 + 0.5 * Math.sin(time * beaconBlinkSpeed + this.beaconPhase);
    this.beacon.scale.setScalar(beaconMinScale + (beaconMaxScale - beaconMinScale) * k);
  }
}
