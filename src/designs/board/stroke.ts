// A stroke's path, before any paint (ADR-0006, the drawing board): the stabilizer that steadies the pen, and the path
// that curves through its points and places a dab every so often along it. No canvas here, so it's tested on its own
// (stroke.spec.ts).

export interface Point {
  x: number;
  y: number;
  /** Pressure, 0–1 (a mouse: 0.5). */
  p: number;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  p: a.p + (b.p - a.p) * t,
});
const mid = (a: Point, b: Point) => lerp(a, b, 0.5);

/**
 * Steadies a hand: each point moves only part of the way toward where the pen is, so wobbles even out and curves come
 * out smooth. `amount` 0 follows the pen exactly; 1 trails far behind it.
 */
export class Stabilizer {
  private at: Point | null = null;
  private readonly amount: number;
  constructor(amount: number) {
    this.amount = amount;
  }

  push(raw: Point): Point {
    if (!this.at || this.amount <= 0) {
      this.at = raw;
      return raw;
    }
    // How far toward the pen a point moves: all the way at 0, a tenth at 1.
    const w = 1 - Math.min(1, this.amount) * 0.9;
    this.at = {
      x: this.at.x + (raw.x - this.at.x) * w,
      y: this.at.y + (raw.y - this.at.y) * w,
      p: this.at.p + (raw.p - this.at.p) * Math.max(w, 0.35),
    };
    return this.at;
  }

  /** The points that bring the line to where the pen lifted, so a steadied stroke still ends there. */
  finish(raw: Point): Point[] {
    if (!this.at || this.amount <= 0) return [];
    const out: Point[] = [];
    for (let i = 0; i < 60 && dist(this.at, raw) > 0.5; i++) out.push(this.push(raw));
    out.push(raw);
    this.at = raw;
    return out;
  }
}

/**
 * The path of a stroke: a smooth curve through the points it's given (each corner rounded through the middles of its
 * sides), with a dab placed every `spacing(point)` pixels along it, however fast or slow the points come.
 */
export class Path {
  private pts: Point[] = [];
  /** The last place walked to, and how far since the last dab. */
  private last: Point | null = null;
  private carry = 0;

  private readonly spacing: (at: Point) => number;
  private readonly dab: (at: Point) => void;

  constructor(spacing: (at: Point) => number, dab: (at: Point) => void) {
    this.spacing = spacing;
    this.dab = dab;
  }

  add(pt: Point) {
    const prev = this.pts.at(-1);
    // A point on top of the last one adds nothing, but its pressure.
    if (prev && dist(prev, pt) < 0.01) {
      this.pts[this.pts.length - 1] = { ...prev, p: pt.p };
      return;
    }
    this.pts.push(pt);
    const n = this.pts.length;
    if (n === 1) {
      this.last = pt;
      this.dab(pt);
      return;
    }
    if (n === 2) return;
    const [a, b, c] = this.pts.slice(-3);
    this.curve(n === 3 ? a : mid(a, b), b, mid(b, c));
    // Only the last three matter from here on.
    if (n > 3) this.pts.shift();
  }

  /** Draws the rest of the way to the last point. */
  end() {
    const n = this.pts.length;
    if (n < 2) return;
    const from = n === 2 ? this.pts[0] : mid(this.pts[n - 2], this.pts[n - 1]);
    this.walk(from);
    this.walk(this.pts[n - 1]);
  }

  /** A straight line from where the path is to `to` (Shift-click lines). */
  lineTo(to: Point) {
    this.walk(to);
    this.pts = [to];
  }

  /** The quadratic curve from `p0` to `p1` bent toward `c`, walked in short straight steps. */
  private curve(p0: Point, c: Point, p1: Point) {
    const steps = Math.max(1, Math.ceil((dist(p0, c) + dist(c, p1)) / 2));
    this.walk(p0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      this.walk({
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
        p: u * u * p0.p + 2 * u * t * c.p + t * t * p1.p,
      });
    }
  }

  /** Walks in a straight line to `to`, dabbing each time the spacing is covered. */
  private walk(to: Point) {
    let from = this.last ?? to;
    let left = dist(from, to);
    for (let i = 0; i < 100_000; i++) {
      const need = Math.max(0.5, this.spacing(from)) - this.carry;
      if (left < need) {
        this.carry += left;
        break;
      }
      from = lerp(from, to, need / left);
      this.dab(from);
      this.carry = 0;
      left = dist(from, to);
    }
    this.last = to;
  }
}
