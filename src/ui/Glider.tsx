// A highlight that glides between the items of the element it's put in, so a list moves from one thing to the next
// instead of lighting each up on its own. `pointer` follows the pointer, and goes once it's on anything that isn't an
// item (a heading, a tab), staying only across the gaps between items; `current` sits on the item marked as the
// current one (the open page, the open tab, the section being read) and slides when that changes, following it as
// things fold open or closed around it too. The parent must be positioned (`sh-glide-host`); the glider paints under
// the items, and `className` gives it its look.
import { useLayoutEffect, useRef } from "react";
import { cx } from "./Button.tsx";

/**
 * Where `el` sits inside `root`, from layout: an item still sliding in is placed where it's going. A list between them
 * that scrolls (Recently viewed, on a short screen) moves it by what it's scrolled.
 */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
    x -= n.scrollLeft;
    y -= n.scrollTop;
  }
  return { x, y };
}

/**
 * Puts the glider on `target`. It slides only to another item (`moving`): an item that just shifts (the page still
 * loading, a fold opening above it) is followed at once, and after hiding it appears in place instead of sliding
 * over from where it last was.
 */
function place(glider: HTMLElement, root: HTMLElement, target: Element | null, moving: boolean) {
  if (!(target instanceof HTMLElement) || target.closest("[inert]") || !target.offsetHeight) {
    glider.dataset.hidden = "";
    return;
  }
  const { x, y } = offsetIn(target, root);
  const instant = !moving || "hidden" in glider.dataset;
  if (instant) glider.dataset.instant = "";
  glider.style.transform = `translate(${x}px, ${y}px)`;
  glider.style.width = `${target.offsetWidth}px`;
  glider.style.height = `${target.offsetHeight}px`;
  if (instant) {
    void glider.offsetWidth;
    delete glider.dataset.hidden;
    delete glider.dataset.instant;
  }
}

/** What lies between items: the lists themselves, which the pointer crosses going from one item to the next. */
const BETWEEN = "ul, li";

export function Glider({
  follow,
  select,
  className,
}: {
  follow: "pointer" | "current";
  /** The items, as a selector inside the parent. For `current`, the current one (the last match). */
  select: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const glider = ref.current;
    const root = glider?.parentElement;
    if (!glider || !root) return;
    let last: Element | null = null;
    const to = (target: Element | null) => {
      place(glider, root, target, target !== last);
      last = target;
    };
    if (follow === "pointer") {
      const leave = () => {
        glider.dataset.hidden = "";
        last = null;
      };
      const over = (e: PointerEvent) => {
        const target = e.target as Element;
        const item = target.closest(select);
        if (item && root.contains(item)) {
          if (item !== last) to(item);
        } else if (!target.matches(BETWEEN)) leave();
      };
      root.addEventListener("pointerover", over);
      root.addEventListener("pointerleave", leave);
      return () => {
        root.removeEventListener("pointerover", over);
        root.removeEventListener("pointerleave", leave);
      };
    }
    // The current item: found again whenever the list changes (a new page, another tab, a fold), before it's painted.
    // Of several matches, the last (a page both pinned and in the sidebar's tree is marked in the tree).
    const update = () => to([...root.querySelectorAll(select)].at(-1) ?? null);
    update();
    const resized = new ResizeObserver(update);
    resized.observe(root);
    const changed = new MutationObserver(update);
    changed.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "data-folded"],
    });
    root.addEventListener("transitionend", update);
    return () => {
      resized.disconnect();
      changed.disconnect();
      root.removeEventListener("transitionend", update);
    };
  }, [follow, select]);
  return <span ref={ref} className={cx("sh-glide", className)} data-hidden="" aria-hidden="true" />;
}
