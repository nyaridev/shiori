// Opening a wiki from the deck: the camera dives into the card. It pulls back a touch, then zooms into the card's art,
// faster and faster, the whole deck riding the same camera so the other cards rush past. Once it's moving, a WebGL
// layer (warp.ts) takes the card over, painted into a texture (paintCard.ts), and the shader adds what the DOM can't
// do smoothly: a radial motion blur, chromatic fringes, a warp tunnel of light streaks, and a light at the end that
// floods the window. The wiki (prefetched, so it's complete on its first frame) renders under the white, and the
// flash fades off it.
import { themeVars } from "../../../shared/theme.ts";
import { api } from "../../lib/api.ts";
import { prime } from "../../lib/cache.ts";
import { viewerMode } from "../../lib/viewerMode.ts";
import { PAD, paintCard, rgbOf } from "./paintCard.ts";
import { type WarpFrame, warp } from "./warp.ts";
import "./opening.css";

/** The dive, from the click (ms). */
const DIVE = 780;
/** When the shader takes the card over from the DOM (0…1 of the dive): after the pull back, before any blur shows. */
const HANDOFF = 0.2;
/** How many times over the art covers the window when the dive ends. */
const OVERSHOOT = 2.6;
/** How long the flash takes to fade off the wiki (ms). */
const FADE = 650;
const FALLBACK_BG = "#0f1012";

interface Options {
  slots: (HTMLElement | null)[];
  slot: number;
  wikiId: string;
  accent: string;
}

export interface Opening {
  /** Resolves when the flash covers the window: navigate then. */
  ready: Promise<void>;
  /** Fade the flash away (after the wiki page has rendered under it). */
  reveal: () => void;
}

/** Compile the shader ahead of time, so the first click doesn't wait for it. */
export function warmOpening() {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) warp();
}

/** Fetch the wiki and its home page now, so the page shows complete and in its colors on its first frame. */
async function prefetch(id: string): Promise<string> {
  const [wiki, page] = await Promise.all([api.wiki(id), api.page(id, "")]);
  prime(`wiki:${id}`, wiki);
  prime(`page:${id}:`, page);
  return themeVars(wiki.theme, viewerMode() ?? wiki.theme.mode)["--bg"] ?? FALLBACK_BG;
}

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((done) => setTimeout(() => done(fallback), ms))]);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/**
 * The camera at `t` (0…1 of the dive). `pull` is the small step back before the dive; `depth` (0…1) is how far into
 * the card it is, on a log scale; `speed` (0…1) sets the blur; `center` is how far the art has moved to the middle.
 */
function camera(t: number) {
  const pull = 1 - 0.04 * Math.sin(Math.PI * Math.min(t / 0.24, 1));
  const u = Math.max(0, (t - 0.08) / 0.92);
  return { pull, depth: u ** 2.2, speed: u ** 1.2, center: u ** 1.2 };
}

/** Without a card to dive into, WebGL or motion: fade to the page color. */
function fadeToPage(bg: Promise<string>): Opening {
  const veil = document.createElement("div");
  veil.className = "sh-open-veil";
  document.body.append(veil);
  const ready = bg.then(async (color) => {
    veil.style.background = color;
    await veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "forwards" }).finished;
  });
  const reveal = () => {
    veil
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: "ease-out", fill: "forwards" })
      .finished.finally(() => veil.remove());
  };
  return { ready, reveal };
}

export function openCard({ slots, slot, wikiId, accent }: Options): Opening {
  const card = slots[slot];
  const face = card?.querySelector<HTMLElement>(".deck-card-inner > .cc");
  const bg = within(prefetch(wikiId), 900, FALLBACK_BG);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = card && face && !still ? warp() : null;
  if (!card || !face || !gl) return fadeToPage(bg);

  // The painted card, and where it sits: its art's middle is where the camera dives.
  const painted = paintCard(face, accent);
  const rect = face.getBoundingClientRect();
  const lift = rect.width / painted.width; // The deck's own scale on the card (the hover lift).
  const fx = rect.left + (painted.width / 2) * lift;
  const fy = rect.top + (painted.artHeight / 2) * lift;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const deepest = Math.log(OVERSHOOT * Math.max(vw / (painted.width * lift), vh / (painted.artHeight * lift)));
  gl.begin({
    canvas: painted.canvas,
    size: [painted.width + PAD * 2, painted.height + PAD * 2],
    focus: [PAD + painted.width / 2, PAD + painted.artHeight / 2],
    accent: rgbOf(accent),
  });

  // The deck rides the same camera (transform and opacity only, so it stays on the compositor).
  const deck = card.closest<HTMLElement>(".deck");
  const stage = deck?.querySelector<HTMLElement>(".deck-stage");
  const stars = deck?.querySelector<HTMLElement>(".deck-stars");
  const inner = card.querySelector<HTMLElement>(".deck-card-inner");
  for (const el of [stage, stars]) {
    if (!el) continue;
    el.style.transformOrigin = `${fx}px ${fy}px`;
    el.style.willChange = "transform, opacity";
  }

  const rest: WarpFrame = {
    focus: [vw / 2, vh / 2],
    scale: 1,
    speed: 0,
    show: 0,
    warp: 0,
    travel: 0,
    glow: 0,
    glowSize: 0.9,
    white: 1,
  };
  const start = performance.now();
  let last = start;
  let travel = 0;
  let dived: () => void = () => {};
  const diveDone = new Promise<void>((done) => {
    dived = done;
  });

  const dive = (now: number) => {
    const t = clamp01((now - start) / DIVE);
    const c = camera(t);
    const scale = c.pull * Math.exp(deepest * c.depth);
    const ox = (vw / 2 - fx) * c.center;
    const oy = (vh / 2 - fy) * c.center;
    travel += ((now - last) / 1000) * (0.1 + 1.8 * c.speed);
    last = now;
    const handed = t >= HANDOFF;
    const light = smooth(0.45, 1, t) ** 2.5;
    gl.draw({
      focus: [fx + ox, fy + oy],
      scale: scale * lift,
      speed: c.speed,
      show: handed ? 1 : 0,
      warp: smooth(0.2, 0.6, t),
      travel,
      glow: light,
      glowSize: 0.03 + 0.9 * light,
      white: smooth(0.88, 1, t),
    });
    if (inner && handed) inner.style.opacity = "0";
    if (stage) {
      stage.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
      stage.style.opacity = String(1 - smooth(HANDOFF, 0.55, t));
    }
    if (stars) {
      stars.style.transform = `scale(${scale ** 0.25})`;
      stars.style.opacity = String(1 - smooth(0.2, 0.6, t));
    }
    if (t < 1) requestAnimationFrame(dive);
    else dived();
  };
  requestAnimationFrame(dive);

  // The white thins out from the edges while the light lingers in the middle, then goes.
  const reveal = () => {
    const from = performance.now();
    const fade = (now: number) => {
      const r = clamp01((now - from) / FADE);
      gl.draw({ ...rest, glow: (1 - r) ** 2, glowSize: 0.9 - 0.6 * r, white: 1 - smooth(0, 0.55, r) });
      if (r < 1) requestAnimationFrame(fade);
      else gl.end();
    };
    requestAnimationFrame(fade);
  };

  return { ready: Promise.all([bg, diveDone]).then(() => {}), reveal };
}
