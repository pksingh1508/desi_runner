import * as THREE from "three";
import type { SceneBundle } from "@/game/core/GameScene";
import type { SharedAssets } from "./SharedAssets";
import type { AmbientWeights } from "./atmosphere/Atmosphere";
import {
  BIOMES,
  BIOME_BLEND_METERS,
  biomeIndexAt,
  biomeSlotsForDistanceCached,
  resetBiomeCache,
  type BiomeDefinition,
} from "@/game/config/biomes";
import { STREET } from "@/game/config/street";
import { WORLD } from "@/game/config/gameplay";
import { clamp, smoothstep } from "@/game/utils/math";

/**
 * A freshly recycled segment is centered this far ahead of the runner, so
 * decor is themed for the biome the runner will be in when it arrives.
 */
const DECOR_LOOKAHEAD = WORLD.segmentLength * WORLD.segmentCount - WORLD.recycleBehindZ - WORLD.segmentLength / 2;
/** Monsoon lightning: mean seconds between flashes at full rain. */
const LIGHTNING_INTERVAL = 7;

/**
 * Live-blends the whole world between biomes as distance grows — fog, sky
 * dome, skyline, lights, IBL, asphalt wetness, facade night glow, ground and
 * ambient life weights — with no loading screens. Also runs the ambient tick
 * (sky life, rear street chain, fog culling, shader clocks) every non-paused
 * frame, menu included.
 */
export class BiomeManager {
  private dominantIndex = 0;
  private currentName = BIOMES[0].name;
  private lastDominant = -1;
  private transitionedTo = new Set<number>();
  private lastDistance = 0;
  private readonly weights: AmbientWeights = { kites: 1, birds: 1, fireworks: 0, rain: 0, skyLanterns: 0 };
  /** Unflashed light intensities (lightning multiplies on top). */
  private baseHemi = 1;
  private baseSky = new THREE.Color();
  private lightning = 0;
  private lightningTimer = LIGHTNING_INTERVAL;

  private ca = new THREE.Color();
  private cb = new THREE.Color();
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();

  /** Fires once per gameplay transition into a NEW biome id (for audio/HUD). */
  onBiomeShift: ((name: string) => void) | null = null;

  constructor(
    private bundle: SceneBundle,
    private shared: SharedAssets
  ) {
    bundle.scene.add(shared.rear.group);
    this.blend(BIOMES[0], BIOMES[0], 0, 0);
  }

  update(delta: number, distance: number): void {
    void delta; // blending is purely distance-driven; kept for API stability
    // Distance only grows within a run: a drop means a new run started
    // without reset() — re-dress the street so decor matches the sky.
    if (distance < this.lastDistance - 1) {
      this.beginNewRun();
      if (biomeIndexAt(this.lastDistance + DECOR_LOOKAHEAD) !== 0 || this.dominantIndex !== 0) {
        this.shared.rear.redecorateAll(0);
      }
    }
    this.lastDistance = distance;

    const { current, next } = biomeSlotsForDistanceCached(distance);
    const blendStart = next.startDistance - BIOME_BLEND_METERS / 2;
    const t = smoothstep(clamp((distance - blendStart) / BIOME_BLEND_METERS, 0, 1));
    this.dominantIndex = t < 0.5 ? current.biomeIndex : next.biomeIndex;
    this.blend(BIOMES[current.biomeIndex], BIOMES[next.biomeIndex], t, this.dominantIndex);
    this.currentName = BIOMES[this.dominantIndex].name;
    this.shared.decorBiome = biomeIndexAt(distance + DECOR_LOOKAHEAD);

    if (
      this.dominantIndex !== this.lastDominant &&
      this.lastDominant !== -1 &&
      !this.transitionedTo.has(this.dominantIndex)
    ) {
      this.transitionedTo.add(this.dominantIndex);
      this.onBiomeShift?.(this.currentName);
    }
    this.lastDominant = this.dominantIndex;
  }

