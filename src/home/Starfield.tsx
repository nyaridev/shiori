// The sky behind the deck: three layers of twinkling stars (no clouds) that slide at different speeds as the deck
// moves, and lean a little toward the mouse, for depth. Plain 2D canvas; with reduced motion the stars stay still.
import { type RefObject, useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
}

interface Layer {
  /** How far the layer slides per pixel the deck travels. Far layers move least. */
  depth: number;
  stars: Star[];
}

/** Layers are tiles this size, repeated in every direction, so the sky never runs out. */
const TILE = 1400;

const LAYERS = [
  { depth: 0.04, count: 320, size: [0.5, 1.1], light: [0.3, 0.7] },
  { depth: 0.12, count: 130, size: [0.8, 1.6], light: [0.45, 0.9] },
  { depth: 0.28, count: 45, size: [1.3, 2.3], light: [0.7, 1] },
] as const;

const between = (r: number, [a, b]: readonly [number, number]) => a + r * (b - a);

function makeLayers(): Layer[] {
  return LAYERS.map((l) => ({
    depth: l.depth,
    stars: Array.from({ length: l.count }, () => ({
      x: Math.random() * TILE,
      y: Math.random() * TILE,
      r: between(Math.random(), l.size),
      base: between(Math.random(), l.light),
      speed: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
    })),
  }));
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function Starfield({ travel }: { travel: RefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layers = makeLayers();
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onMouse = (e: PointerEvent) => {
      // -1…1 from the center of the window.
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const w = el.clientWidth;
      const h = el.clientHeight;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (const layer of layers) {
        const ox = -(travel.current ?? 0) * layer.depth - mouse.x * layer.depth * 120;
        const oy = -mouse.y * layer.depth * 80;
        for (const s of layer.stars) {
          const x = mod(s.x + ox, TILE);
          const y = mod(s.y + oy, TILE);
          // A tile can be smaller than the window: draw each star wherever its tile repeats.
          for (let px = x; px < w; px += TILE) {
            for (let py = y; py < h; py += TILE) {
              const twinkle = still ? 1 : 0.65 + 0.35 * Math.sin(t * s.speed + s.phase);
              ctx.globalAlpha = s.base * twinkle;
              ctx.fillStyle = "#fff8e8";
              ctx.beginPath();
              ctx.arc(px, py, s.r, 0, Math.PI * 2);
              ctx.fill();
              // The nearest, biggest stars get a faint halo.
              if (s.r > 1.6) {
                ctx.globalAlpha *= 0.12;
                ctx.beginPath();
                ctx.arc(px, py, s.r * 3.5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMouse);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMouse);
    };
  }, [travel]);

  return <canvas ref={canvas} className="deck-stars" />;
}
