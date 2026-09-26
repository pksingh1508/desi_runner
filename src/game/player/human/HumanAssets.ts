import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { HumanBody } from "@/game/config/characters";
import { HAIR_MESH, HUMAN_ASSETS, UAL_PELVIS_REST } from "@/game/config/humanRig";
import { disposeObjectTree } from "@/game/utils/dispose";

export type ProgressFn = (ratio: number) => void;

export interface HumanBodyInstance {
  root: THREE.Object3D;
  skinned: THREE.SkinnedMesh;
  eyes: THREE.SkinnedMesh | null;
  eyebrows: THREE.SkinnedMesh | null;
}

/**
 * Loads + caches the realistic runner assets: two base bodies, the shared
 * hairstyle pack and the shared animation library. Bodies are cloned per rig
 * (SkeletonUtils) so any number of runners can exist; geometry and textures
 * stay shared. Clips are retargeted once per body (pelvis re-offset).
 */
export class HumanAssetLibrary {
  private loader = new GLTFLoader();
  private pending = new Map<string, Promise<GLTF>>();
  private loaded = new Map<string, GLTF>();
  private clipCache = new Map<HumanBody, THREE.AnimationClip[]>();
  private disposed = false;

  /** Loads everything a body needs; progress spans all pending files. */
  async prepare(body: HumanBody, onProgress?: ProgressFn): Promise<void> {
    const urls = [HUMAN_ASSETS.animations, HUMAN_ASSETS.hair, HUMAN_ASSETS.bodies[body]];
    const ratios = new Map<string, number>(urls.map((u) => [u, this.loaded.has(u) ? 1 : 0]));
    const report = (): void => {
      if (!onProgress) return;
      let sum = 0;
      for (const r of ratios.values()) sum += r;
      onProgress(sum / urls.length);
    };
    await Promise.all(
      urls.map((url) =>
        this.load(url, (r) => {
          ratios.set(url, r);
          report();
        })
      )
    );
  }

  isReady(body: HumanBody): boolean {
    return (
      this.loaded.has(HUMAN_ASSETS.animations) &&
      this.loaded.has(HUMAN_ASSETS.hair) &&
      this.loaded.has(HUMAN_ASSETS.bodies[body])
    );
  }

  /** Cloned, independently animatable body (shares geometry/textures). */
  createBody(body: HumanBody): HumanBodyInstance {
    const gltf = this.require(HUMAN_ASSETS.bodies[body]);
    const root = cloneSkinned(gltf.scene);
    root.name = `HumanBody_${body}`;
    let skinned: THREE.SkinnedMesh | null = null;
    let eyes: THREE.SkinnedMesh | null = null;
    let eyebrows: THREE.SkinnedMesh | null = null;
    root.traverse((obj) => {
      const mesh = obj as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      mesh.frustumCulled = false; // animated bounds (rolls, dives) differ from bind pose
      const name = mesh.name.toLowerCase();
      if (name.includes("eyebrow")) eyebrows = mesh;
      else if (name.includes("eye")) eyes = mesh;
      else if (!skinned || mesh.geometry.getAttribute("position").count > skinned.geometry.getAttribute("position").count) {
        skinned = mesh;
      }
    });
    if (!skinned) throw new Error(`[DESI RUN] body "${body}" has no skinned mesh`);
    return { root, skinned, eyes, eyebrows };
  }

  /** Source hair mesh (geometry in bind space) — clone the material per rig. */
  hairMesh(style: keyof typeof HAIR_MESH): THREE.Mesh | null {
    const gltf = this.loaded.get(HUMAN_ASSETS.hair);
    if (!gltf) return null;
    const wanted = HAIR_MESH[style];
    let found: THREE.Mesh | null = null;
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!found && mesh.isMesh && (mesh.name === wanted || mesh.parent?.name === wanted)) found = mesh;
    });
    return found;
  }

  /** Animation clips retargeted onto `body` (cached). */
  clipsFor(body: HumanBody): THREE.AnimationClip[] {
    const cached = this.clipCache.get(body);
    if (cached) return cached;
    const anims = this.require(HUMAN_ASSETS.animations);
    const bodyGltf = this.require(HUMAN_ASSETS.bodies[body]);
    let pelvisRest: THREE.Vector3 | null = null;
    bodyGltf.scene.traverse((obj) => {
      if (!pelvisRest && obj.name === "pelvis") pelvisRest = obj.position.clone();
    });
    const rest = pelvisRest ?? new THREE.Vector3(...UAL_PELVIS_REST);
    const dx = rest.x - UAL_PELVIS_REST[0];
    const dy = rest.y - UAL_PELVIS_REST[1];
    const dz = rest.z - UAL_PELVIS_REST[2];
    const clips = anims.animations.map((source) => {
      const clip = source.clone();
      for (const track of clip.tracks) {
        if (track.name !== "pelvis.position") continue;
        const values = track.values;
        for (let i = 0; i < values.length; i += 3) {
          values[i] += dx;
          values[i + 1] += dy;
          values[i + 2] += dz;
        }
      }
      return clip;
    });
    this.clipCache.set(body, clips);
    return clips;
  }

  private require(url: string): GLTF {
    const gltf = this.loaded.get(url);
    if (!gltf) throw new Error(`[DESI RUN] asset not loaded yet: ${url}`);
    return gltf;
  }

  private load(url: string, onProgress?: ProgressFn): Promise<GLTF> {
    const existing = this.pending.get(url);
    if (existing) {
      if (this.loaded.has(url)) onProgress?.(1);
      return existing;
    }
    const promise = new Promise<GLTF>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          if (this.disposed) {
            disposeObjectTree(gltf.scene);
            reject(new Error("asset library disposed"));
            return;
          }
          this.loaded.set(url, gltf);
          onProgress?.(1);
          resolve(gltf);
        },
        (event) => {
          if (event.total > 0) onProgress?.(Math.min(0.99, event.loaded / event.total));
        },
        (error) => {
          this.pending.delete(url);
          reject(new Error(`Failed to load "${url}": ${error instanceof Error ? error.message : String(error)}`));
        }
      );
    });
    this.pending.set(url, promise);
    return promise;
  }

  dispose(): void {
    this.disposed = true;
    for (const gltf of this.loaded.values()) disposeObjectTree(gltf.scene);
    this.loaded.clear();
    this.pending.clear();
    this.clipCache.clear();
  }
}
