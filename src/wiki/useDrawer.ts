// A side panel that slides over the page on narrow screens (the page list, the rail): while it's open, Escape
// closes it, focus moves into it, and when it closes focus goes back to whatever opened it. Where the panel is part
// of the layout (wide screens), nothing changes.
import { useEffect, useRef } from "react";

export function useDrawer(panel: () => HTMLElement | null, open: boolean, close: () => void) {
  const find = useRef(panel);
  find.current = panel;
  const shut = useRef(close);
  shut.current = close;
  useEffect(() => {
    const el = find.current();
    if (!open || !el || getComputedStyle(el).position !== "fixed") return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Once it's visible (it slides in): the page that's open in it, else the first thing to press.
    const frame = requestAnimationFrame(() => {
      const target =
        el.querySelector<HTMLElement>('[aria-current="page"]') ??
        el.querySelector<HTMLElement>('a[href], button:not([disabled]), input, textarea, [tabindex="0"]');
      target?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      shut.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      // Focus was in the panel (or fell to the page as it closed): back to what opened it.
      const inside = el.contains(document.activeElement) || document.activeElement === document.body;
      if (opener?.isConnected && inside) opener.focus({ preventScroll: true });
    };
  }, [open]);
}
