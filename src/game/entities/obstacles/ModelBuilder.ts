import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Material "layers" shared by every procedural street prop. Parts are merged
 * per layer, so a whole cow / truck / arch renders in a handful of draw
 * calls while keeping per-part colors (vertex colors).
 */
export type MaterialLayer =
  | "paint"
  | "metal"
  | "glow"
  | "art"
  | "cloth"
  | "clothArt"
  | "glass";

export type Vec3 = readonly [number, number, number];

/** Atlas sub-rectangle in UV space (v0 = bottom). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Compact transform: position, Euler XYZ rotation (radians), scale. */
export interface Xf {
  p?: Vec3;
  r?: Vec3;
  s?: Vec3 | number;
}

export interface AddOptions {
  /** Remap the primitive's 0..1 UVs into this atlas rect. */
  uv?: UvRect;
  /**
   * Planar UV projection (model-space x/y → atlas rect) for flat art faces
   * whose native UVs are not 0..1 (shapes, extrusions).
   */
  planar?: { x0: number; x1: number; y0: number; y1: number; rect: UvRect };
  /** Skip the baked ground-contact darkening for this primitive. */
  noAo?: boolean;
}

export interface BuiltLayerMesh {
  layer: MaterialLayer;
  geometry: THREE.BufferGeometry;
}

export interface BuiltPart {
  name: string;
  pivot: THREE.Vector3;
  meshes: BuiltLayerMesh[];
}

export interface BuiltModel {
  parts: BuiltPart[];
  triangles: number;
}

export interface AoOptions {
  /** Height (m) over which the contact darkening fades out. */
  height: number;
  /** Brightness multiplier at y = 0. */
  min: number;
}

interface LayerBuffers {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
}

interface PartAccum {
  name: string;
  pivot: THREE.Vector3;
  layers: Map<MaterialLayer, LayerBuffers>;
}

const LAYER_ORDER: readonly MaterialLayer[] = [
  "paint",
  "metal",
  "cloth",
  "art",
  "clothArt",
  "glow",
  "glass",
];

// Build-time scratch (never used in per-frame code).
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

function composeXf(xf: Xf | undefined, out: THREE.Matrix4): THREE.Matrix4 {
  const p = xf?.p ?? [0, 0, 0];
  const r = xf?.r ?? [0, 0, 0];
  const s = xf?.s ?? 1;
  _p.set(p[0], p[1], p[2]);
  _e.set(r[0], r[1], r[2], "XYZ");
  _q.setFromEuler(_e);
  if (typeof s === "number") _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return out.compose(_p, _q, _s);
}

function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * Accumulates primitives (in model space) into per-part, per-layer vertex
 * buffers and bakes them into merged, non-indexed geometries. Everything
 * here runs once per variant per Game session — never per frame.
 */
export class ModelBuilder {
  private parts: PartAccum[] = [];
  private current: PartAccum;

  constructor(private ao: AoOptions | null = { height: 0.45, min: 0.58 }) {
    this.current = { name: "base", pivot: new THREE.Vector3(), layers: new Map() };
    this.parts.push(this.current);
  }

  /** Subsequent primitives belong to an animated part pivoting at (x,y,z). */
  part(name: string, x = 0, y = 0, z = 0): this {
    let found = this.parts.find((p) => p.name === name);
    if (!found) {
      found = { name, pivot: new THREE.Vector3(x, y, z), layers: new Map() };
      this.parts.push(found);
    }
    this.current = found;
    return this;
  }

  /** Back to the static base part. */
  base(): this {
    this.current = this.parts[0];
    return this;
  }

  // ------------------------------------------------------------ primitives

  /** Adds (and disposes) a geometry transformed into model space. */
  add(
    layer: MaterialLayer,
    geometry: THREE.BufferGeometry,
    color: number,
    xf?: Xf,
    opts?: AddOptions
  ): this {
    composeXf(xf, _m);
    this.addMatrix(layer, geometry, color, _m, opts);
    return this;
  }

  box(layer: MaterialLayer, color: number, size: Vec3, xf?: Xf, opts?: AddOptions): this {
    return this.add(layer, new THREE.BoxGeometry(size[0], size[1], size[2]), color, xf, opts);
  }

  /** Chamfered box for chunky, bevel-ish silhouettes. */
  rbox(
    layer: MaterialLayer,
    color: number,
    size: Vec3,
    radius: number,
    xf?: Xf,
    opts?: AddOptions,
    segments = 1
  ): this {
    const r = Math.min(radius, size[0] / 2, size[1] / 2, size[2] / 2) * 0.999;
    return this.add(
      layer,
      new RoundedBoxGeometry(size[0], size[1], size[2], segments, r),
      color,
      xf,
      opts
    );
  }