  /**
   * Per-frame ambient life (sky clock, kites, birds, lanterns, fireworks,
   * rain, lightning), fog culling and the rear street chain. Called by Game
   * every frame in every non-paused state, including the menu.
   */
  updateAmbient(delta: number, worldSpeed: number): void {
    const camera = this.bundle.camera;
    this.shared.uniforms.uTime.value += delta;
    const fog = this.bundle.scene.fog as THREE.Fog | null;
    const cull = (fog ? fog.far : WORLD.fogFar) + STREET.fogCullMargin;
    this.shared.view.cameraZ = camera.position.z;
    this.shared.view.cullDistance = cull;
    this.shared.rear.update(camera.position.z, cull);
    this.bundle.atmosphere.update(delta, worldSpeed, this.weights, camera);
    this.updateLightning(delta);
  }

  get name(): string {
    return this.currentName;
  }

  /** Dominant biome index at the runner (music themes, HUD). */
  get billboardSetIndex(): number {
    return this.dominantIndex;
  }

  /** Biome the runner will be in when reaching freshly spawned content. */
  get upcomingBiomeIndex(): number {
    return this.shared.decorBiome;
  }

  reset(): void {
    // Distance restarts at zero; snap straight back to the first biome.
    this.beginNewRun();
    this.lastDistance = 0;
    this.update(0, 0);
    this.shared.decorBiome = 0;
    this.shared.rear.redecorateAll(0);
    this.bundle.atmosphere.reset(this.weights, this.bundle.camera.position.z);
  }

  // ------------------------------------------------------------------ intern

  private beginNewRun(): void {
    this.transitionedTo.clear();
    this.lastDominant = -1;
    resetBiomeCache();
  }

  private blend(a: BiomeDefinition, b: BiomeDefinition, t: number, dominant: number): void {
    const { scene, hemi, sun, rim, playerGlow, atmosphere } = this.bundle;

    // Fog + background.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      this.lerpHex(fog.color, a.fog, b.fog, t);
      fog.near = lerp(a.fogNear, b.fogNear, t);
      fog.far = lerp(a.fogFar, b.fogFar, t);
    }
    if (scene.background instanceof THREE.Color) this.lerpHex(scene.background, a.fog, b.fog, t);

    // Sky dome.
    const sky = atmosphere.sky.uniforms;
    this.lerpHex(sky.uZenith.value, a.sky.zenith, b.sky.zenith, t);
    this.lerpHex(sky.uHorizon.value, a.sky.horizon, b.sky.horizon, t);
    this.baseSky.copy(sky.uHorizon.value);
    this.lerpHex(sky.uGround.value, a.sky.ground, b.sky.ground, t);
    this.va.set(a.sky.sunDir[0], a.sky.sunDir[1], a.sky.sunDir[2]).normalize();
    this.vb.set(b.sky.sunDir[0], b.sky.sunDir[1], b.sky.sunDir[2]).normalize();
    sky.uSunDir.value.copy(this.va).lerp(this.vb, t).normalize();
    this.lerpHex(sky.uSunColor.value, a.sky.sunColor, b.sky.sunColor, t);
    sky.uSunSize.value = lerp(a.sky.sunSize, b.sky.sunSize, t);
    sky.uSunGlow.value = lerp(a.sky.sunGlow, b.sky.sunGlow, t);
    sky.uHaze.value = lerp(a.sky.haze, b.sky.haze, t);
    sky.uCloudCover.value = lerp(a.sky.cloudCover, b.sky.cloudCover, t);
    sky.uCloudOpacity.value = lerp(a.sky.cloudOpacity, b.sky.cloudOpacity, t);
    this.lerpHex(sky.uCloudColor.value, a.sky.cloudColor, b.sky.cloudColor, t);
    this.lerpHex(sky.uCloudShade.value, a.sky.cloudShade, b.sky.cloudShade, t);
    sky.uStars.value = lerp(a.sky.stars, b.sky.stars, t);

