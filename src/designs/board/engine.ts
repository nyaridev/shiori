// How the board's tools put paint down (ADR-0006, the drawing board): a dab of a brush's tip, the smudge that carries
// paint along, and the blur. stroke.ts decides where the dabs go; Board.tsx decides onto which canvas.
import type { Tool } from "./brushes.ts";
import { rgb } from "./paper.ts";

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

/** Tips are drawn once at this size per brush and colour, then scaled to each dab. */
const TIP = 128;
const GRAIN = 64;
const tips = new Map<string, HTMLCanvasElement>();

/** A tip's shape as alpha 0–1 at (dx, dy) from its centre, in parts of its radius. */
function roundAlpha(hardness: number, d: number) {
  if (d >= 1) return 0;
  if (d <= hardness) return 1;
  const t = (d - hardness) / (1 - hardness);
  // A smooth fall-off, not a straight ramp, so soft brushes have no visible ring.
  return 1 - t * t * (3 - 2 * t);
}

/** The tip of `tool` in `color`; pencils have a few grains to pick from so their lines don't repeat. */
function tipOf(tool: Tool, color: string, variant: number): HTMLCanvasElement {
  const key = `${tool.tip}|${tool.hardness}|${color}|${variant}`;
  const known = tips.get(key);
  if (known) return known;
  if (tips.size > 96) tips.clear();
  const n = tool.tip === "grain" ? GRAIN : TIP;
  const c = canvas(n, n);
  const g = ctx2d(c);
  const img = g.createImageData(n, n);
  const [r, gr, b] = rgb(color);
  const half = n / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      let a =
        tool.tip === "grain"
          ? d < 1
            ? (Math.random() < 0.55 ? Math.random() : 0) * (1 - d * d)
            : 0
          : roundAlpha(tool.hardness, d);
      a = Math.max(0, Math.min(1, a));
      const i = (y * n + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  tips.set(key, c);
  return c;
}

/** One dab of paint: the tip at (x, y), `diameter` wide, laying `flow` of its colour. */
export function paintDab(
  c: CanvasRenderingContext2D,
  tool: Tool,
  color: string,
  x: number,
  y: number,
  diameter: number,
  flow: number,
) {
  if (flow <= 0) return;
  let px = x;
  let py = y;
  if (tool.jitter) {
    px += (Math.random() - 0.5) * 2 * diameter * tool.jitter;
    py += (Math.random() - 0.5) * 2 * diameter * tool.jitter;
  }
  const r = diameter / 2;
  c.globalAlpha = flow;
  if (tool.tip === "round" && tool.hardness >= 0.95) {
    // Crisp tips as real circles: sharp at any size.
    c.fillStyle = color;
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fill();
  } else {
    c.drawImage(
      tipOf(tool, color, tool.tip === "grain" ? Math.floor(Math.random() * 4) : 0),
      px - r,
      py - r,
      diameter,
      diameter,
    );
  }
  c.globalAlpha = 1;
}

/** A soft round mask, white where it lets through. */
const masks = new Map<string, HTMLCanvasElement>();
function maskOf(d: number, hardness: number) {
  const key = `${d}|${hardness}`;
  const known = masks.get(key);
  if (known) return known;
  if (masks.size > 32) masks.clear();
  const c = canvas(d, d);
  const g = ctx2d(c);
  const img = g.createImageData(d, d);
  const half = d / 2;
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      const i = (y * d + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(roundAlpha(hardness, Math.hypot(x + 0.5 - half, y + 0.5 - half) / half) * 255);
    }
  g.putImageData(img, 0, 0);
  masks.set(key, c);
  return c;
}

/**
 * The smudge: it picks up the paint where the stroke starts and drags it along, laying some down and picking up some
 * of what it passes over at every dab, as a finger in wet paint would. One per stroke (and one more for the mirror).
 */
export class Smudger {
  private readonly d: number;
  private readonly carried: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly mask: HTMLCanvasElement;

  constructor(main: CanvasRenderingContext2D, x: number, y: number, diameter: number, hardness: number) {
    this.d = Math.max(2, Math.min(400, Math.round(diameter)));
    this.carried = canvas(this.d, this.d);
    this.scratch = canvas(this.d, this.d);
    this.mask = maskOf(this.d, hardness);
    this.pickUp(main, x, y, 1);
  }

  private pickUp(main: CanvasRenderingContext2D, x: number, y: number, amount: number) {
    const g = ctx2d(this.carried);
    const r = this.d / 2;
    g.globalAlpha = amount;
    g.drawImage(main.canvas, x - r, y - r, this.d, this.d, 0, 0, this.d, this.d);
    g.globalAlpha = 1;
  }

  /** Lays down what it carries at (x, y), `strength` 0–1, then picks up some of what's there. */
  dab(main: CanvasRenderingContext2D, x: number, y: number, strength: number) {
    const r = this.d / 2;
    const s = ctx2d(this.scratch);
    s.globalCompositeOperation = "copy";
    s.drawImage(this.carried, 0, 0);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(this.mask, 0, 0);
    s.globalCompositeOperation = "source-over";
    main.globalAlpha = strength;
    main.drawImage(this.scratch, x - r, y - r);
    main.globalAlpha = 1;
    // The stronger the smudge, the longer it holds on to the paint it started with.
    this.pickUp(main, x, y, Math.max(0.04, 1 - strength * 0.95));
  }
}

const blurScratch = { wide: null as HTMLCanvasElement | null, dab: null as HTMLCanvasElement | null };
const sized = (c: HTMLCanvasElement | null, n: number) => {
  if (c && c.width >= n && c.height >= n) return c;
  return canvas(n, n);
};

/** Softens what's under a round brush at (x, y). */
export function blurDab(
  main: CanvasRenderingContext2D,
  x: number,
  y: number,
  diameter: number,
  hardness: number,
  strength: number,
) {
  const d = Math.max(4, Math.min(400, Math.round(diameter)));
  const r = d / 2;
  const radius = Math.max(1, d * 0.06 * (0.5 + strength));
  // Blur a wider square than the dab, so its edges don't pull in nothing from outside it.
  const pad = Math.ceil(radius * 3);
  const wide = sized(blurScratch.wide, d + 2 * pad);
  const one = sized(blurScratch.dab, d);
  blurScratch.wide = wide;
  blurScratch.dab = one;
  const w = ctx2d(wide);
  w.clearRect(0, 0, wide.width, wide.height);
  w.filter = `blur(${radius}px)`;
  w.drawImage(main.canvas, x - r - pad, y - r - pad, d + 2 * pad, d + 2 * pad, 0, 0, d + 2 * pad, d + 2 * pad);
  w.filter = "none";
  const o = ctx2d(one);
  o.clearRect(0, 0, one.width, one.height);
  o.drawImage(wide, pad, pad, d, d, 0, 0, d, d);
  o.globalCompositeOperation = "destination-in";
  o.drawImage(maskOf(d, hardness), 0, 0);
  o.globalCompositeOperation = "source-over";
  main.globalAlpha = Math.min(1, strength * 1.2);
  main.drawImage(one, 0, 0, d, d, x - r, y - r, d, d);
  main.globalAlpha = 1;
}
