import * as THREE from "three";

/** Atlas sub-rectangle. v0 = visual bottom of the cell, v1 = visual top. */
export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export type Vec3 = readonly [number, number, number];

export const FACE_PX = 1;
export const FACE_NX = 2;
export const FACE_PY = 4;
export const FACE_NY = 8;
export const FACE_PZ = 16;
export const FACE_NZ = 32;
export const FACE_ALL = 63;

/** Per-face UV override for boxes; missing faces fall back to `all`. */
export interface BoxUvs {
  all: UvRect;
  px?: UvRect;
  nx?: UvRect;
  py?: UvRect;
  ny?: UvRect;
  pz?: UvRect;
  nz?: UvRect;
}

/** Steady (non-twinkling) vertex alpha. Lower values encode a twinkle phase. */
export const STEADY_ALPHA = 255;

/**
 * Boot-time mesh baker. Everything a street variant needs (facades, props,
 * wires, flags…) is appended into one indexed geometry with atlas UVs and
 * RGBA vertex colors (rgb = tint, a = light twinkle phase) so a whole
 * variant renders in a single draw call. Only used while loading — the
 * per-frame game loop never touches this.
 */
export class GeometryBuilder {
  /** Current vertex tint (0xRRGGBB). */
  color = 0xffffff;
  /** Current vertex alpha byte (255 = steady light, else twinkle phase). */
  alpha = STEADY_ALPHA;

  private pos: number[] = [];
  private nrm: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  private matrix = new THREE.Matrix4();
  private normalMatrix = new THREE.Matrix3();
  private stack: THREE.Matrix4[] = [];
  private identity = true;

  private tv = new THREE.Vector3();
  private tn = new THREE.Vector3();
  private tm = new THREE.Matrix4();
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  // ------------------------------------------------------------- transforms

  push(): this {
    this.stack.push(this.matrix.clone());
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.matrix.copy(m);
    this.syncMatrix();
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this.matrix.multiply(this.tm.makeTranslation(x, y, z));
    this.syncMatrix();
    return this;
  }

  rotateX(angle: number): this {
    this.matrix.multiply(this.tm.makeRotationX(angle));
    this.syncMatrix();
    return this;
  }

  rotateY(angle: number): this {
    this.matrix.multiply(this.tm.makeRotationY(angle));
    this.syncMatrix();
    return this;
  }

  rotateZ(angle: number): this {
    this.matrix.multiply(this.tm.makeRotationZ(angle));
    this.syncMatrix();
    return this;
  }

  scale(x: number, y: number, z: number): this {
    this.matrix.multiply(this.tm.makeScale(x, y, z));
    this.syncMatrix();
    return this;
  }

  /** Temporarily set tint (and optionally alpha) for a callback. */
  withColor(color: number, fn: () => void, alpha = this.alpha): this {
    const pc = this.color;
    const pa = this.alpha;
    this.color = color;
    this.alpha = alpha;
    fn();
    this.color = pc;
    this.alpha = pa;
    return this;
  }

  // ------------------------------------------------------------- primitives