  cyl(
    layer: MaterialLayer,
    color: number,
    rTop: number,
    rBottom: number,
    height: number,
    xf?: Xf,
    radial = 10,
    opts?: AddOptions,
    openEnded = false
  ): this {
    return this.add(
      layer,
      new THREE.CylinderGeometry(rTop, rBottom, height, radial, 1, openEnded),
      color,
      xf,
      opts
    );
  }

  sphere(
    layer: MaterialLayer,
    color: number,
    radius: number,
    xf?: Xf,
    wSeg = 10,
    hSeg = 7,
    opts?: AddOptions
  ): this {
    return this.add(layer, new THREE.SphereGeometry(radius, wSeg, hSeg), color, xf, opts);
  }

  /** Low-poly bead / fruit (20 triangles at detail 0). */
  ico(layer: MaterialLayer, color: number, radius: number, xf?: Xf, detail = 0, opts?: AddOptions): this {
    return this.add(layer, new THREE.IcosahedronGeometry(radius, detail), color, xf, opts);
  }

  torus(
    layer: MaterialLayer,
    color: number,
    radius: number,
    tube: number,
    xf?: Xf,
    radialSeg = 6,
    tubularSeg = 18,
    arc = Math.PI * 2,
    opts?: AddOptions
  ): this {
    return this.add(
      layer,
      new THREE.TorusGeometry(radius, tube, radialSeg, tubularSeg, arc),
      color,
      xf,
      opts
    );
  }

  cone(layer: MaterialLayer, color: number, radius: number, height: number, xf?: Xf, radial = 8, opts?: AddOptions): this {
    return this.add(layer, new THREE.ConeGeometry(radius, height, radial), color, xf, opts);
  }

  plane(layer: MaterialLayer, color: number, w: number, h: number, xf?: Xf, opts?: AddOptions, wSeg = 1, hSeg = 1): this {
    return this.add(layer, new THREE.PlaneGeometry(w, h, wSeg, hSeg), color, xf, opts);
  }

  /** Solid of revolution around +Y from (radius, y) profile points. */
  lathe(layer: MaterialLayer, color: number, profile: readonly [number, number][], xf?: Xf, segments = 12, opts?: AddOptions): this {
    const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
    return this.add(layer, new THREE.LatheGeometry(points, segments), color, xf, opts);
  }

  /** Flat 2D shape (XY plane, facing +Z). */
  shape(layer: MaterialLayer, color: number, shape: THREE.Shape, xf?: Xf, opts?: AddOptions, curveSegments = 10): this {
    return this.add(layer, new THREE.ShapeGeometry(shape, curveSegments), color, xf, opts);
  }

