// A block at the bottom of a page (questions, suggestions, Changes), folded by default so the page ends quietly. Its
// bar says how many are open. It opens when a link leads into it (`#changes`, `#question-q1`) or `openFoot` asks.
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { cx, Icon } from "../ui/index.ts";

const EVENT = "sh-open-foot";

/** Opens the fold that holds `target` (its id, or the id of something inside it), from a link's click. */
export function openFoot(target: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: target }));
}

export function FootFold({
  id,
  title,
  count,
  tone,
  holds = [],
  className,
  children,
}: {
  id: string;
  className?: string;
  title: string;
  /** "2 open", shown on the bar. */
  count?: string;
  /** The count's color: amber for questions, green for suggestions. */
  tone?: "warn" | "good" | "accent";
  /** Ids inside it that links lead to. */
  holds?: string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const body = useId();
  const mine = useRef<(target: string) => boolean>(() => false);
  mine.current = (target) => target === id || holds.includes(target);

  // A link into it, from this page or another one; only when the link changes, so folding it again sticks.
  const { hash } = useLocation();
  // What a link led to inside it, which couldn't be scrolled to while it was folded.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const target = decodeURIComponent(hash.slice(1));
    if (!mine.current(target)) return;
    setOpen(true);
    if (target !== id) pending.current = target;
  }, [hash, id]);
  useEffect(() => {
    if (!open || !pending.current) return;
    document.getElementById(pending.current)?.scrollIntoView({ block: "start" });
    pending.current = null;
  }, [open]);
  // A link on this page to it (`#suggestions` under the title), even when the address already ends in it.
  useEffect(() => {
    const onOpen = (e: Event) => {
      if (mine.current((e as CustomEvent<string>).detail)) setOpen(true);
    };
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a[href^='#']")?.getAttribute("href");
      if (href && mine.current(decodeURIComponent(href.slice(1)))) setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(EVENT, onOpen);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <section className={cx("sh-foot-block sh-foot-fold", className)} id={id} data-open={open || undefined}>
      <h2 className="sh-foot-fold-title">
        <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)}>
          <span className="sh-foot-fold-chevron" aria-hidden="true">
            <Icon name="chevronRight" size={16} />
          </span>
          {title}
          {count && (
            <span className="sh-foot-fold-count" data-tone={tone}>
              {count}
            </span>
          )}
        </button>
      </h2>
      {/* Kept while folded, so a change being written survives folding it. */}
      <div id={body} className="sh-foot-fold-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
