import * as THREE from "three";
import { StreetDecor, type StreetKit } from "./StreetDecor";
import { STREET } from "@/game/config/street";
import { WORLD } from "@/game/config/gameplay";

const L = WORLD.segmentLength;

/** What the rear chain needs from a recycled track segment. */
export interface DecoratedSegment {
  readonly originZ: number;
  redecorate(biome: number): void;
}

/**
 * Keeps the street continuing *behind* the rearmost recycled segment so the
 * menu camera (which looks back at the runner's face, toward +Z) always sees
 * a long bazaar instead of the end of the world.
 *
 * It is a shift register of decor-only blocks: when a segment recycles to
 * the front, its current look is handed to ghost[0] (which then sits exactly
 * where that segment was), ghost[0]'s look moves to ghost[1], and so on —
 * so nothing ever pops. In gameplay the ghosts are behind the camera and
 * get frustum-culled.
 */
export class RearStreet {
  readonly group = new THREE.Group();
  private segments: DecoratedSegment[] = [];
  private ghosts: StreetDecor[] = [];

  constructor(private kit: StreetKit) {
    this.group.name = "RearStreet";
    for (let i = 0; i < STREET.rearGhostCount; i++) {
      const ghost = new StreetDecor(kit);
      ghost.randomize(kit, 0);
      this.ghosts.push(ghost);
      this.group.add(ghost.group);
    }
  }

  register(segment: DecoratedSegment): void {
    this.segments.push(segment);
  }

  /** Called right before a segment re-dresses on recycle. */
  retire(decor: StreetDecor): void {
    for (let i = this.ghosts.length - 1; i > 0; i--) {
      this.ghosts[i].copyFrom(this.ghosts[i - 1].state, this.kit);
    }
    if (this.ghosts.length > 0) this.ghosts[0].copyFrom(decor.state, this.kit);
  }

  /** Position ghosts behind the rearmost live segment + fog culling. */
  update(cameraZ: number, cullDistance: number): void {
    let rear = -Infinity;
    for (const s of this.segments) if (s.originZ > rear) rear = s.originZ;
    if (!Number.isFinite(rear)) return;
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i].group;
      const origin = rear + L * (i + 1);
      g.position.z = origin;
      g.updateMatrix();
      // Nearest point of the block [origin - L, origin] to the camera.
      const near = origin - L > cameraZ ? origin - L - cameraZ : origin < cameraZ ? cameraZ - origin : 0;
      g.visible = near < cullDistance;
    }
  }

  /** Re-dress every live segment and ghost for `biome` (run reset). */
  redecorateAll(biome: number): void {
    for (const s of this.segments) s.redecorate(biome);
    for (const g of this.ghosts) g.randomize(this.kit, biome);
  }
}
