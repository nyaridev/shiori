// Overlay scrollbars, for everything in the app that scrolls. The native ones are hidden (base.css) and these are
// drawn over the content instead, so a box gaining or losing its scrollbar never changes the layout. The thumb fades
// in while scrolling or hovered, drags, and a click on the track pages toward it. `PageScrollbar` follows the window;
// `ScrollArea` is a box that scrolls its own content, down (`axis="y"`) or sideways (`axis="x"`: code, tables,
// diagrams, diffs). Scrolling writes to the DOM directly: no React render per scroll event.
import { type HTMLAttributes, type ReactNode, type Ref, type RefObject, useEffect, useRef } from "react";
import { cx } from "./Button.tsx";

const MIN_THUMB = 28;
/** How long the thumb stays after the last scroll (ms). */
const LINGER = 900;

export type Axis = "x" | "y";

interface Source {
  /** The element whose scroll position moves. */
  el: HTMLElement;
  /** Where its scroll events fire. */
  events: EventTarget;
  /** Elements whose size changes the scroll range… */
  watch: Element[];
  /** …and a parent whose children (as they come and go) do too. */
  parent?: Element;
}

/** The scroll measurements along one axis. */
const along = (el: HTMLElement, axis: Axis) =>
  axis === "y"
    ? { pos: el.scrollTop, size: el.scrollHeight, view: el.clientHeight }
    : { pos: el.scrollLeft, size: el.scrollWidth, view: el.clientWidth };

function useOverlay(
  source: () => Source | null,
  axis: Axis = "y",
): {
  track: RefObject<HTMLDivElement | null>;
  thumb: RefObject<HTMLDivElement | null>;
} {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const resolve = useRef(source);
  resolve.current = source;

  useEffect(() => {
    const src = resolve.current();
    const bar = track.current;
    const knob = thumb.current;
    if (!src || !bar || !knob) return;
    const { el } = src;
    const y = axis === "y";
    let frame = 0;
    let hide = 0;
    let travel = 0;
    let drag: { at: number; pos: number } | null = null;

    const layout = () => {
      frame = 0;
      const { pos, size, view } = along(el, axis);
      const range = size - view;
      bar.toggleAttribute("data-none", range <= 1);
      // Sideways, the edge fades where there's more to see (on a phone there's no scrollbar until it moves).
      if (!y) {
        const frame = bar.parentElement;
        const gone = Math.abs(pos);
        frame?.toggleAttribute("data-more-start", range > 1 && gone > 1);
        frame?.toggleAttribute("data-more-end", range > 1 && gone < range - 1);
      }
      if (range <= 1) return;
      const room = y ? bar.clientHeight : bar.clientWidth;
      const length = Math.max(MIN_THUMB, (room * view) / size);
      travel = room - length;
      const offset = (Math.min(Math.max(pos, 0), range) / range) * travel;
      if (y) {
        knob.style.height = `${length}px`;
        knob.style.transform = `translateY(${offset}px)`;
      } else {
        knob.style.width = `${length}px`;
        // Right to left text scrolls from the other end.
        knob.style.transform = `translateX(${pos < 0 ? travel + (pos / range) * travel : offset}px)`;
      }
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(layout);
    };
    const wake = () => {
      bar.setAttribute("data-active", "");
      clearTimeout(hide);
      hide = window.setTimeout(() => bar.removeAttribute("data-active"), LINGER);
    };
    const onScroll = () => {
      schedule();
      wake();
    };

    const point = (e: PointerEvent) => (y ? e.clientY : e.clientX);
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.target === knob) {
        drag = { at: point(e), pos: along(el, axis).pos };
        bar.setPointerCapture(e.pointerId);
        bar.setAttribute("data-dragging", "");
      } else {
        const box = knob.getBoundingClientRect();
        const after = point(e) > (y ? box.top : box.left);
        const step = (after ? 0.9 : -0.9) * along(el, axis).view;
        const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        el.scrollBy(y ? { top: step, behavior } : { left: step, behavior });
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const { size, view } = along(el, axis);
      const to = drag.pos + ((point(e) - drag.at) * (size - view)) / Math.max(travel, 1);
      if (y) el.scrollTop = to;
      else el.scrollLeft = to;
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      bar.removeAttribute("data-dragging");
      wake();
    };

    const sizes = new ResizeObserver(schedule);
    // The track too: the page's gets shorter under a header.
    for (const w of [el, bar, ...src.watch, ...(src.parent?.children ?? [])]) sizes.observe(w);
    const children = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) if (node instanceof Element) sizes.observe(node);
      schedule();
    });
    if (src.parent) children.observe(src.parent, { childList: true });
    src.events.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    // Web fonts arriving late change how wide code and tables are.
    document.fonts?.addEventListener("loadingdone", schedule);
    bar.addEventListener("pointerdown", down);
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    layout();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide);
      sizes.disconnect();
      children.disconnect();
      src.events.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
      bar.removeEventListener("pointerdown", down);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
  }, [axis]);

  return { track, thumb };
}

function Bar({
  overlay,
  axis = "y",
  className,
}: {
  overlay: ReturnType<typeof useOverlay>;
  axis?: Axis;
  className?: string;
}) {
  return (
    <div ref={overlay.track} className={cx("sh-scrollbar", className)} data-axis={axis} data-none="" aria-hidden="true">
      <div ref={overlay.thumb} className="sh-scrollbar-thumb" />
    </div>
  );
}

/** The window's scrollbar. Render it once, at the app's root. */
export function PageScrollbar() {
  const overlay = useOverlay(() => {
    const el = document.scrollingElement as HTMLElement | null;
    const root = document.getElementById("root");
    return el && root ? { el, events: window, watch: [], parent: root } : null;
  });
  return <Bar overlay={overlay} className="sh-scrollbar-page" />;
}

interface ScrollAreaProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "aside" | "nav" | "section" | "figure";
  /** Which way the content scrolls: down (the default), or sideways. */
  axis?: Axis;
  /**
   * Names the scrolling box for screen readers and lets the keyboard reach it (Tab, then the arrow keys), as a box
   * that scrolls must be (WCAG 2.1.1). Leave it out where the box holds links or buttons, which reach it themselves.
   */
  label?: string;
  /** A class for the element that scrolls (its padding, a max-height). */
  viewClassName?: string;
  viewRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * A box that scrolls its content, with the overlay scrollbar. The outer element takes `className` and the other
 * props (size and position it like any box, give it a border and background); the content scrolls inside it.
 */
export function ScrollArea({
  as: Tag = "div",
  axis = "y",
  label,
  className,
  viewClassName,
  viewRef,
  children,
  ...rest
}: ScrollAreaProps) {
  const view = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useOverlay(
    () =>
      view.current && content.current ? { el: view.current, events: view.current, watch: [content.current] } : null,
    axis,
  );
  const setView = (el: HTMLDivElement | null) => {
    view.current = el;
    if (typeof viewRef === "function") viewRef(el);
    else if (viewRef) (viewRef as { current: HTMLDivElement | null }).current = el;
  };
  return (
    <Tag className={cx("sh-scroll", className)} data-axis={axis} {...rest}>
      <div className="sh-scroll-frame">
        <div
          ref={setView}
          className={cx("sh-scroll-view", viewClassName)}
          {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
        >
          <div ref={content} className="sh-scroll-content">
            {children}
          </div>
        </div>
        <Bar overlay={overlay} axis={axis} />
      </div>
    </Tag>
  );
}
