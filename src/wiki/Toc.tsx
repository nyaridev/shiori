import { useEffect, useRef, useState } from "react";
import type { TocEntry } from "../../shared/api.ts";
import { cx, Glider } from "../ui/index.ts";
import { RailSection } from "./RailSection.tsx";

/** Each entry's number, like Wikipedia's: 1, 2 for sections, 1.1, 1.2 for the parts under them. */
export function tocNumbers(entries: TocEntry[]): string[] {
  let major = 0;
  let minor = 0;
  return entries.map((e) => {
    if (e.depth === 2) {
      major++;
      minor = 0;
      return `${major}`;
    }
    minor++;
    return `${Math.max(major, 1)}.${minor}`;
  });
}

/** How far below the window's top a heading counts as the one being read: just under the sticky header. */
const READING_LINE = 80;

/**
 * "On this page", with the section being read marked. A heading is current once it has passed just under the header;
 * at the end of the page, where the last headings can't scroll that far, the last one in view is. A clicked entry
 * stays marked while the page jumps to it, and after, until the reader scrolls on from there. The mark slides from
 * entry to entry as the reader goes; each entry is numbered (1., 1.1) so it's easy to find on the page.
 */
export function Toc({ wikiId, entries }: { wikiId: string; entries: TocEntry[] }) {
  const [current, setCurrent] = useState<string | null>(null);
  // The entry just clicked, held until the reader scrolls away from where it took them.
  const clicked = useRef<string | null>(null);
  const landed = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (clicked.current) {
        // Still on the clicked section: keep it, even where the page can't scroll its heading to the top.
        if (landed.current === null || Math.abs(window.scrollY - landed.current) < 40) return;
        clicked.current = null;
        landed.current = null;
      }
      const el = document.scrollingElement;
      const atEnd = !!el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      let id: string | null = null;
      for (const e of entries) {
        const top = document.getElementById(e.id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= READING_LINE || (atEnd && top < window.innerHeight)) id = e.id;
      }
      setCurrent(id);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(measure);
    };
    // The jump a click started is over: remember where it landed.
    const settle = () => {
      if (clicked.current && landed.current === null) landed.current = window.scrollY;
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", settle);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", settle);
      window.removeEventListener("resize", onScroll);
    };
  }, [entries]);

  if (entries.length < 2) return null;
  const numbers = tocNumbers(entries);
  return (
    <RailSection wikiId={wikiId} id="toc" title="On this page" as="nav">
      <div className="sh-toc-list sh-glide-host">
        <Glider follow="current" select="a.is-current" className="sh-toc-mark" />
        <ul>
          {entries.map((e, i) => (
            <li key={e.id} data-depth={e.depth}>
              <a
                href={`#${e.id}`}
                className={cx(current === e.id && "is-current")}
                aria-current={current === e.id ? "location" : undefined}
                onClick={() => {
                  clicked.current = e.id;
                  landed.current = null;
                  setCurrent(e.id);
                  // A link to where the page already is scrolls nowhere and sends no scrollend.
                  window.setTimeout(() => {
                    if (clicked.current === e.id && landed.current === null) landed.current = window.scrollY;
                  }, 600);
                }}
              >
                <span className="sh-toc-number">{e.depth === 2 ? `${numbers[i]}.` : numbers[i]}</span>
                <span className="sh-toc-text">{e.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </RailSection>
  );
}
