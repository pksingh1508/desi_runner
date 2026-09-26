import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { CAMERA_CFG } from "@/game/config/gameplay";
import { BIOMES } from "@/game/config/biomes";
import { Atmosphere } from "@/game/world/atmosphere/Atmosphere";

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  rim: THREE.DirectionalLight;
  playerGlow: THREE.PointLight;
  /** Sky dome, far skyline, ground, ambient sky life, per-biome IBL. */
  atmosphere: Atmosphere;
  resize(aspect: number): void;
}

/**
 * Builds scene, fog, lights, camera and the global atmosphere (sky,
 * skyline, kites/birds/fireworks/rain, environment maps). Street decor lives
 * on the recycled track segments; colors are driven by the BiomeManager.
 */
export function createSceneAndCamera(bag: ResourceBag, renderer: THREE.WebGLRenderer): SceneBundle {
  const first = BIOMES[0];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(first.fog);
  scene.fog = new THREE.Fog(first.fog, first.fogNear, first.fogFar);

  // Near 0.2 keeps depth precision for flat street decals; the sky dome
  // (r = 480) sits inside the far plane.
  const camera = new THREE.PerspectiveCamera(CAMERA_CFG.fovNormal, 1, 0.2, 700);
  camera.position.set(CAMERA_CFG.offset.x, CAMERA_CFG.offset.y, CAMERA_CFG.offset.z);
  camera.lookAt(CAMERA_CFG.lookOffset.x, CAMERA_CFG.lookOffset.y, CAMERA_CFG.lookOffset.z);

  const hemi = new THREE.HemisphereLight(first.hemiSky, first.hemiGround, first.hemiIntensity);
  scene.add(hemi);

  // Key light: the single shadow caster, framed tightly around the runner.
  const sun = new THREE.DirectionalLight(first.sunColor, first.sunIntensity);
  sun.position.set(7, 18, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -52;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Rim / backlight from ahead-left: golden-hour sun, festival glow at night.
  const rim = new THREE.DirectionalLight(first.rimColor, first.rimIntensity);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // Warm glow that follows the player (position synced by Game each frame).
  const playerGlow = new THREE.PointLight(first.glowColor, first.glowIntensity, 12, 1.8);
  playerGlow.position.set(0, 3, 1.5);
  scene.add(playerGlow);

  const atmosphere = new Atmosphere(scene, bag, renderer);
  scene.environment = atmosphere.envMaps[0];
  scene.environmentIntensity = first.envIntensity;

  return {
    scene,
    camera,
    sun,
    hemi,
    rim,
    playerGlow,
    atmosphere,
    resize(aspect: number) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