  /** Planar quad a→b→c→d (counter-clockwise seen from the front). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, uv: UvRect): this {
    this.e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.e2.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    this.e1.cross(this.e2).normalize();
    const nx = this.e1.x;
    const ny = this.e1.y;
    const nz = this.e1.z;
    const i0 = this.vtx(a[0], a[1], a[2], nx, ny, nz, uv.u0, uv.v0);
    const i1 = this.vtx(b[0], b[1], b[2], nx, ny, nz, uv.u1, uv.v0);
    const i2 = this.vtx(c[0], c[1], c[2], nx, ny, nz, uv.u1, uv.v1);
    const i3 = this.vtx(d[0], d[1], d[2], nx, ny, nz, uv.u0, uv.v1);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  /** Quad visible from both sides (flags, cloth, strings of lights). */
  quad2(a: Vec3, b: Vec3, c: Vec3, d: Vec3, uv: UvRect): this {
    this.quad(a, b, c, d, uv);
    // Back face: same per-vertex UVs, reversed winding.
    this.e1.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    this.e2.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.e1.cross(this.e2).normalize();
    const nx = this.e1.x;
    const ny = this.e1.y;
    const nz = this.e1.z;
    const i0 = this.vtx(a[0], a[1], a[2], nx, ny, nz, uv.u0, uv.v0);
    const i1 = this.vtx(d[0], d[1], d[2], nx, ny, nz, uv.u0, uv.v1);
    const i2 = this.vtx(c[0], c[1], c[2], nx, ny, nz, uv.u1, uv.v1);
    const i3 = this.vtx(b[0], b[1], b[2], nx, ny, nz, uv.u1, uv.v0);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  /** Single triangle with explicit UVs, optionally double sided. */
  tri(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    uvA: readonly [number, number],
    uvB: readonly [number, number],
    uvC: readonly [number, number],
    doubleSided = false
  ): this {
    this.e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.e1.cross(this.e2).normalize();
    const nx = this.e1.x;
    const ny = this.e1.y;
    const nz = this.e1.z;
    const i0 = this.vtx(a[0], a[1], a[2], nx, ny, nz, uvA[0], uvA[1]);
    const i1 = this.vtx(b[0], b[1], b[2], nx, ny, nz, uvB[0], uvB[1]);
    const i2 = this.vtx(c[0], c[1], c[2], nx, ny, nz, uvC[0], uvC[1]);
    this.idx.push(i0, i1, i2);
    if (doubleSided) {
      const j0 = this.vtx(a[0], a[1], a[2], -nx, -ny, -nz, uvA[0], uvA[1]);
      const j1 = this.vtx(c[0], c[1], c[2], -nx, -ny, -nz, uvC[0], uvC[1]);
      const j2 = this.vtx(b[0], b[1], b[2], -nx, -ny, -nz, uvB[0], uvB[1]);
      this.idx.push(j0, j1, j2);
    }
    return this;
  }

  /**
   * Axis-aligned box between two corners (in the current transform).
   * Face texture orientation: text reads correctly when viewed from outside.
   */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    uv: UvRect | BoxUvs,
    faces = FACE_ALL
  ): this {
    // Accept corners in any order (reversed extents would turn the box
    // inside out and back-face culling would hide it).
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const uvs = isBoxUvs(uv) ? uv : undefined;
    const base = uvs ? uvs.all : (uv as UvRect);
    if (faces & FACE_PX) {
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uvs?.px ?? base);
    }
    if (faces & FACE_NX) {
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uvs?.nx ?? base);
    }
    if (faces & FACE_PZ) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uvs?.pz ?? base);
    }
    if (faces & FACE_NZ) {
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uvs?.nz ?? base);
    }
    if (faces & FACE_PY) {
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uvs?.py ?? base);
    }
    if (faces & FACE_NY) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uvs?.ny ?? base);
    }
    return this;
  }

  /** Box by center + size (convenience). */
  boxAt(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    uv: UvRect | BoxUvs,
    faces = FACE_ALL
  ): this {
    return this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, uv, faces);
  }

  /** Vertical (frustum) cylinder standing on y0. Smooth side normals. */
  cylinder(
    cx: number,
    y0: number,
    cz: number,
    radiusBottom: number,
    radiusTop: number,
    height: number,
    segments: number,
    uv: UvRect,
    capTop = true,
    capBottom = false
  ): this {
    const slope = (radiusBottom - radiusTop) / Math.max(height, 1e-4);
    const y1 = y0 + height;
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(t0);
      const s0 = Math.sin(t0);
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      const u0 = uv.u1 - (i / segments) * (uv.u1 - uv.u0);
      const u1 = uv.u1 - ((i + 1) / segments) * (uv.u1 - uv.u0);
      // Order: B1, B0, T0, T1 (counter-clockwise from outside).
      const a = this.vtx(cx + c1 * radiusBottom, y0, cz + s1 * radiusBottom, c1, slope, s1, u1, uv.v0);
      const b = this.vtx(cx + c0 * radiusBottom, y0, cz + s0 * radiusBottom, c0, slope, s0, u0, uv.v0);
      const c = this.vtx(cx + c0 * radiusTop, y1, cz + s0 * radiusTop, c0, slope, s0, u0, uv.v1);
      const d = this.vtx(cx + c1 * radiusTop, y1, cz + s1 * radiusTop, c1, slope, s1, u1, uv.v1);
      this.idx.push(a, b, c, a, c, d);
    }
    const uc = (uv.u0 + uv.u1) / 2;
    const vc = (uv.v0 + uv.v1) / 2;
    if (capTop && radiusTop > 0) {
      const center = this.vtx(cx, y1, cz, 0, 1, 0, uc, vc);
      for (let i = 0; i < segments; i++) {
        const t0 = (i / segments) * Math.PI * 2;
        const t1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = this.vtx(cx + Math.cos(t0) * radiusTop, y1, cz + Math.sin(t0) * radiusTop, 0, 1, 0, uc, uv.v1);
        const p1 = this.vtx(cx + Math.cos(t1) * radiusTop, y1, cz + Math.sin(t1) * radiusTop, 0, 1, 0, uc, uv.v1);
        this.idx.push(center, p1, p0);
      }
    }
    if (capBottom && radiusBottom > 0) {
      const center = this.vtx(cx, y0, cz, 0, -1, 0, uc, vc);
      for (let i = 0; i < segments; i++) {
        const t0 = (i / segments) * Math.PI * 2;
        const t1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = this.vtx(cx + Math.cos(t0) * radiusBottom, y0, cz + Math.sin(t0) * radiusBottom, 0, -1, 0, uc, uv.v0);
        const p1 = this.vtx(cx + Math.cos(t1) * radiusBottom, y0, cz + Math.sin(t1) * radiusBottom, 0, -1, 0, uc, uv.v0);
        this.idx.push(center, p0, p1);
      }
    }
    return this;
  }

  /**
   * Ellipsoid / dome. `phiMax` = PI for a full sphere, PI/2 for a dome
   * (upper hemisphere). Smooth normals.
   */
  sphere(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    widthSegments: number,
    heightSegments: number,
    uv: UvRect,
    phiMax = Math.PI
  ): this {
    const rows: number[][] = [];
    for (let j = 0; j <= heightSegments; j++) {
      const phi = (j / heightSegments) * phiMax;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      const row: number[] = [];
      for (let i = 0; i <= widthSegments; i++) {
        const theta = (i / widthSegments) * Math.PI * 2;
        const nx = sp * Math.cos(theta);
        const nz = sp * Math.sin(theta);
        const u = uv.u1 - (i / widthSegments) * (uv.u1 - uv.u0);
        const v = uv.v1 - (j / heightSegments) * (uv.v1 - uv.v0);
        row.push(this.vtx(cx + nx * rx, cy + cp * ry, cz + nz * rz, nx, cp, nz, u, v));
      }
      rows.push(row);
    }
    for (let j = 0; j < heightSegments; j++) {
      for (let i = 0; i < widthSegments; i++) {
        const a = rows[j + 1][i + 1];
        const b = rows[j + 1][i];
        const c = rows[j][i];
        const d = rows[j][i + 1];
        this.idx.push(a, b, c, a, c, d);
      }
    }
    return this;
  }

  /** Flat disc facing +Y with circular UV mapping into `uv`. */
  discY(cx: number, cy: number, cz: number, radius: number, segments: number, uv: UvRect): this {
    const uc = (uv.u0 + uv.u1) / 2;
    const vc = (uv.v0 + uv.v1) / 2;
    const hu = (uv.u1 - uv.u0) / 2;
    const hv = (uv.v1 - uv.v0) / 2;
    const center = this.vtx(cx, cy, cz, 0, 1, 0, uc, vc);
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      // Screen-up = -Z when looking down, so v follows -sin.
      const p0 = this.vtx(cx + Math.cos(t0) * radius, cy, cz + Math.sin(t0) * radius, 0, 1, 0, uc + Math.cos(t0) * hu, vc - Math.sin(t0) * hv);
      const p1 = this.vtx(cx + Math.cos(t1) * radius, cy, cz + Math.sin(t1) * radius, 0, 1, 0, uc + Math.cos(t1) * hu, vc - Math.sin(t1) * hv);
      this.idx.push(center, p1, p0);
    }
    return this;
  }

  /**
   * Double-sided flat disc in the local YZ plane (facing ±X) — wheels seen
   * from the side. Circular UV mapping into `uv`.
   */
  discX(cx: number, cy: number, cz: number, radius: number, segments: number, uv: UvRect): this {
    const uc = (uv.u0 + uv.u1) / 2;
    const vc = (uv.v0 + uv.v1) / 2;
    const hu = (uv.u1 - uv.u0) / 2;
    const hv = (uv.v1 - uv.v0) / 2;
    for (const side of [1, -1]) {
      const center = this.vtx(cx, cy, cz, side, 0, 0, uc, vc);
      for (let i = 0; i < segments; i++) {
        const t0 = (i / segments) * Math.PI * 2;
        const t1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = this.vtx(cx, cy + Math.sin(t0) * radius, cz + Math.cos(t0) * radius, side, 0, 0, uc + Math.cos(t0) * hu, vc + Math.sin(t0) * hv);
        const p1 = this.vtx(cx, cy + Math.sin(t1) * radius, cz + Math.cos(t1) * radius, side, 0, 0, uc + Math.cos(t1) * hu, vc + Math.sin(t1) * hv);
        if (side > 0) this.idx.push(center, p1, p0);
        else this.idx.push(center, p0, p1);
      }
    }
    return this;
  }

  /**
   * Thin closed tube through `points` (triangular cross-section) — wires,
   * ropes, railings. Visible from every angle with single-sided faces.
   */
  tube(points: readonly Vec3[], radius: number, uv: UvRect, sides = 3): this {
    const dir = this.e1;
    const side = this.e2;
    const up = this.tn;
    for (let p = 0; p < points.length - 1; p++) {
      const a = points[p];
      const b = points[p + 1];
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = dir.length();
      if (len < 1e-5) continue;
      dir.divideScalar(len);
      side.set(0, 1, 0).cross(dir);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(dir);
      side.normalize();
      up.copy(dir).cross(side).normalize();
      const ring: [number, number, number, number, number, number][] = [];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2 + Math.PI / 2;
        const ox = side.x * Math.cos(ang) + up.x * Math.sin(ang);
        const oy = side.y * Math.cos(ang) + up.y * Math.sin(ang);
        const oz = side.z * Math.cos(ang) + up.z * Math.sin(ang);
        ring.push([ox * radius, oy * radius, oz * radius, ox, oy, oz]);
      }
      for (let s = 0; s < sides; s++) {
        const r0 = ring[s];
        const r1 = ring[(s + 1) % sides];
        const nx = r0[3] + r1[3];
        const ny = r0[4] + r1[4];
        const nz = r0[5] + r1[5];
        const nl = Math.hypot(nx, ny, nz) || 1;
        const i0 = this.vtx(a[0] + r0[0], a[1] + r0[1], a[2] + r0[2], nx / nl, ny / nl, nz / nl, uv.u0, uv.v0);
        const i1 = this.vtx(b[0] + r0[0], b[1] + r0[1], b[2] + r0[2], nx / nl, ny / nl, nz / nl, uv.u1, uv.v0);
        const i2 = this.vtx(b[0] + r1[0], b[1] + r1[1], b[2] + r1[2], nx / nl, ny / nl, nz / nl, uv.u1, uv.v1);
        const i3 = this.vtx(a[0] + r1[0], a[1] + r1[1], a[2] + r1[2], nx / nl, ny / nl, nz / nl, uv.u0, uv.v1);
        this.idx.push(i0, i2, i1, i0, i3, i2);
      }
    }
    return this;
  }

  /**
   * Strip hanging below a polyline (garlands, bulb strings, bunting rope
   * decorations). One atlas cell per piece; double sided.
   */
  hangingStrip(points: readonly Vec3[], height: number, uv: UvRect): this {
    for (let p = 0; p < points.length - 1; p++) {
      const t = points[p];
      const n = points[p + 1];
      this.quad2(
        [t[0], t[1] - height, t[2]],
        [n[0], n[1] - height, n[2]],
        [n[0], n[1], n[2]],
        [t[0], t[1], t[2]],
        uv
      );
    }
    return this;
  }

  // ----------------------------------------------------------------- output

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Uint8BufferAttribute(this.col, 4, true));
    const vertexCount = this.pos.length / 3;
    geometry.setIndex(
      vertexCount > 65535
        ? new THREE.Uint32BufferAttribute(this.idx, 1)
        : new THREE.Uint16BufferAttribute(this.idx, 1)
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  // ----------------------------------------------------------------- intern

  private vtx(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number
  ): number {
    const p = this.tv.set(x, y, z);
    const n = this.tn2.set(nx, ny, nz);
    if (!this.identity) {
      p.applyMatrix4(this.matrix);
      n.applyMatrix3(this.normalMatrix);
    }
    n.normalize();
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    const c = this.color;
    this.col.push((c >> 16) & 255, (c >> 8) & 255, c & 255, this.alpha);
    return this.pos.length / 3 - 1;
  }

  private tn2 = new THREE.Vector3();

  private syncMatrix(): void {
    this.identity = isIdentity(this.matrix);
    this.normalMatrix.getNormalMatrix(this.matrix);
  }
}

