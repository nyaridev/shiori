// The deck controller: drag, fling, wheel and keys move a position along a loop of card slots; every frame writes
// transforms straight to the DOM (no React render per frame). React only hears about the centered card.
import { type RefObject, useEffect, useRef, useState } from "react";
import { clamp, MAX_SPEED, type MotionState, mod, offset, step } from "./physics.ts";

const GAP = 22;
/** Fewer real cards than this get repeated, so the loop always fills the screen. */
const MIN_SLOTS = 15;

export function slotCount(n: number) {
  return n === 0 ? 0 : n * Math.max(1, Math.ceil(MIN_SLOTS / n));
}

interface Options {
  stage: RefObject<HTMLDivElement | null>;
  slots: RefObject<(HTMLDivElement | null)[]>;
  /** Real cards; slot i shows card i % n. */
  n: number;
  start: number;
  disabled: boolean;
  onOpen: (slot: number) => void;
}

export function useDeck({ stage, slots, n, start, disabled, onOpen }: Options) {
  const count = slotCount(n);
  /** How far the deck has moved in total, in px (never wraps). The starfield follows it for parallax. */
  const travel = useRef(0);
  /** Imperative controls for search: spin to a wiki, open the centered card. */
  const controls = useRef({ goTo: (_wiki: number) => {}, openCenter: () => {} });
  const [center, setCenter] = useState(() => mod(start, Math.max(n, 1)));
  const [dragging, setDragging] = useState(false);
  const live = useRef({ disabled, onOpen });
  live.current = { disabled, onOpen };

  useEffect(() => {
    const el = stage.current;
    if (!el || count === 0) return;
    // Start in the middle copy so wrapping is never visible.
    const first = start + n * Math.floor(count / n / 2);
    let s: MotionState = { x: first, v: 0, mode: "idle", target: first };
    let pitch = 200;
    let raf = 0;
    let last = 0;
    let lastCenter = Math.round(s.x);
    let prevX = s.x;

    const measure = () => {
      pitch = (slots.current[0]?.offsetWidth ?? 180) + GAP;
    };

    const layout = () => {
      const half = window.innerWidth / 2 + pitch * 1.5;
      slots.current.forEach((card, i) => {
        if (!card) return;
        const d = offset(i, s.x, count);
        const a = Math.abs(d);
        const px = d * pitch;
        if (Math.abs(px) > half) {
          card.style.visibility = "hidden";
          return;
        }
        card.style.visibility = "visible";
        const lift = Math.max(0, 1 - a);
        card.style.transform =
          `translate3d(${px.toFixed(2)}px, ${(-lift * 14).toFixed(2)}px, ${(-a * 90).toFixed(1)}px) ` +
          `rotateY(${clamp(-d * 8, -30, 30).toFixed(2)}deg) scale(${(1 - Math.min(a, 4) * 0.05).toFixed(4)})`;
        card.style.opacity = String(clamp(1 - Math.max(0, a - 0.5) * 0.16, 0.18, 1));
        card.style.zIndex = String(1000 - Math.round(a * 10));
        card.style.setProperty("--focus", lift.toFixed(3));
        card.style.setProperty("--d", d.toFixed(3));
        card.toggleAttribute("data-center", a < 0.5);
      });
    };

    const afterMove = () => {
      travel.current += (s.x - prevX) * pitch;
      if (s.x >= count || s.x < 0) {
        const k = Math.floor(s.x / count) * count;
        s = { ...s, x: s.x - k, target: s.target - k };
      }
      prevX = s.x;
      const c = Math.round(s.x);
      if (c !== lastCenter) {
        lastCenter = c;
        setCenter(mod(c, count) % n);
      }
      layout();
    };

    const frame = (t: number) => {
      const dt = Math.min(0.04, (t - last) / 1000);
      last = t;
      s = step(s, dt);
      afterMove();
      if (s.mode === "coast" || s.mode === "settle") raf = requestAnimationFrame(frame);
      else raf = 0;
    };
    const run = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const snapTo = (slot: number) => {
      s = { ...s, mode: "settle", target: slot };
      run();
    };

    // Pointer: drag follows the finger; release flings with the last ~80 ms of speed.
    let drag: {
      id: number;
      startX: number;
      startPos: number;
      moved: number;
      /** The card under the pointer at press time; pointer capture retargets later events to the stage. */
      slot: number;
      /** A press that stops a spin only stops it. */
      wasSpinning: boolean;
      samples: { t: number; x: number }[];
    } | null = null;
    const down = (e: PointerEvent) => {
      if (live.current.disabled || e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startPos: s.x,
        moved: 0,
        slot: Number((e.target as HTMLElement).closest<HTMLElement>("[data-slot]")?.dataset.slot),
        wasSpinning: s.mode === "coast" && Math.abs(s.v) > 4,
        samples: [{ t: e.timeStamp, x: e.clientX }],
      };
      s = { ...s, v: 0, mode: "drag" };
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.startX));
      if (drag.moved > 6) setDragging(true);
      drag.samples.push({ t: e.timeStamp, x: e.clientX });
      while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 90) drag.samples.shift();
      const prev = s.x;
      const x = drag.startPos - (e.clientX - drag.startX) / pitch;
      s = { ...s, x, v: (x - prev) * 60 };
      afterMove();
      // A wrap moved s.x; keep the drag origin in step with it.
      drag.startPos += s.x - x;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      setDragging(false);
      if (d.moved <= 6) {
        if (Number.isNaN(d.slot) || d.wasSpinning) return snapTo(Math.round(s.x));
        const dist = Math.round(offset(d.slot, s.x, count));
        snapTo(Math.round(s.x) + dist);
        if (dist === 0) live.current.onOpen(d.slot);
        return;
      }
      const a = d.samples[0];
      const b = d.samples[d.samples.length - 1];
      const stale = e.timeStamp - b.t > 60;
      const v = stale || b.t === a.t ? 0 : (-(b.x - a.x) / (b.t - a.t)) * (1000 / pitch);
      s = { ...s, v: clamp(v * 1.15, -MAX_SPEED, MAX_SPEED), mode: "coast" };
      run();
    };

    const wheel = (e: WheelEvent) => {
      if (live.current.disabled) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const scale = e.deltaMode === 1 ? 16 : 1;
      s = { ...s, v: clamp(s.v + delta * scale * 0.018, -MAX_SPEED, MAX_SPEED), mode: "coast" };
      run();
    };

    const key = (e: KeyboardEvent) => {
      if (live.current.disabled || e.altKey || e.ctrlKey || e.metaKey) return;
      // Typing in the search field: its keys are its own.
      if (e.target instanceof HTMLInputElement) return;
      const base = s.mode === "settle" ? s.target : Math.round(s.x);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") snapTo(base + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") snapTo(base - 1);
      else if (e.key === "Enter" || e.key === " ") live.current.onOpen(mod(Math.round(s.x), count));
      else return;
      e.preventDefault();
    };

    controls.current = {
      // The nearest slot that shows that wiki, so the deck takes the short way round.
      goTo: (wiki) => {
        const base = s.mode === "settle" ? s.target : Math.round(s.x);
        let best = base;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let slot = wiki; slot < count; slot += n) {
          const d = Math.round(offset(slot, base, count));
          if (Math.abs(d) < bestDist) {
            bestDist = Math.abs(d);
            best = base + d;
          }
        }
        if (best !== base || s.mode !== "idle") snapTo(best);
      },
      openCenter: () => live.current.onOpen(mod(Math.round(s.mode === "settle" ? s.target : s.x), count)),
    };

    const resize = () => {
      measure();
      layout();
    };
    // Card styles change the card width; follow it.
    const sizes = new ResizeObserver(resize);
    const firstCard = slots.current[0];
    if (firstCard) sizes.observe(firstCard);

    measure();
    layout();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
      sizes.disconnect();
    };
  }, [stage, slots, n, count, start]);

  return { count, center, dragging, travel, controls };
}
