// A random constellation for a card: stars spread over the upper art, joined like a real constellation (a minimum
// spanning tree, sometimes with one loop), plus faint dust and maybe a shooting star. Times are in seconds from the
// moment the constellation appears; the CSS animations read them.

export interface Star {
  x: number;
  y: number;
  r: number;
  /** When the star fades in as a faint point. */
  appear: number;
  /** When a line reaches it and it flares to full brightness. */
  lit: number;
}

export interface Edge {
  from: number;
  to: number;
  /** When the line starts tracing from `from` to `to`. */
  start: number;
}

export interface Sky {
  stars: Star[];
  edges: Edge[];
  dust: { x: number; y: number; r: number; delay: number }[];
  meteor: {
    show: boolean;
    at: number;
    line: { x1: number; y1: number; x2: number; y2: number };
    gradient: { x1: number; y1: number; x2: number; y2: number };
  };
}

/** Seconds a line takes to trace; matches `cc-trace` in card.css. */
export const TRACE = 0.55;
const FIRST = 0.9;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function scatter(count: number) {
  const points: { x: number; y: number }[] = [];
  for (let tries = 0; points.length < count && tries < 400; tries++) {
    const p = { x: rand(12, 88), y: rand(10, 62) };
    if (points.every((q) => dist(p, q) > 14)) points.push(p);
  }
  return points;
}

/** Prim's minimum spanning tree, grown from the leftmost star; edges come out in the order they're reached. */
function spanningTree(points: { x: number; y: number }[]) {
  const root = points.reduce((best, p, i) => (p.x < points[best].x ? i : best), 0);
  const inTree = new Set([root]);
  const edges: { from: number; to: number }[] = [];
  while (inTree.size < points.length) {
    let best: { from: number; to: number; d: number } | null = null;
    for (const a of inTree) {
      points.forEach((p, b) => {
        if (inTree.has(b)) return;
        const d = dist(points[a], p);
        if (!best || d < best.d) best = { from: a, to: b, d };
      });
    }
    if (!best) break;
    const { from, to } = best;
    edges.push({ from, to });
    inTree.add(to);
  }
  return { root, edges };
}

export function skyFor(): Sky {
  const points = scatter(5 + Math.floor(Math.random() * 4));
  const { root, edges } = spanningTree(points);

  // Sometimes close one loop between two near stars that aren't joined yet.
  if (points.length > 4 && Math.random() < 0.35) {
    const joined = (a: number, b: number) =>
      edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
    let best: { from: number; to: number; d: number } | null = null;
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        const d = dist(points[a], points[b]);
        if (!joined(a, b) && d < 32 && (!best || d < best.d)) best = { from: a, to: b, d };
      }
    }
    if (best) edges.push({ from: best.from, to: best.to });
  }

  // Lines trace outward: a line starts when the star it leaves from is lit.
  const lit = new Map<number, number>([[root, FIRST]]);
  const timed: Edge[] = [];
  for (const e of edges) {
    const start = (lit.get(e.from) ?? FIRST) + rand(0, 0.12);
    timed.push({ ...e, start });
    if (!lit.has(e.to)) lit.set(e.to, start + TRACE);
  }

  const stars: Star[] = points.map((p, i) => ({
    ...p,
    r: rand(0.55, 1.15) * (i === root ? 1.25 : 1),
    appear: rand(0, 0.6),
    lit: lit.get(i) ?? FIRST,
  }));

  const dust = Array.from({ length: 16 }, () => ({
    x: rand(2, 98),
    y: rand(2, 80),
    r: rand(0.15, 0.4),
    delay: rand(0, 4),
  }));

  // A shooting star, about every other cycle, falling diagonally across the upper art.
  const fromLeft = Math.random() < 0.5;
  const x1 = fromLeft ? rand(5, 40) : rand(60, 95);
  const y1 = rand(4, 22);
  const x2 = x1 + (fromLeft ? 1 : -1) * rand(22, 34);
  const y2 = y1 + rand(12, 20);
  return {
    stars,
    edges: timed,
    dust,
    meteor: {
      show: Math.random() < 0.55,
      at: rand(3.5, 8),
      line: { x1, y1, x2, y2 },
      gradient: { x1, y1, x2, y2 },
    },
  };
}
