import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface LoadedAssets {
  character: GLTF;
}

export type ProgressCallback = (ratio: number, label: string) => void;

/**
 * Centralized loader with byte-level progress reporting and graceful failure.
 */
export class AssetManager {
  private loader = new GLTFLoader();

  constructor(private onProgress: ProgressCallback) {}

  loadAll(urls: { character: string }): Promise<LoadedAssets> {
    return this.loadGLTF(urls.character, "LOADING RUNNER").then((character) => ({
      character,
    }));
  }

  private loadGLTF(url: string, label: string): Promise<GLTF> {
    this.onProgress(0, label);
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf),
        (event) => {
          if (event.total > 0) {
            this.onProgress(event.loaded / event.total, label);
          }
        },
        (error) =>
          reject(
            new Error(
              `Failed to load asset "${url}": ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          )
      );
    });
  }
}
