import { useEffect, useState } from "react";
import type { TocEntry } from "../../shared/api.ts";
import { cx } from "../ui/index.ts";

/** "On this page", with the section in view marked. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      let id: string | null = null;
      for (const e of entries) {
        const el = document.getElementById(e.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.3) id = e.id;
      }
      setCurrent(id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [entries]);

  if (entries.length < 2) return null;
  return (
    <section className="ld-toc" aria-label="On this page">
      <h2 className="ld-rail-title">On this page</h2>
      <ul>
        {entries.map((e) => (
          <li key={e.id} data-depth={e.depth}>
            <a href={`#${e.id}`} className={cx(current === e.id && "is-current")}>
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