function isBoxUvs(value: UvRect | BoxUvs): value is BoxUvs {
  return (value as BoxUvs).all !== undefined;
}

function isIdentity(m: THREE.Matrix4): boolean {
  const e = m.elements;
  return (
    e[0] === 1 && e[1] === 0 && e[2] === 0 && e[3] === 0 &&
    e[4] === 0 && e[5] === 1 && e[6] === 0 && e[7] === 0 &&
    e[8] === 0 && e[9] === 0 && e[10] === 1 && e[11] === 0 &&
    e[12] === 0 && e[13] === 0 && e[14] === 0 && e[15] === 1
  );
}

/** Parabolic sag approximation of a catenary between two anchors. */
export function catenary(p0: Vec3, p1: Vec3, sag: number, pieces: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = i / pieces;
    points.push([
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t),
      p0[2] + (p1[2] - p0[2]) * t,
    ]);
  }
  return points;
}

/** Evenly re-sample a polyline into `count` pieces of equal arc length. */
export function resample(points: readonly Vec3[], count: number): Vec3[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = lengths[lengths.length - 1];
  const out: Vec3[] = [];
  let seg = 1;
  for (let k = 0; k <= count; k++) {
    const target = (k / count) * total;
    while (seg < lengths.length - 1 && lengths[seg] < target) seg++;
    const a = points[seg - 1];
    const b = points[seg];
    const span = lengths[seg] - lengths[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - lengths[seg - 1]) / span));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

export function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}
