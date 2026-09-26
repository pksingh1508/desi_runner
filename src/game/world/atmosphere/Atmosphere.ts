import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";
import { SkyDome } from "./SkyDome";
import { Skyline } from "./Skyline";
import { Kites } from "./Kites";
import { Birds } from "./Birds";
import { SkyLanterns } from "./SkyLanterns";
import { Fireworks } from "./Fireworks";
import { Rain } from "./Rain";
import { buildBiomeEnvironmentMaps } from "./EnvironmentMaps";

/** Per-frame ambient weights (0..1), blended from the biome pair. */
export interface AmbientWeights {
  kites: number;
  birds: number;
  fireworks: number;
  rain: number;
  skyLanterns: number;
}

/**
 * Everything "global" about the world's atmosphere: sky dome, far skyline,
 * the ground under the city, ambient sky life and the per-biome IBL maps.
 * Created once by GameScene; the BiomeManager writes colors/weights and
 * ticks it every non-paused frame (menu included).
 *
 * Draw calls: sky 1, skyline 1, ground 1, kites 1, birds 1, plus lanterns /
 * fireworks / rain only while their biome is active.
 */
export class Atmosphere {
  readonly sky: SkyDome;
  readonly skyline: Skyline;
  readonly ground: THREE.Mesh;
  readonly groundMaterial: THREE.MeshLambertMaterial;
  readonly kites: Kites;
  readonly birds: Birds;
  readonly skyLanterns: SkyLanterns;
  readonly fireworks: Fireworks;
  readonly rain: Rain;
  readonly envMaps: THREE.Texture[];

  constructor(scene: THREE.Scene, bag: ResourceBag, renderer: THREE.WebGLRenderer) {
    this.sky = new SkyDome(bag, AMBIENT.sky.radius);
    this.skyline = new Skyline(bag);

    this.groundMaterial = bag.mat(new THREE.MeshLambertMaterial({ color: 0x8a7a66 }));
    const groundGeo = bag.geo(new THREE.PlaneGeometry(AMBIENT.ground.size, AMBIENT.ground.size));
    groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(groundGeo, this.groundMaterial);
    this.ground.name = "CityGround";
    this.ground.position.y = AMBIENT.ground.y;
    this.ground.frustumCulled = false;
    this.ground.updateMatrix();
    this.ground.matrixAutoUpdate = false;

    this.kites = new Kites(bag);
    this.birds = new Birds(bag);
    this.skyLanterns = new SkyLanterns(bag);
    this.fireworks = new Fireworks(bag, renderer);
    this.rain = new Rain(bag);
    this.envMaps = buildBiomeEnvironmentMaps(renderer, bag);

    scene.add(
      this.sky.mesh,
      this.skyline.mesh,
      this.ground,
      this.kites.mesh,
      this.birds.mesh,
      this.skyLanterns.mesh,
      this.fireworks.points,
      this.rain.mesh
    );
  }

  /** Fresh scene (new run / back to menu): re-seed the sky life. */
  reset(weights: AmbientWeights, cameraZ: number): void {
    this.kites.respawnAll(weights.kites, cameraZ);
    this.birds.respawnAll(weights.birds, cameraZ);
    this.skyLanterns.respawnAll(cameraZ);
    this.fireworks.clear();
  }

  update(delta: number, worldSpeed: number, weights: AmbientWeights, camera: THREE.Camera): void {
    const camZ = camera.position.z;
    this.sky.uniforms.uTime.value += delta;
    this.kites.update(delta, worldSpeed, weights.kites, camZ);
    this.birds.update(delta, worldSpeed, weights.birds, camZ);
    this.skyLanterns.update(delta, worldSpeed, weights.skyLanterns, camZ);
    this.fireworks.update(delta, weights.fireworks, camera);
    this.rain.update(delta, worldSpeed, weights.rain, camera);
  }
}
