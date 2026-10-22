// How far down the page the reader is: a thin bar along the header's bottom edge. Scrolling writes to the DOM
// directly, without a React render per scroll event.
import { useEffect, useRef } from "react";

export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.scrollingElement;
    const fill = bar.current;
    if (!el || !fill) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = el.scrollHeight - el.clientHeight;
      // A page that barely scrolls has nothing to show.
      fill.parentElement?.toggleAttribute("data-none", range < 240);
      fill.style.transform = `scaleX(${range > 0 ? Math.min(1, el.scrollTop / range) : 0})`;
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    const sizes = new ResizeObserver(schedule);
    sizes.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <div className="sh-reading-progress" aria-hidden="true">
      <div ref={bar} />
    </div>
  );
}
