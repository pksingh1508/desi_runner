import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { COLORS, WORLD } from "@/game/config/gameplay";

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  playerGlow: THREE.PointLight;
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

  const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x140a24, 1.15);
  scene.add(hemi);

  // Key light: single shadow-casting directional sun over the play area.
  const sun = new THREE.DirectionalLight(0xbfe8ff, 2.2);
  sun.position.set(7, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Subtle magenta rim from behind-left to separate the runner from the road.
  const rim = new THREE.DirectionalLight(0xa64bff, 0.85);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // Warm glow that follows the player (position synced by Game each frame).
  const playerGlow = new THREE.PointLight(COLORS.neonCyan, 14, 12, 1.8);
  playerGlow.position.set(0, 3, 1.5);
  scene.add(playerGlow);

  buildStars(scene, bag);

  return {
    scene,
    camera,
    sun,
    playerGlow,
    resize(aspect: number) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}

function buildStars(scene: THREE.Scene, bag: ResourceBag): void {
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere shell, far away so fog does not reach it.
    const radius = 240 + Math.random() * 160;
    const theta = Math.random() * Math.PI * 2;
    const elevation = 0.12 + Math.random() * 1.35; // radians above horizon
    positions[i * 3] = Math.cos(theta) * Math.cos(elevation) * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius;
    positions[i * 3 + 2] = Math.sin(theta) * Math.cos(elevation) * radius;
  }
  const geometry = bag.geo(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = bag.mat(
    new THREE.PointsMaterial({
      color: 0xbfe3ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  scene.add(stars);
}
