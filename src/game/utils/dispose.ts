import * as THREE from "three";

/**
 * Tracks GPU resources owned by a Game instance so everything can be
 * released deterministically on teardown (unmount / hot reload).
 * Module-level shared resources intentionally live for the session.
 */
export class ResourceBag {
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  geo<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  mat<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  tex<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries = [];
    this.materials = [];
    this.textures = [];
  }
}

/** Recursively dispose resources attached to an object tree (per-instance ones). */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] })
      .material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}