    // Skyline silhouettes melt into the same horizon haze.
    const sl = atmosphere.skyline.uniforms;
    this.lerpHex(sl.uNear.value, a.skyline.near, b.skyline.near, t);
    this.lerpHex(sl.uFar.value, a.skyline.far, b.skyline.far, t);
    this.lerpHex(sl.uHaze.value, a.fog, b.fog, t);
    this.lerpHex(sl.uWindow.value, a.skyline.windowColor, b.skyline.windowColor, t);
    sl.uWindowGlow.value = lerp(a.skyline.windowGlow, b.skyline.windowGlow, t);
    sl.uHazeAmount.value = lerp(a.skyline.haze, b.skyline.haze, t);
    sl.uModern.value = lerp(a.skyline.modern, b.skyline.modern, t);

    // Lights.
    this.lerpHex(hemi.color, a.hemiSky, b.hemiSky, t);
    this.lerpHex(hemi.groundColor, a.hemiGround, b.hemiGround, t);
    this.baseHemi = lerp(a.hemiIntensity, b.hemiIntensity, t);
    hemi.intensity = this.baseHemi * (1 + this.lightning * 1.6);
    this.lerpHex(sun.color, a.sunColor, b.sunColor, t);
    sun.intensity = lerp(a.sunIntensity, b.sunIntensity, t);
    this.lerpHex(rim.color, a.rimColor, b.rimColor, t);
    rim.intensity = lerp(a.rimIntensity, b.rimIntensity, t);
    this.lerpHex(playerGlow.color, a.glowColor, b.glowColor, t);
    playerGlow.intensity = lerp(a.glowIntensity, b.glowIntensity, t);

    // Image-based lighting: the dominant biome's sky PMREM, with a gentle
    // intensity dip around the swap so the change is not noticeable.
    const env = atmosphere.envMaps[dominant] ?? atmosphere.envMaps[0];
    if (scene.environment !== env) scene.environment = env;
    scene.environmentIntensity = lerp(a.envIntensity, b.envIntensity, t) * (0.55 + 0.45 * Math.abs(2 * t - 1));

    // Street + facade materials.
    const kit = this.shared.street;
    this.lerpHex(kit.streetMaterial.color, a.street.tint, b.street.tint, t);
    this.shared.uniforms.uWetness.value = lerp(a.street.wetness, b.street.wetness, t);
    this.lerpHex(kit.facadeMaterial.color, a.facade.tint, b.facade.tint, t);
    kit.facadeMaterial.emissiveIntensity = lerp(a.facade.emissive, b.facade.emissive, t);
    this.shared.uniforms.uTwinkle.value = lerp(a.facade.twinkle, b.facade.twinkle, t);
    this.lerpHex(atmosphere.groundMaterial.color, a.ground, b.ground, t);

    // Ambient life weights.
    const w = this.weights;
    w.kites = lerp(a.ambient.kites, b.ambient.kites, t);
    w.birds = lerp(a.ambient.birds, b.ambient.birds, t);
    w.fireworks = lerp(a.ambient.fireworks, b.ambient.fireworks, t);
    w.rain = lerp(a.ambient.rain, b.ambient.rain, t);
    w.skyLanterns = lerp(a.ambient.skyLanterns, b.ambient.skyLanterns, t);
  }

  /** Occasional monsoon lightning: brief hemi + sky flash. */
  private updateLightning(delta: number): void {
    const rain = this.weights.rain;
    if (rain > 0.6) {
      this.lightningTimer -= delta * rain;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = LIGHTNING_INTERVAL * (0.5 + Math.random());
        this.lightning = 1;
      }
    }
    if (this.lightning <= 0) return;
    // Double-strobe decay (ends exactly on the unflashed values).
    this.lightning = Math.max(0, this.lightning - delta * 4.5);
    const strobe = this.lightning > 0.55 ? this.lightning : this.lightning * 0.5;
    const { hemi, atmosphere } = this.bundle;
    hemi.intensity = this.baseHemi * (1 + strobe * 1.6);
    atmosphere.sky.uniforms.uHorizon.value.copy(this.baseSky).multiplyScalar(1 + strobe * 1.2);
  }

  private lerpHex(target: THREE.Color, hexA: number, hexB: number, t: number): void {
    this.ca.setHex(hexA);
    this.cb.setHex(hexB);
    target.copy(this.ca).lerp(this.cb, t);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
