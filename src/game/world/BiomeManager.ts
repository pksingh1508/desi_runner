import * as THREE from "three";
import type { SceneBundle } from "@/game/core/GameScene";
import type { SharedAssets } from "./SharedAssets";
import {
  BIOMES,
  BIOME_BLEND_METERS,
  biomeSlotsForDistance,
} from "@/game/config/biomes";
import { clamp, smoothstep } from "@/game/utils/math";

/**
 * Live-blends the world's atmosphere between biomes as distance grows:
 * fog, background, lights, road/rail/building material colors and star
 * opacity all interpolate — no loading screens, no popping. Billboard/decor
 * sets swap on segment recycle using the dominant biome index.
 */
export class BiomeManager {
  private dominantIndex = 0;
  private currentName = BIOMES[0].name;

  private scratchA = new THREE.Color();
  private scratchB = new THREE.Color();
  private lastBillboardIndex = -1;
  private transitionedTo = new Set<number>();

  /** Fires once per gameplay transition into a NEW biome id (for audio). */
  onBiomeShift: ((name: string) => void) | null = null;

  constructor(
    private bundle: SceneBundle,
    private shared: SharedAssets
  ) {}

  update(delta: number, distance: number): void {
    const { current, next } = biomeSlotsForDistance(distance);
    const blendStart = next.startDistance - BIOME_BLEND_METERS / 2;
    const blendEnd = next.startDistance + BIOME_BLEND_METERS / 2;
    const t = smoothstep(clamp((distance - blendStart) / (blendEnd - blendStart), 0, 1));

    this.dominantIndex = t < 0.5 ? current.biomeIndex : next.biomeIndex;
    const a = BIOMES[current.biomeIndex];
    const b = BIOMES[next.biomeIndex];

    this.apply(a, b, t);
    this.currentName = this.dominantIndex === current.biomeIndex ? a.name : b.name;

    if (
      this.dominantIndex !== this.lastBillboardIndex &&
      this.lastBillboardIndex !== -1 &&
      !this.transitionedTo.has(this.dominantIndex)
    ) {
      this.transitionedTo.add(this.dominantIndex);
      this.onBiomeShift?.(this.currentName);
    }
    this.lastBillboardIndex = this.dominantIndex;
    void delta; // blending is purely distance-driven; kept for API stability
  }

  get name(): string {
    return this.currentName;
  }

  get billboardSetIndex(): number {
    return this.dominantIndex;
  }

  reset(): void {
    // Distance restarts at zero; snap straight back to the first biome.
    this.transitionedTo.clear();
    this.lastBillboardIndex = -1;
    this.update(0, 0);
  }

  // ------------------------------------------------------------------ intern

  private apply(a: (typeof BIOMES)[number], b: (typeof BIOMES)[number], t: number): void {
    const bundle = this.bundle;
    const scene = bundle.scene;
    if (scene.background instanceof THREE.Color) {
      this.lerpColor(scene.background, a.background, b.background, t);
    }
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      this.lerpColor(fog.color, a.background, b.background, t);
      fog.near = lerpNum(a.fogNear, b.fogNear, t);
      fog.far = lerpNum(a.fogFar, b.fogFar, t);
    }

    this.lerpColor(bundle.hemi.color, a.hemiSky, b.hemiSky, t);
    this.lerpColor(bundle.hemi.groundColor, a.hemiGround, b.hemiGround, t);
    bundle.hemi.intensity = lerpNum(a.hemiIntensity, b.hemiIntensity, t);

    this.lerpColor(bundle.sun.color, a.sunColor, b.sunColor, t);
    bundle.sun.intensity = lerpNum(a.sunIntensity, b.sunIntensity, t);

    this.lerpColor(bundle.rim.color, a.rimColor, b.rimColor, t);
    bundle.rim.intensity = lerpNum(a.rimIntensity, b.rimIntensity, t);

    this.lerpColor(bundle.playerGlow.color, a.glowColor, b.glowColor, t);
    bundle.playerGlow.intensity = lerpNum(a.glowIntensity, b.glowIntensity, t);

    bundle.starsMaterial.opacity = lerpNum(a.starOpacity, b.starOpacity, t);

    const shared = this.shared;
    shared.roadMat.color.setHex(t < 0.5 ? a.road : b.road); // subtle: nearest wins
    this.lerpMatColor(shared.laneStripMat, a.strip, b.strip, t);
    this.lerpMatColor(shared.dashMat, a.dash, b.dash, t);
    this.lerpMatColor(shared.edgeLimeMat, a.edgeA, b.edgeA, t);
    this.lerpMatColor(shared.edgeGreenMat, a.edgeB, b.edgeB, t);
    this.lerpMatColor(shared.postHeadMat, a.postHead, b.postHead, t);
    this.lerpMatColor(shared.buildingMat, a.building, b.building, t);
    for (let i = 0; i < shared.bandMats.length; i++) {
      this.lerpMatColor(shared.bandMats[i], a.bands[i] ?? a.bands[0], b.bands[i] ?? b.bands[0], t);
    }
  }

  private lerpColor(target: THREE.Color, hexA: number, hexB: number, t: number): void {
    this.scratchA.setHex(hexA);
    this.scratchB.setHex(hexB);
    target.copy(this.scratchA).lerp(this.scratchB, t);
  }

  private lerpMatColor(
    mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
    hexA: number,
    hexB: number,
    t: number
  ): void {
    this.lerpColor(this.scratchB, hexA, hexB, t);
    mat.color.copy(this.scratchB);
  }
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
