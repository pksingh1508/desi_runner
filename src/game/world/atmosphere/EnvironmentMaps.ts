import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { BIOMES } from "@/game/config/biomes";
import { applySkyPreset, createSkyMaterial, createSkyUniforms } from "./SkyDome";

/**
 * Pre-bakes one PMREM environment per biome from the biome's own sky, so
 * PBR materials (wet asphalt, metal props, the runner, coins) reflect the
 * right sky. Built once at boot; the render targets are released with the
 * ResourceBag.
 */
export function buildBiomeEnvironmentMaps(renderer: THREE.WebGLRenderer, bag: ResourceBag): THREE.Texture[] {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const uniforms = createSkyUniforms(50);
  const material = createSkyMaterial(uniforms);
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const maps = BIOMES.map((biome) => {
    applySkyPreset(uniforms, biome.sky);
    uniforms.uStars.value = 0;
    const target = pmrem.fromScene(scene, 0.015, 0.1, 200, { size: 128 });
    // The bag only tracks textures; tie the render target's lifetime to it.
    const texture = bag.tex(target.texture);
    texture.addEventListener("dispose", () => target.dispose());
    return texture;
  });

  pmrem.dispose();
  geometry.dispose();
  material.dispose();
  return maps;
}
