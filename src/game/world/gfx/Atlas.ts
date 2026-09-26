import type { UvRect } from "./GeometryBuilder";

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Simple shelf packer for boot-time texture atlases. Textures built from
 * these layouts use `flipY = false`, so canvas row 0 maps to v = 0.
 */
export class AtlasLayout {
  private rects = new Map<string, AtlasRect>();
  private requests: { key: string; w: number; h: number }[] = [];
  private packed = false;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly pad = 4
  ) {}

  request(key: string, w: number, h: number): void {
    if (this.packed) throw new Error("AtlasLayout already packed");
    this.requests.push({ key, w, h });
  }

  pack(): void {
    const sorted = [...this.requests].sort((a, b) => b.h - a.h || b.w - a.w);
    let x = this.pad;
    let y = this.pad;
    let shelfH = 0;
    for (const r of sorted) {
      if (x + r.w + this.pad > this.width) {
        x = this.pad;
        y += shelfH + this.pad;
        shelfH = 0;
      }
      if (y + r.h + this.pad > this.height) {
        throw new Error(`Atlas overflow while placing "${r.key}"`);
      }
      this.rects.set(r.key, { x, y, w: r.w, h: r.h });
      x += r.w + this.pad;
      shelfH = Math.max(shelfH, r.h);
    }
    this.packed = true;
  }

  has(key: string): boolean {
    return this.rects.has(key);
  }

  rect(key: string): AtlasRect {
    const r = this.rects.get(key);
    if (!r) throw new Error(`Unknown atlas cell "${key}"`);
    return r;
  }

  keys(): IterableIterator<string> {
    return this.rects.keys();
  }

  /** Whole cell, inset by `inset` texels against bleeding. */
  uv(key: string, inset = 1): UvRect {
    const r = this.rect(key);
    return {
      u0: (r.x + inset) / this.width,
      u1: (r.x + r.w - inset) / this.width,
      v0: (r.y + r.h - inset) / this.height,
      v1: (r.y + inset) / this.height,
    };
  }

  /**
   * Sub-rectangle of a cell in cell-local fractions, measured from the
   * cell's top-left corner: (fx0, fy0) top-left → (fx1, fy1) bottom-right.
   */
  sub(key: string, fx0: number, fy0: number, fx1: number, fy1: number): UvRect {
    const r = this.rect(key);
    return {
      u0: (r.x + fx0 * r.w) / this.width,
      u1: (r.x + fx1 * r.w) / this.width,
      v0: (r.y + fy1 * r.h) / this.height,
      v1: (r.y + fy0 * r.h) / this.height,
    };
  }
}