  /** Extruded 2D shape (depth along +Z). */
  extrude(layer: MaterialLayer, color: number, shape: THREE.Shape, depth: number, xf?: Xf, opts?: AddOptions, curveSegments = 10): this {
    return this.add(
      layer,
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments }),
      color,
      xf,
      opts
    );
  }

  /** Thin tube along a smooth curve through the given points. */
  tube(layer: MaterialLayer, color: number, points: readonly Vec3[], radius: number, segments = 16, radial = 5, opts?: AddOptions): this {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return this.add(layer, new THREE.TubeGeometry(curve, segments, radius, radial, false), color, undefined, opts);
  }

  /** Cylinder spanning two model-space points (frames, legs, ropes, rails). */
  rod(
    layer: MaterialLayer,
    color: number,
    a: Vec3,
    b: Vec3,
    radius: number,
    radial = 6,
    opts?: AddOptions,
    radiusB = radius
  ): this {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = _dir.length();
    if (length < 1e-5) return this;
    _dir.divideScalar(length);
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    // CylinderGeometry(top, bottom): top sits at +Y (toward b).
    this.addMatrix(layer, new THREE.CylinderGeometry(radiusB, radius, length, radial, 1), color, _m, opts);
    return this;
  }

  // ------------------------------------------------------------------ bake

  build(): BuiltModel {
    const parts: BuiltPart[] = [];
    let triangles = 0;
    for (const accum of this.parts) {
      const meshes: BuiltLayerMesh[] = [];
      for (const layer of LAYER_ORDER) {
        const buf = accum.layers.get(layer);
        if (!buf || buf.pos.length === 0) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buf.nor, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(buf.col, 3));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        triangles += buf.pos.length / 9;
        meshes.push({ layer, geometry });
      }
      if (meshes.length > 0 || accum.name !== "base") {
        parts.push({ name: accum.name, pivot: accum.pivot.clone(), meshes });
      }
    }
    this.parts = [];
    return { parts, triangles };
  }

  // ---------------------------------------------------------------- intern

  private buffersFor(layer: MaterialLayer): LayerBuffers {
    let buf = this.current.layers.get(layer);
    if (!buf) {
      buf = { pos: [], nor: [], uv: [], col: [] };
      this.current.layers.set(layer, buf);
    }
    return buf;
  }

  private addMatrix(
    layer: MaterialLayer,
    geometry: THREE.BufferGeometry,
    color: number,
    matrix: THREE.Matrix4,
    opts?: AddOptions
  ): void {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const flip = matrix.determinant() < 0;
    _nm.getNormalMatrix(matrix);
    _c.setHex(color);
    const buf = this.buffersFor(layer);
    const pivot = this.current.pivot;
    const rect = opts?.uv;
    const planar = opts?.planar;
    const ao = opts?.noAo ? null : this.ao;

    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        // Mirrored transforms flip winding — swap two corners to keep CCW.
        const corner = flip ? (k === 0 ? 0 : 3 - k) : k;
        const vi = index ? index.getX(t + corner) : t + corner;
        _v.fromBufferAttribute(position, vi).applyMatrix4(matrix);
        if (normal) {
          _n.fromBufferAttribute(normal, vi).applyMatrix3(_nm).normalize();
        } else {
          _n.set(0, 1, 0);
        }
        let u = uv ? uv.getX(vi) : 0;
        let w = uv ? uv.getY(vi) : 0;
        if (planar) {
          const pu = (_v.x - planar.x0) / (planar.x1 - planar.x0);
          const pv = (_v.y - planar.y0) / (planar.y1 - planar.y0);
          u = planar.rect.u0 + pu * (planar.rect.u1 - planar.rect.u0);
          w = planar.rect.v0 + pv * (planar.rect.v1 - planar.rect.v0);
        } else if (rect) {
          u = rect.u0 + u * (rect.u1 - rect.u0);
          w = rect.v0 + w * (rect.v1 - rect.v0);
        }
        const shade = ao ? ao.min + (1 - ao.min) * smooth01(_v.y / ao.height) : 1;
        buf.pos.push(_v.x - pivot.x, _v.y - pivot.y, _v.z - pivot.z);
        buf.nor.push(_n.x, _n.y, _n.z);
        buf.uv.push(u, w);
        buf.col.push(_c.r * shade, _c.g * shade, _c.b * shade);
      }
    }
    geometry.dispose();
  }
}

// ----------------------------------------------------------- instantiation

export interface ModelInstance {
  root: THREE.Group;
  /** Pivot groups of named parts (the base part lives on root). */
  parts: Map<string, THREE.Object3D>;
}

/**
 * Wraps a built model's shared geometries in meshes (per instance — cheap:
 * no geometry or material is duplicated).
 */
export function instantiateModel(
  model: BuiltModel,
  materialFor: (layer: MaterialLayer) => THREE.Material,
  configure?: (mesh: THREE.Mesh, layer: MaterialLayer, partName: string) => void
): ModelInstance {
  const root = new THREE.Group();
  const parts = new Map<string, THREE.Object3D>();
  for (const part of model.parts) {
    let holder: THREE.Object3D = root;
    if (part.name !== "base") {
      const pivot = new THREE.Group();
      pivot.name = part.name;
      pivot.position.copy(part.pivot);
      root.add(pivot);
      parts.set(part.name, pivot);
      holder = pivot;
    }
    for (const built of part.meshes) {
      const mesh = new THREE.Mesh(built.geometry, materialFor(built.layer));
      configure?.(mesh, built.layer, part.name);
      holder.add(mesh);
    }
  }
  return { root, parts };
}

/**
 * Vertex colors drive per-part paint; this also lets them tint emissive, so
 * a material's emissive "lift" makes each part glow in its own color
 * instead of a flat white wash. Set emissive to white and drive
 * emissiveIntensity.
 */
export function withVertexColorEmissive<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      [
        "#include <emissivemap_fragment>",
        "#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )",
        "\ttotalEmissiveRadiance *= vColor.rgb;",
        "#endif",
      ].join("\n")
    );
  };
  material.customProgramCacheKey = () => "desi-vcolor-emissive";
  return material;
}
