// The paper of a design's drawing board (ADR-0006): its size and limits, the flood fill, and reading a colour off it.

/** A new design's paper. */
export const PAPER = { width: 1200, height: 900 };
/** The paper's limits: the server takes at most 4000 pixels a side (server/designs.ts). */
export const PAPER_LIMITS = { min: 200, side: 4000, area: 4000 * 3000 };
/** Paper is white: the eraser paints it. */
export const PAPER_COLOR = "#ffffff";

export type Size = { width: number; height: number };
/** Which edges a resize handle moves: one ("e") or two at a corner ("se"). */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** A size kept within the limits, giving way on the sides being changed. */
export function clampPaper(size: Size, edge: Edge): Size {
  const side = (v: number) => Math.round(Math.min(PAPER_LIMITS.side, Math.max(PAPER_LIMITS.min, v)));
  let { width, height } = { width: side(size.width), height: side(size.height) };
  if (width * height > PAPER_LIMITS.area) {
    const sideways = /[ew]/.test(edge);
    const upDown = /[ns]/.test(edge);
    if (sideways && !upDown) width = Math.floor(PAPER_LIMITS.area / height);
    else if (upDown && !sideways) height = Math.floor(PAPER_LIMITS.area / width);
    else {
      const k = Math.sqrt(PAPER_LIMITS.area / (width * height));
      width = Math.floor(width * k);
      height = Math.floor(height * k);
    }
  }
  return { width, height };
}

/** `#rrggbb` → [r, g, b]. */
export const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** The colour of the paper at (x, y), as `#rrggbb`. */
export function colorAt(c: CanvasRenderingContext2D, x: number, y: number): string | null {
  const { width, height } = c.canvas;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const [r, g, b] = c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** Fills the area of one colour around (x, y) with `color`, a scanline at a time. */
export function floodFill(c: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const { width, height } = c.canvas;
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const image = c.getImageData(0, 0, width, height);
  const px = image.data;
  const at = (i: number) => i * 4;
  const start = at(y * width + x);
  const target = [px[start], px[start + 1], px[start + 2], px[start + 3]];
  const [r, g, b] = rgb(color);
  if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 3 && target[3] === 255) return;
  // Close enough to the colour clicked: soft pen edges fill too.
  const same = (i: number) =>
    Math.abs(px[i] - target[0]) + Math.abs(px[i + 1] - target[1]) + Math.abs(px[i + 2] - target[2]) < 96;
  const seen = new Uint8Array(width * height);
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [sx, sy] = stack.pop() as [number, number];
    let lx = sx;
    while (lx > 0 && !seen[sy * width + lx - 1] && same(at(sy * width + lx - 1))) lx--;
    let up = false;
    let down = false;
    for (let cx = lx; cx < width; cx++) {
      const n = sy * width + cx;
      if (seen[n] || !same(at(n))) break;
      seen[n] = 1;
      const i = at(n);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
      for (const [dy, flag] of [
        [-1, "up"],
        [1, "down"],
      ] as const) {
        const ny = sy + dy;
        if (ny < 0 || ny >= height) continue;
        const open = !seen[ny * width + cx] && same(at(ny * width + cx));
        const was = flag === "up" ? up : down;
        if (open && !was) stack.push([cx, ny]);
        if (flag === "up") up = open;
        else down = open;
      }
    }
  }
  c.putImageData(image, 0, 0);
}
