// Overlay scrollbars. The native ones are hidden (base.css) and these are drawn over the content instead, so a page
// gaining or losing its scrollbar never changes the layout's width. The thumb fades in while scrolling or hovered,
// drags, and a click on the track pages toward it. `PageScrollbar` follows the window; `ScrollArea` is a box that
// scrolls its own content. Scrolling writes to the DOM directly: no React render per scroll event.
import { type HTMLAttributes, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { cx } from "./Button.tsx";

const MIN_THUMB = 28;
/** How long the thumb stays after the last scroll (ms). */
const LINGER = 900;

interface Source {
  /** The element whose scrollTop moves. */
  el: HTMLElement;
  /** Where its scroll events fire. */
  events: EventTarget;
  /** Elements whose size changes the scroll range… */
  watch: Element[];
  /** …and a parent whose children (as they come and go) do too. */
  parent?: Element;
}

function useOverlay(source: () => Source | null): {
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
    let frame = 0;
    let hide = 0;
    let travel = 0;
    let drag: { y: number; top: number } | null = null;

    const layout = () => {
      frame = 0;
      const range = el.scrollHeight - el.clientHeight;
      bar.toggleAttribute("data-none", range <= 1);
      if (range <= 1) return;
      const room = bar.clientHeight;
      const size = Math.max(MIN_THUMB, (room * el.clientHeight) / el.scrollHeight);
      travel = room - size;
      knob.style.height = `${size}px`;
      knob.style.transform = `translateY(${(Math.min(Math.max(el.scrollTop, 0), range) / range) * travel}px)`;
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

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.target === knob) {
        drag = { y: e.clientY, top: el.scrollTop };
        bar.setPointerCapture(e.pointerId);
        bar.setAttribute("data-dragging", "");
      } else {
        const below = e.clientY > knob.getBoundingClientRect().top;
        el.scrollBy({ top: (below ? 0.9 : -0.9) * el.clientHeight, behavior: "smooth" });
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const range = el.scrollHeight - el.clientHeight;
      el.scrollTop = drag.top + ((e.clientY - drag.y) * range) / Math.max(travel, 1);
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      bar.removeAttribute("data-dragging");
      wake();
    };

    const sizes = new ResizeObserver(schedule);
    for (const w of [el, ...src.watch, ...(src.parent?.children ?? [])]) sizes.observe(w);
    const children = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) if (node instanceof Element) sizes.observe(node);
      schedule();
    });
    if (src.parent) children.observe(src.parent, { childList: true });
    src.events.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
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
      bar.removeEventListener("pointerdown", down);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
  }, []);

  return { track, thumb };
}

function Bar({ overlay, className }: { overlay: ReturnType<typeof useOverlay>; className?: string }) {
  return (
    <div ref={overlay.track} className={cx("sh-scrollbar", className)} data-none="" aria-hidden="true">
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
  as?: "div" | "aside" | "nav";
  children: ReactNode;
}

/**
 * A box that scrolls its content vertically, with the overlay scrollbar. The outer element takes `className` and
 * the other props (size and position it like any box); the content scrolls inside it.
 */
export function ScrollArea({ as: Tag = "div", className, children, ...rest }: ScrollAreaProps) {
  const view = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useOverlay(() =>
    view.current && content.current ? { el: view.current, events: view.current, watch: [content.current] } : null,
  );
  return (
    <Tag className={cx("sh-scroll", className)} {...rest}>
      <div className="sh-scroll-frame">
        <div ref={view} className="sh-scroll-view">
          <div ref={content}>{children}</div>
        </div>
        <Bar overlay={overlay} />
      </div>
    </Tag>
  );
}
