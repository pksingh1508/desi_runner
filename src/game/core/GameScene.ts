import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { COLORS, WORLD } from "@/game/config/gameplay";

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  rim: THREE.DirectionalLight;
  playerGlow: THREE.PointLight;
  starsMaterial: THREE.PointsMaterial;
  resize(aspect: number): void;
}

/**
 * Builds scene, fog, lights and camera.
 * The distant skyline / star field live on recycled track segments instead,
 * so everything visible here is global atmosphere only.
 */
export function createSceneAndCamera(bag: ResourceBag): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.backgroundColor);
  scene.fog = new THREE.Fog(WORLD.backgroundColor, WORLD.fogNear, WORLD.fogFar);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  camera.position.set(0, 4.7, 8.2);
  camera.lookAt(0, 1.5, -7.5);

  const hemi = new THREE.HemisphereLight(0xd6f0ff, 0xfff2cc, 1.42);
  scene.add(hemi);

  // Key light: bright daylight sun (Subway Surfers outdoor style).
  const sun = new THREE.DirectionalLight(0xfffdf5, 3.15);
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
  // Crisp daylight shadows for high outdoor readability.
  scene.add(sun);
  scene.add(sun.target);

  // Soft cyan sky rim from behind-left to separate the runner from the road.
  const rim = new THREE.DirectionalLight(0x6aeefd, 0.52);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // Warm glow that follows the player (position synced by Game each frame).
  const playerGlow = new THREE.PointLight(COLORS.signalLime, 10, 12, 1.8);
  playerGlow.position.set(0, 3, 1.5);
  scene.add(playerGlow);

  buildStars(scene, bag);

  return {
    scene,
    camera,
    sun,
    hemi,
    rim,
    playerGlow,
    starsMaterial: starsMaterialRef!,
    resize(aspect: number) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}

let starsMaterialRef: THREE.PointsMaterial | null = null;

function buildStars(scene: THREE.Scene, bag: ResourceBag): void {
  const count = 280;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere shell — kept very sparse for daylight; opacity stays ~0.05.
    const radius = 260 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const elevation = 0.18 + Math.random() * 1.2;
    positions[i * 3] = Math.cos(theta) * Math.cos(elevation) * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius;
    positions[i * 3 + 2] = Math.sin(theta) * Math.cos(elevation) * radius;
  }
  const geometry = bag.geo(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = bag.mat(
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.35,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  starsMaterialRef = material;
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  scene.add(stars);
}
