// Opening a wiki from the deck. The card face is cloned (with its animations in sync) into a layer on <body>, outside
// React, so it survives the route change. The layer grows from the card to the whole window while the name plate
// folds away, the other cards slide off to their sides and the stars push forward. Meanwhile the wiki's theme and
// home page load; the art then dissolves into the wiki's own background color, the page renders underneath, and
// the layer fades away over it. No black frames, no color jumps.
import { themeVars } from "../../shared/theme.ts";
import { api } from "../lib/api.ts";
import { prime } from "../lib/cache.ts";
import "./open-card.css";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const GROW = 480;
/** When the art starts dissolving into the page color, from the click (ms). */
const DISSOLVE_AT = 260;
const DISSOLVE = 240;
const FALLBACK_BG = "#0f1012";

interface Options {
  slots: (HTMLElement | null)[];
  slot: number;
  wikiId: string;
  accent: string;
}

export interface Opening {
  /** Resolves when the layer covers the window in the wiki's background color: navigate then. */
  ready: Promise<void>;
  /** Fade the layer away (after the wiki page has rendered under it). */
  reveal: () => void;
}

/** Fetch the wiki and its home page now, so the page shows complete and in its colors on its first frame. */
async function prefetch(id: string): Promise<string> {
  const [wiki, page] = await Promise.all([api.wiki(id), api.page(id, "")]);
  prime(`wiki:${id}`, wiki);
  prime(`page:${id}:`, page);
  return themeVars(wiki.theme)["--bg"] ?? FALLBACK_BG;
}

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((done) => setTimeout(() => done(fallback), ms))]);
}

/** Clone `face` into `into` and put every CSS animation in the clone at the same point as in the original. */
function cloneLive(face: HTMLElement, into: HTMLElement): HTMLElement {
  const clone = face.cloneNode(true) as HTMLElement;
  into.append(clone);
  const from = [face, ...face.querySelectorAll("*")];
  const to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((source, i) => {
    const running = source.getAnimations() as CSSAnimation[];
    (to[i]?.getAnimations() as CSSAnimation[] | undefined)?.forEach((anim, j) => {
      const twin = running.find((a) => a.animationName === anim.animationName) ?? running[j];
      if (twin?.currentTime != null) anim.currentTime = twin.currentTime;
    });
  });
  return clone;
}

export function openCard({ slots, slot, wikiId, accent }: Options): Opening {
  const started = performance.now();
  const card = slots[slot];
  const face = card?.querySelector<HTMLElement>(".deck-card-inner > *");
  const bg = within(prefetch(wikiId), 900, FALLBACK_BG);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const layer = document.createElement("div");
  layer.className = "sh-open";
  const veil = document.createElement("div");
  veil.className = "sh-open-veil";
  document.body.append(layer);

  const reveal = () => {
    layer
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: "ease-out", fill: "forwards" })
      .finished.then(
        () => layer.remove(),
        () => layer.remove(),
      );
  };

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!card || !face || still) {
    // No card to grow from (or reduced motion): just fade to the page color.
    Object.assign(layer.style, { inset: "0" });
    layer.append(veil);
    const ready = bg.then(async (color) => {
      veil.style.background = color;
      await veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "forwards" }).finished;
    });
    return { ready, reveal };
  }

  // The layer starts exactly over the card face, wearing the card's variables.
  const rect = face.getBoundingClientRect();
  Object.assign(layer.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  layer.style.setProperty("--accent", accent);
  layer.style.setProperty("--focus", "1");
  const deck = card.closest<HTMLElement>(".deck");
  if (deck) layer.style.setProperty("--card-h", getComputedStyle(deck).getPropertyValue("--card-h"));
  const clone = cloneLive(face, layer);
  layer.append(veil);
  card.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: "forwards" });

  // The layer grows to the window; the plate folds away; the art loses its rounded corner.
  const grow = layer.animate(
    [
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
      { left: "0px", top: "0px", width: `${vw}px`, height: `${vh}px` },
    ],
    { duration: GROW, easing: EASE, fill: "forwards" },
  );
  layer.animate([{ borderRadius: "10px" }, { borderRadius: "0px" }], {
    duration: GROW,
    easing: EASE,
    fill: "forwards",
  });
  // Fold the name plate from its real height (a % height would grow with the layer first).
  const plateHeight = face.querySelector(".cc-plate")?.getBoundingClientRect().height ?? 0;
  clone.querySelector(".cc-plate")?.animate(
    [
      { height: `${plateHeight}px`, opacity: 1 },
      { height: "0px", opacity: 0 },
    ],
    { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  clone.querySelector(".cc-art")?.animate([{ borderBottomRightRadius: "34px" }, { borderBottomRightRadius: "0px" }], {
    duration: GROW,
    easing: EASE,
    fill: "forwards",
  });

  // The other cards slide out to their own side and fade; the stars push toward the viewer.
  const middle = rect.left + rect.width / 2;
  slots.forEach((other, i) => {
    if (!other || i === slot || other.style.visibility === "hidden") return;
    const r = other.getBoundingClientRect();
    const side = r.left + r.width / 2 < middle ? -1 : 1;
    const transform = other.style.transform;
    other.animate(
      [
        { transform: `${transform} translateX(0px) scale(1)`, opacity: other.style.opacity || "1" },
        { transform: `${transform} translateX(${side * vw * 0.18}px) scale(0.9)`, opacity: 0 },
      ],
      { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
    );
  });
  deck?.querySelector(".deck-stars")?.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.08)", opacity: 0.5 },
    ],
    {
      duration: GROW,
      easing: EASE,
      fill: "forwards",
    },
  );

  // Once the wiki's color is known, the art dissolves into it.
  const ready = (async () => {
    const color = await bg;
    veil.style.background = color;
    const dissolve = veil.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DISSOLVE,
      delay: Math.max(0, DISSOLVE_AT - (performance.now() - started)),
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
      fill: "forwards",
    });
    await Promise.all([grow.finished, dissolve.finished]);
  })();

  return { ready, reveal };
}
